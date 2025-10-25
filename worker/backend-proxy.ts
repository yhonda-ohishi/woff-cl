export class BackendProxy implements DurableObject {
  private state: DurableObjectState;
  private backendUrl: string | null = null;

  constructor(state: DurableObjectState) {
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

    // Proxy all other requests to the backend
    if (!this.backendUrl) {
      this.backendUrl = await this.state.storage.get("backendUrl") as string | null;
    }

    if (!this.backendUrl) {
      return Response.json({ error: "Backend URL not configured" }, { status: 503 });
    }

    // Build the target URL
    const targetUrl = new URL(pathname + url.search, this.backendUrl);

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
      return response;
    } catch (error) {
      return Response.json(
        { error: "Failed to connect to backend", details: String(error) },
        { status: 502 }
      );
    }
  }
}
