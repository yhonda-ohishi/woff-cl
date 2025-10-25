import { createPromiseClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { AuthService } from "../gen/auth/v1/auth_connect";

const transport = createConnectTransport({
  baseUrl: import.meta.env.VITE_API_URL || "http://localhost:50051",
});

export const authClient = createPromiseClient(AuthService, transport);
