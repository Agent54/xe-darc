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

Run the workerd services with `pnpm dev:services` (the `dev:cdp` command remains
available). The Vite `/mcp` proxy forwards to this worker on port 8787. The worker
keeps the separate CDP routes and stores MCP connection registrations in Durable
Objects. Use a persistent workerd deployment if endpoints must survive restarts.

In Settings → MCP connections, choose **Add new MCP connection**, enter a short
title and identifying description, and create the connection. It receives a unique
HTTP endpoint. Each connection starts with no browser permissions. Copy that
endpoint into an agent's ordinary HTTP MCP configuration, or select it in Darc's
ACP Agent connection settings. An ACP agent only needs to support HTTP MCP servers;
the draft MCP-over-ACP transport is no longer used.

The workerd server origin defaults to the current HTTP(S) app origin, or
`https://localhost:5194` for an isolated web app. Change it under Workerd server
before creating a connection when serving elsewhere. New origins must be reachable
from both the browser and agent. The owning Darc window maintains a private
WebSocket bridge to the worker; browser data and permission decisions stay in Darc.
Closing that window makes tool execution unavailable until it reconnects.

The MCP endpoint uses the current `2026-07-28` protocol revision over stateless
Streamable HTTP, served by `@modelcontextprotocol/server` `2.4.0`. Each request
carries its protocol version, client identity, and capabilities in `params._meta`,
plus the required `MCP-Protocol-Version`, `Mcp-Method`, and applicable `Mcp-Name`
headers. Clients may call `server/discover` or invoke tools directly without an
initialization handshake or session ID. The older 2025 handshake is rejected.
It needs no tool-client bearer token.
Browser control credentials are separate, kept locally, and excluded from exports.
Removing a connection revokes its endpoint, pending requests, and remembered grants.

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

Agent identification from request headers and advertised MCP client information
is displayed where available. It is self-reported information and never controls
permission ownership. Page reads are revalidated after approval; closed, moved,
or navigated tabs cannot receive a stale approval. Cancelling a request or losing
the bridge cancels outstanding prompts. Completed actions are not undone.

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
