# Agent connection

Darc connects to an externally managed agent using ACP v1 over Streamable HTTP.
Install, launch, and authenticate the agent on its host. If it only supports stdio,
serve it through an external ACP HTTP adapter; Darc does not launch agent processes.

In Settings → Agent connection, enter the complete HTTP(S) endpoint and an absolute
working directory on the agent host. `/` is the default; use the actual project
directory when needed. An optional bearer token authenticates the HTTP connection,
not a model provider. Save the connection, then connect in the Agent sidebar.
Test connection initializes ACP without creating a conversation or sending a prompt.

Endpoint and working directory are stored locally. The bearer token uses session
storage and is excluded from exports. Existing provider keys and model selections
are removed on startup. Conversations live in memory for the current window;
closing the sidebar preserves them, but reloading the app does not.

## HTTP host requirements

- Implement the SDK's ACP Streamable HTTP transport (JSON-RPC POST, connection and
  session SSE GET streams, DELETE cleanup). A generic JSON chat endpoint or MCP
  endpoint is not an ACP endpoint.
- For cross-origin access, allow Darc's exact origin, credentials, GET/POST/DELETE,
  Content-Type, Authorization, Acp-Connection-Id, and Acp-Session-Id. Expose the ACP
  response headers, especially Acp-Connection-Id. Apply the same policy to errors
  and preflight responses. The host must validate origins and authenticate callers.
- Disable response buffering for SSE. HTTP/2 is preferable when serving many
  simultaneous streams. Supply HTTPS where the browser's mixed-content or local
  network policy requires it; Darc does not bypass browser network restrictions.
- Authenticate the agent itself outside Darc. Interactive terminal/OAuth agent
  login is not implemented by this browser client. Darc advertises no filesystem
  or terminal capabilities; agents must provide their own execution environment.

## Browser tools

The client uses `@agentclientprotocol/sdk` 2.4.0 and its v1 `/unstable` entrypoint
to opt into MCP-over-ACP. Both the HTTP transport and MCP-over-ACP are experimental;
ACP v2 is not required. The external agent must advertise
`agentCapabilities.mcpCapabilities.acp: true` and consume the declared `type: acp`
MCP server. This binding targets MCP 2026-07-28, not older MCP revisions.

The browser provides `listTabs`, `readPageContent`, `openNewTab`, and `displayHtml`.
Context is captured when a prompt is queued. Tab listing and reads are limited to
that selection. Reads default to text; `textOnly: false` returns HTML, and `selector`
is an optional XPath. Page reads require an active frame and fail if the tab has
closed, moved, or navigated while awaiting approval. New tabs open in the captured
space. `openNewTab` accepts HTTP(S) URLs or `about:newtab`; `displayHtml` creates a
data-URL tab containing the supplied HTML.

Page reads and tab creation require local approval. Agent permission requests use
the exact options supplied by the agent and do not substitute for browser-tool
approval. Cancellation declines pending approvals; completed actions are not undone.

An endpoint without MCP-over-ACP can still chat and receive selected tab metadata.
For agents without this capability, the alternative is an external MCP browser
bridge. It adds a listener/service and is not included here. Real-time voice is
also outside this integration; the old ElevenLabs path has been removed.

## Sessions and recovery

The agent supplies model/mode/configuration choices and slash commands. One prompt
runs at a time; further messages queue with their captured context. Stop sends
`session/cancel` and pauses the queue. If cancellation does not finish within five
seconds, Darc closes the transport. Connection loss never automatically resubmits a
prompt or repeats a browser action. Reconnect and resume the queue deliberately.

An existing conversation can reattach only when the same endpoint and working
directory support `loadSession`. Otherwise start a new conversation; its old
transcript stays viewable. ACP v1 does not replay messages lost during a disconnect,
so the retained transcript may be incomplete. Saving connection settings disconnects
the old transport, cancels approvals, and clears queued messages.

The separate CDP worker remains available with `pnpm dev:cdp` on port 8787.

References: [ACP SDK](https://www.npmjs.com/package/@agentclientprotocol/sdk),
[HTTP examples](https://github.com/agentclientprotocol/typescript-sdk/tree/main/src/examples),
[MCP-over-ACP](https://agentclientprotocol.com/rfds/mcp-over-acp).
