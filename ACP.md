# Agent connection

Darc connects to an externally managed agent using ACP v1 over Streamable HTTP.
Install, launch, and authenticate the agent on its host. If it only supports stdio,
serve it through an external ACP HTTP adapter; Darc does not launch agent processes.

In Settings → Agent connection, enter the complete HTTP(S) endpoint and an absolute
working directory on the agent host. `/` is the default; use the actual project
directory when needed. An optional bearer token authenticates the HTTP connection,
not a model provider. Save the connection, then connect in the Agent sidebar.
Test connection initializes ACP without creating a conversation or sending a prompt.

Endpoint, working directory, and bearer token are stored locally until changed or
removed. Credentials are excluded from exports. Existing session-only ACP tokens
are migrated on read. Obsolete provider keys are removed on startup.
Conversations live in memory for the current window;
closing the sidebar preserves them, but reloading the app does not.

The original agent sidebar controls and the shared microphone toggle remain in
place. `Agent.svelte` stays mounted while voice controls are enabled, including
when the sidebar is closed. Voice input is a UI scaffold until an external audio
adapter is connected; enabling it does not start the removed ElevenLabs runtime
or request microphone access. Feedback and edits to displayed messages are local
to the transcript and do not resend or modify an ACP agent's conversation.

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

## Browser MCP connections

In Settings → MCP connections, choose **Add new MCP connection**, enter a short
title and optional description, and create the connection. It receives a unique
identity and starts with no browser permissions. Select that identity in Agent
connection settings. Darc registers its browser tools using MCP-over-ACP on the
same ACP connection as the conversation. The owning window executes the tools;
there is no browser WebSocket bridge or workerd dependency for this transport.
Existing connection identities and permission scopes are retained on upgrade.

The agent must advertise `mcpCapabilities.acp`. For agents that only advertise
HTTP MCP, use the [local ACP proxy](acp-proxy/README.md). It exposes a persistent,
`/mcp/<connection-id>` endpoint and passes that HTTP declaration to the agent.
Tool calls travel back over ACP to the same browser executor and permission store.
The proxy supports both the `2026-07-28` protocol and the older initialization
handshake through the MCP SDK's stateless compatibility mode. Native MCP-over-ACP
agents pass through unchanged. Agents supporting neither transport cannot use
browser tools through this proxy.

After opening a conversation through the proxy, the MCP connection entry displays
and copies the full HTTP URL using the existing connection ID. This URL is also available when
the agent uses native MCP-over-ACP through the proxy. A direct agent connection
without the proxy has no HTTP URL. Connections have no automatic expiry. Darc saves
proxy credentials separately from exportable connection settings, and the proxy
persists its registry in `acp-proxy/data/mcp-connections.json`. Reconnects, browser
reloads, and proxy restarts reuse the same URL. Tool clients use that URL directly,
without a separate MCP token, query parameter, or Authorization header.

Disconnecting ACP cancels pending requests and marks browser tools offline (HTTP
503); it preserves the URL, credentials, and remembered grants. Removing an MCP
connection cancels pending requests, removes its grants, and revokes the endpoint
(HTTP 404). If the proxy is unreachable, Darc saves the revocation and retries at
the next startup or reconnect. The private owner credential required to reconnect
or remove an endpoint is kept in Darc and is never sent to
the downstream agent. Old workerd MCP endpoints are no
longer connected to this browser client. CDP services remain separate.

Tools:

| Tool | Requested permission scope |
| --- | --- |
| `listSpaces` | List all spaces |
| `listTabs` | List tab metadata across all spaces |
| `listSpaceTabs` | List tab metadata in one space |
| `listTabGroupTabs` | List tab metadata in one tab group |
| `openTab` / `displayHtml` | Open tabs in a specified space or tab group |
| `readTab` | Read one tab; the user may expand approval to its group or space |
| `readSpaceTabs` / `readTabGroupTabs` | Read tabs in the specified space or group |

Tab listing does not grant content access. Listings return IDs that subsequent
scoped calls can use. Reads default to HTML, accept `textOnly: true` for text and
an optional XPath `selector`, and require active frames. New tabs accept HTTP(S)
or `about:newtab`; `displayHtml` creates a data-URL page.

All access uses the existing permission store, Resources panel, and permission
toasts, with Allow once, Allow until closing this window, Always allow, Deny,
Ignore, and Change. Remembered grants belong to the MCP connection identity and
the action/target scope. More specific decisions take precedence over broader
ones. Scoped grants never cross connection identities. The Settings connection
entry also shows its requests and grants.

Agent identification from ACP and advertised MCP client information is displayed
where available. It is self-reported information and never controls
permission ownership. Page reads are revalidated after approval; closed, moved,
or navigated tabs cannot receive a stale approval. Cancelling a request or losing
the ACP connection cancels outstanding prompts. Completed actions are not undone.

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

References: [ACP SDK](https://www.npmjs.com/package/@agentclientprotocol/sdk),
[HTTP examples](https://github.com/agentclientprotocol/typescript-sdk/tree/main/src/examples),
[MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http).
