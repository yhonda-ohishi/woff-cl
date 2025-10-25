import { createPromiseClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { AuthService } from "../gen/auth/v1/auth_connect";

// Use /api/ endpoint which will be proxied through Durable Object to backend
const transport = createConnectTransport({
  baseUrl: "/api",
});

export const authClient = createPromiseClient(AuthService, transport);
