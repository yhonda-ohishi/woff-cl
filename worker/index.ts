import { BackendProxy } from "./backend-proxy";

export { BackendProxy };

interface Env {
  BACKEND_PROXY: DurableObjectNamespace;
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

    // Route API requests to the Durable Object
    if (url.pathname.startsWith("/api/")) {
      // Get the Durable Object stub (using a fixed ID for singleton behavior)
      const id = env.BACKEND_PROXY.idFromName("main");
      const stub = env.BACKEND_PROXY.get(id);

      // Remove /api prefix and forward to Durable Object
      const proxyUrl = new URL(request.url);
      proxyUrl.pathname = proxyUrl.pathname.replace(/^\/api/, "");

      const proxyRequest = new Request(proxyUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });

      return stub.fetch(proxyRequest);
    }

    // All other requests return 404 (React app is served via assets)
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
