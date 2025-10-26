interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'join' | 'leave';
  from?: string;
  to?: string;
  sdp?: any;
  candidate?: any;
}

export class WebRTCSignaling implements DurableObject {
  private state: DurableObjectState;
  private sessions: Map<string, { userId: string; userName: string }> = new Map();

  constructor(state: DurableObjectState, _env?: any) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Get room participant count
    if (url.pathname === "/room-count" && request.method === "GET") {
      const roomId = url.searchParams.get("roomId");
      if (!roomId) {
        return Response.json({ error: "Missing roomId" }, { status: 400 });
      }

      // Count only participant connections in this room (exclude monitors)
      const sockets = this.state.getWebSockets();
      let count = 0;
      sockets.forEach((ws) => {
        const tags = this.state.getTags(ws);
        const [, , wsRoomId, connectionType] = tags;
        if (wsRoomId === roomId && connectionType !== 'monitor') {
          count++;
        }
      });

      return Response.json({ roomId, count });
    }

    // WebSocket endpoint for signaling
    if (url.pathname === "/connect" && request.headers.get("Upgrade") === "websocket") {
      const userId = url.searchParams.get("userId");
      const userName = url.searchParams.get("userName");
      const roomId = url.searchParams.get("roomId");

      if (!userId || !userName || !roomId) {
        return new Response("Missing required parameters", { status: 400 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // Determine if this is a monitor connection
      const isMonitor = userId.startsWith('monitor-');

      // Use hibernatable WebSocket
      this.state.acceptWebSocket(server, [userId, userName, roomId, isMonitor ? 'monitor' : 'participant']);

      // Store session info
      this.sessions.set(userId, { userId, userName });

      // Notify others in the room
      this.broadcastToRoom(roomId, {
        type: 'join',
        from: userId,
      }, userId);

      // Send current participants to the new user
      const participants = Array.from(this.sessions.values()).filter(s => s.userId !== userId);
      server.send(JSON.stringify({
        type: 'participants',
        participants: participants,
      }));

      // Broadcast room count update to all clients in the room
      this.broadcastRoomCount(roomId);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    return new Response("Not found", { status: 404 });
  }

  private broadcastToRoom(roomId: string, message: SignalingMessage, excludeUserId?: string) {
    const sockets = this.state.getWebSockets();
    const messageStr = JSON.stringify(message);

    sockets.forEach((ws) => {
      const tags = this.state.getTags(ws);
      const [userId, , wsRoomId] = tags;

      if (wsRoomId === roomId && userId !== excludeUserId) {
        try {
          ws.send(messageStr);
        } catch (error) {
          console.error('Failed to send message:', error);
        }
      }
    });
  }

  private sendToUser(userId: string, message: SignalingMessage) {
    const sockets = this.state.getWebSockets();
    const messageStr = JSON.stringify(message);

    sockets.forEach((ws) => {
      const tags = this.state.getTags(ws);
      const [wsUserId] = tags;

      if (wsUserId === userId) {
        try {
          ws.send(messageStr);
        } catch (error) {
          console.error('Failed to send message to user:', error);
        }
      }
    });
  }

  private broadcastRoomCount(roomId: string) {
    const sockets = this.state.getWebSockets();
    let count = 0;

    // Count only participant connections in the room (exclude monitors)
    sockets.forEach((ws) => {
      const tags = this.state.getTags(ws);
      const [, , wsRoomId, connectionType] = tags;
      if (wsRoomId === roomId && connectionType !== 'monitor') {
        count++;
      }
    });

    // Broadcast to all clients in the room (including monitors)
    const message = JSON.stringify({
      type: 'room-count-update',
      roomId: roomId,
      count: count,
    });

    sockets.forEach((ws) => {
      const tags = this.state.getTags(ws);
      const [, , wsRoomId] = tags;
      if (wsRoomId === roomId) {
        try {
          ws.send(message);
        } catch (error) {
          console.error('Failed to broadcast room count:', error);
        }
      }
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    try {
      const data = JSON.parse(message as string) as SignalingMessage;
      const tags = this.state.getTags(ws);
      const [fromUserId, , roomId] = tags;

      // Add sender info
      data.from = fromUserId;

      // Route message based on type
      switch (data.type) {
        case 'offer':
        case 'answer':
        case 'ice-candidate':
          // Send to specific user if 'to' is specified, otherwise broadcast to room
          if (data.to) {
            this.sendToUser(data.to, data);
          } else {
            this.broadcastToRoom(roomId, data, fromUserId);
          }
          break;

        default:
          console.warn('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, _reason: string, _wasClean: boolean) {
    const tags = this.state.getTags(ws);
    const [userId, , roomId] = tags;

    // Remove from sessions
    this.sessions.delete(userId);

    // Notify others in the room
    this.broadcastToRoom(roomId, {
      type: 'leave',
      from: userId,
    });

    // Broadcast room count update to all clients in the room
    this.broadcastRoomCount(roomId);

    ws.close(code, "User disconnected");
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    console.error("WebSocket error:", error);
    ws.close(1011, "WebSocket error");
  }
}
