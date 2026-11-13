import * as acp from "@agentclientprotocol/sdk/unstable";
import { createHttpStream } from "@agentclientprotocol/sdk/experimental/http-client";

const endpoint = "https://localhost:7331/acp";
let reply = "";
const peer = acp.client({ name: "darc-proxy-smoke" })
  .onNotification(acp.methods.client.session.update, ({ params }) => {
    const update = params.update;
    if (
      update.sessionUpdate === "agent_message_chunk" &&
      update.content.type === "text"
    ) {
      reply += update.content.text;
    }
  })
  .onRequest(acp.methods.client.session.requestPermission, () => ({
    outcome: { outcome: "cancelled" },
  }))
  .connect(createHttpStream(endpoint));
const timeout = setTimeout(
  () => peer.close(new Error("Smoke test timed out")),
  Deno.args.length ? 120000 : 30000,
);
try {
  const initialized = await peer.agent.request(acp.methods.agent.initialize, {
    protocolVersion: acp.PROTOCOL_VERSION,
    clientCapabilities: {},
  });
  if (initialized.protocolVersion !== acp.PROTOCOL_VERSION) {
    throw new Error(`Unexpected ACP version: ${initialized.protocolVersion}`);
  }
  console.log("Initialized:", initialized.agentInfo);
  const session = await peer.agent.request(acp.methods.agent.session.new, {
    cwd: decodeURIComponent(new URL("../", import.meta.url).pathname),
    mcpServers: [],
  });
  if (!session.sessionId) throw new Error("Missing session ID");
  console.log("Session:", session.sessionId);
  if (Deno.args[0]) {
    const result = await peer.agent.request(acp.methods.agent.session.prompt, {
      sessionId: session.sessionId,
      prompt: [{ type: "text", text: Deno.args[0] }],
    });
    if (!reply.trim()) throw new Error("No streamed text received");
    console.log("Reply:", reply);
    console.log(
      "PASS: streamed prompt response, stop reason:",
      result.stopReason,
    );
  } else {
    console.log(
      "PASS: HTTPS initialize, SSE session response; no prompt sent.",
    );
  }
} finally {
  clearTimeout(timeout);
  peer.close();
  await peer.closed;
}
