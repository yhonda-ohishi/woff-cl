export class BackendProxy implements DurableObject {
  private state: DurableObjectState;
  private backendUrl: string | null = null;

  constructor(state: DurableObjectState, _env: any) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Set backend URL endpoint
    if (pathname === "/set-backend-url" && request.method === "POST") {
      try {
        const body = await request.json() as { url: string };
        this.backendUrl = body.url;
        await this.state.storage.put("backendUrl", this.backendUrl);

        // Notify all hibernating WebSocket clients
        const sockets = this.state.getWebSockets();
        const message = JSON.stringify({
          type: 'backend-connected',
          url: this.backendUrl,
          timestamp: new Date().toISOString(),
        });

        sockets.forEach((ws) => {
          try {
            ws.send(message);
            ws.close(1000, 'Backend connected');
          } catch (error) {
            console.error('Failed to send WebSocket message:', error);
          }
        });

        return Response.json({ success: true, url: this.backendUrl });
      } catch (error) {
        return Response.json({ error: "Invalid request body" }, { status: 400 });
      }
    }

    // Get current backend URL endpoint
    if (pathname === "/get-backend-url" && request.method === "GET") {
      if (!this.backendUrl) {
        this.backendUrl = await this.state.storage.get("backendUrl") as string | null;
      }
      return Response.json({ url: this.backendUrl });
    }

    // WebSocket endpoint to wait for backend connection (hibernatable)
    if (pathname === "/wait-for-backend" && request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // Use ctx.acceptWebSocket for hibernation support
      this.state.acceptWebSocket(server);

      // Always send waiting status - client only connects when backend is disconnected
      server.send(JSON.stringify({
        type: 'waiting',
        message: 'Waiting for backend to connect',
        timestamp: new Date().toISOString(),
      }));

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    // Proxy all other requests to the backend
    if (!this.backendUrl) {
      this.backendUrl = await this.state.storage.get("backendUrl") as string | null;
    }

    if (!this.backendUrl) {
      return Response.json({ error: "Backend URL not configured" }, { status: 503 });
    }

    // Build the target URL
    const targetUrl = new URL(pathname + url.search, this.backendUrl);

    // Log proxy request for debugging
    console.log(`[BackendProxy] Proxying ${request.method} ${pathname} to ${targetUrl.toString()}`);

    // Forward the request to the backend
    const headers = new Headers(request.headers);
    headers.set("X-Forwarded-For", request.headers.get("CF-Connecting-IP") || "");
    headers.set("X-Forwarded-Proto", url.protocol.slice(0, -1));
    headers.set("X-Forwarded-Host", url.host);

    const proxyRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers: headers,
      body: request.body,
    });

    try {
      const response = await fetch(proxyRequest);
      console.log(`[BackendProxy] Response: ${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      console.error(`[BackendProxy] Fetch error:`, error);
      return Response.json(
        { error: "Failed to connect to backend", details: String(error) },
        { status: 502 }
      );
    }
  }

  // Hibernatable WebSocket handlers
  async webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer) {
    // Handle any messages from clients (optional, can be empty)
    // Clients are just waiting, so we don't expect messages
  }

  async webSocketClose(ws: WebSocket, code: number, _reason: string, _wasClean: boolean) {
    // Cleanup when client disconnects (automatically handled by runtime)
    ws.close(code, "Client disconnected");
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    // Handle WebSocket errors
    console.error("WebSocket error:", error);
    ws.close(1011, "WebSocket error");
  }
}
