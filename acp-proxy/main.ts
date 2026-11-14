import { AcpServer } from "@agentclientprotocol/sdk/experimental/server";
import { createMcpGateway } from "./mcp-gateway.ts";
import { createOpenCodeAgent } from "./opencode.ts";

const gateway = createMcpGateway("https://localhost:7331");

// Add a custom Darc origin with: deno task start isolated-app://your-app-id
const origins = new Set([
  "isolated-app://cjmvvyipbvzrcsssdqwerai5ohqiwkuyf6jf4jonrwdzucmc3d2aaaic",
  "http://localhost:5194",
  "https://localhost:5194",
  "http://127.0.0.1:5194",
  "https://127.0.0.1:5194",
  ...Deno.args,
]);

const openCode = createOpenCodeAgent(gateway);
const acp = new AcpServer({ agent: openCode });

const server = Deno.serve(
  {
    hostname: "127.0.0.1",
    port: 7331,
    cert: await Deno.readTextFile(
      new URL("../certs/localhost.crt", import.meta.url),
    ),
    key: await Deno.readTextFile(
      new URL("../certs/device.key", import.meta.url),
    ),
  },
  async (request) => {
    const url = new URL(request.url);
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
      return new Response("Invalid host", { status: 403 });
    }
    if (url.pathname !== "/acp" && !url.pathname.startsWith("/mcp/")) {
      return new Response("Not found", {
        status: 404,
      });
    }
    const origin = request.headers.get("Origin");
    if (origin && !origins.has(origin)) {
      console.warn(`Rejected ACP origin: ${origin}`);
      return new Response("Origin not allowed", { status: 403 });
    }
    const headers = new Headers({
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, Acp-Connection-Id, Acp-Session-Id, MCP-Protocol-Version, Mcp-Method, Mcp-Name",
      "Access-Control-Expose-Headers": "Acp-Connection-Id, Acp-Session-Id, MCP-Protocol-Version",
      "Vary": "Origin",
    });
    if (origin) headers.set("Access-Control-Allow-Origin", origin);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers,
      });
    }
    let response: Response;
    try {
      if (url.pathname === "/acp" && request.method === "POST" &&
        !request.headers.has("Acp-Connection-Id") && openCode.busy) {
        response = new Response("This proxy already has an ACP client connected", { status: 409 });
      } else {
        response = url.pathname === "/acp" ? await acp.handleRequest(request) : await gateway.fetch(request);
      }
    } catch (error) {
      console.error(error);
      response = new Response("ACP proxy error; see terminal", { status: 502 });
    }
    for (const [key, value] of headers) response.headers.set(key, value);
    response.headers.set("X-Accel-Buffering", "no");
    return response;
  },
);

const shutdown = async () => {
  await acp.close();
  await server.shutdown();
};
Deno.addSignalListener("SIGINT", shutdown);
Deno.addSignalListener("SIGTERM", shutdown);
console.log("OpenCode ACP: https://localhost:7331/acp");
