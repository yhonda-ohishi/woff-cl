import { BackendProxy } from "./backend-proxy";
import { WebRTCSignaling } from "./webrtc-signaling";

export { BackendProxy, WebRTCSignaling };

interface Env {
  BACKEND_PROXY: DurableObjectNamespace;
  WEBRTC_SIGNALING: DurableObjectNamespace;
  BACKEND_SECRET?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Backend registration endpoint (authenticated with secret)
    if (url.pathname === "/register-backend" && request.method === "POST") {
      // Validate secret
      const authHeader = request.headers.get("Authorization");
      const expectedSecret = env.BACKEND_SECRET || "dev-secret-123";

      if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      try {
        const body = await request.json() as { url: string };

        if (!body.url) {
          return Response.json({ error: "Missing url in request body" }, { status: 400 });
        }

        // Set backend URL in Durable Object
        const id = env.BACKEND_PROXY.idFromName("main");
        const stub = env.BACKEND_PROXY.get(id);

        const setUrlRequest = new Request("http://internal/set-backend-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: body.url }),
        });

        const response = await stub.fetch(setUrlRequest);
        return response;
      } catch (error) {
        return Response.json({ error: "Invalid request" }, { status: 400 });
      }
    }

    // Get backend URL endpoint (authenticated with secret)
    if (url.pathname === "/get-backend-url" && request.method === "GET") {
      // Validate secret
      const authHeader = request.headers.get("Authorization");
      const expectedSecret = env.BACKEND_SECRET || "dev-secret-123";

      if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      try {
        // Get backend URL from Durable Object
        const id = env.BACKEND_PROXY.idFromName("main");
        const stub = env.BACKEND_PROXY.get(id);

        const getUrlRequest = new Request("http://internal/get-backend-url", {
          method: "GET",
        });

        const response = await stub.fetch(getUrlRequest);
        return response;
      } catch (error) {
        return Response.json({ error: "Failed to get backend URL" }, { status: 500 });
      }
    }

    // WebSocket endpoint to wait for backend connection (authenticated with secret)
    if (url.pathname === "/wait-for-backend" && request.headers.get("Upgrade") === "websocket") {
      // Validate secret from query parameter or header
      const authHeader = request.headers.get("Authorization");
      const secretParam = url.searchParams.get("secret");
      const expectedSecret = env.BACKEND_SECRET || "dev-secret-123";

      const providedSecret = authHeader?.replace("Bearer ", "") || secretParam;

      if (!providedSecret || providedSecret !== expectedSecret) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      try {
        // Forward WebSocket upgrade to Durable Object
        const id = env.BACKEND_PROXY.idFromName("main");
        const stub = env.BACKEND_PROXY.get(id);

        const wsRequest = new Request("http://internal/wait-for-backend", {
          headers: request.headers,
        });

        return stub.fetch(wsRequest);
      } catch (error) {
        return Response.json({ error: "Failed to establish WebSocket connection" }, { status: 500 });
      }
    }

    // WebRTC room count endpoint
    if (url.pathname === "/api/webrtc-room-count" && request.method === "GET") {
      const roomId = url.searchParams.get("roomId");

      if (!roomId) {
        return Response.json({ error: "Room ID is required" }, { status: 400 });
      }

      // Get Durable Object for this room
      const id = env.WEBRTC_SIGNALING.idFromName(roomId);
      const stub = env.WEBRTC_SIGNALING.get(id);

      // Forward request to Durable Object
      const countUrl = new URL(request.url);
      countUrl.pathname = "/room-count";

      const countRequest = new Request(countUrl.toString(), {
        method: "GET",
      });

      return stub.fetch(countRequest);
    }

    // WebRTC signaling endpoint
    if (url.pathname.startsWith("/webrtc/")) {
      const roomId = url.pathname.replace(/^\/webrtc\//, "");

      if (!roomId) {
        return Response.json({ error: "Room ID is required" }, { status: 400 });
      }

      // Get Durable Object for this room
      const id = env.WEBRTC_SIGNALING.idFromName(roomId);
      const stub = env.WEBRTC_SIGNALING.get(id);

      // Forward WebSocket upgrade to Durable Object
      const signalingUrl = new URL(request.url);
      signalingUrl.pathname = "/connect";

      const signalingRequest = new Request(signalingUrl.toString(), {
        method: request.method,
        headers: request.headers,
      });

      return stub.fetch(signalingRequest);
    }

    // Route API requests to the Durable Object
    if (url.pathname.startsWith("/api/")) {
      // Handle CORS preflight
      if (request.method === "OPTIONS") {
        const origin = request.headers.get("Origin") || "https://ohishi-pwa-woff.mtamaramu.com";
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, Connect-Protocol-Version, Connect-Timeout-Ms",
            "Access-Control-Max-Age": "86400",
          },
        });
      }

      // Get the Durable Object stub (using a fixed ID for singleton behavior)
      const id = env.BACKEND_PROXY.idFromName("main");
      const stub = env.BACKEND_PROXY.get(id);

      // Check if this is a Connect-Web gRPC request or REST API
      // Connect-Web paths: /api/auth.v1.AuthService/... -> remove /api prefix
      // REST API paths: /api/recordings/upload -> keep /api prefix
      const proxyUrl = new URL(request.url);
      if (url.pathname.match(/^\/api\/[a-z]+\.v\d+\./)) {
        // Connect-Web gRPC path - remove /api prefix
        proxyUrl.pathname = url.pathname.replace(/^\/api/, "");
      }
      // Otherwise keep the path as-is (REST API endpoints keep /api prefix)

      const proxyRequest = new Request(proxyUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });

      const response = await stub.fetch(proxyRequest);

      // Clone response and add CORS headers
      const origin = request.headers.get("Origin") || "https://ohishi-pwa-woff.mtamaramu.com";
      const newHeaders = new Headers(response.headers);
      newHeaders.set("Access-Control-Allow-Origin", origin);
      newHeaders.set("Access-Control-Allow-Credentials", "true");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }

    // All other requests return 404 (React app is served via assets)
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
