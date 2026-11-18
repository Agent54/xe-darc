# Agent connection

Darc connects to an externally managed agent using ACP v1 over Streamable HTTP.
Install, launch, and authenticate the agent on its host. If it only supports stdio,
serve it through an external ACP HTTP adapter; Darc does not launch agent processes.

In Settings → Agent connections, add a named connection with the complete HTTP(S) endpoint and an absolute
working directory on the agent host. `/` is the default; use the actual project
directory when needed. Save the connection, then connect from Settings or the Agent sidebar.
Provider login is managed by the agent; there is no ACP bearer-token setting.
Test connection initializes ACP without creating a conversation or sending a prompt.
Click a saved connection card in Settings to edit it. The sidebar dropdown selects
the displayed connection. Each connection keeps its own conversations and browser
permissions; selecting another leaves connected agents and their MCP routes running.

Endpoint and working directory are stored locally until changed or removed.
Previously saved ACP bearer tokens are ignored and remain excluded from exports.
Obsolete provider keys are removed on startup.
Conversation IDs, transcripts, queued messages, and connection intent are saved in
the browser per window and connection, with no expiry. Reloading Darc restores them. They are
excluded from settings exports. Explicit Disconnect stops automatic reconnection
without deleting the saved settings or conversations.

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

Each saved ACP connection receives a browser-owned ID and starts with no browser
permissions. There is no separate MCP setup: the connection's Browser access
section shows its permissions and legacy MCP URL, using that same ID. Agent-issued
conversation session IDs remain separate. Darc registers its browser tools using MCP-over-ACP on the
same ACP connection as the conversation. The owning window executes the tools;
there is no browser WebSocket bridge or workerd dependency for this transport.
Existing MCP entries become agent connection entries in place. The previous ACP
settings attach to their selected identity; IDs and permission scopes are retained.
Entries without an ACP endpoint can be configured in the same screen.

Browser tools require `mcpCapabilities.acp`; agents without it can still chat. For agents that only advertise
HTTP MCP, use the [local ACP proxy](acp-proxy/README.md). It exposes a persistent,
`/mcp/<connection-id>` endpoint and passes that HTTP declaration to the agent.
Tool calls travel back over ACP to the same browser executor and permission store.
The proxy supports both the `2026-07-28` protocol and the older initialization
handshake through the MCP SDK's stateless compatibility mode. Native MCP-over-ACP
agents pass through unchanged. Agents supporting neither transport cannot use
browser tools through this proxy.

After opening a conversation through the proxy, the ACP connection entry displays
and copies the full HTTP URL using the existing connection ID. This URL is also available when
the agent uses native MCP-over-ACP through the proxy. A direct agent connection
without the proxy has no HTTP URL. Connections have no automatic expiry. Darc saves
proxy credentials separately from exportable connection settings. The proxy keeps
only routing information in memory and never writes a connection registry. The
browser registers its saved identities again after reconnecting, so browser reloads
and proxy restarts reuse the same URL. Tool clients use that URL directly,
without a separate MCP token, query parameter, or Authorization header.

Disconnecting ACP cancels pending requests and marks browser tools offline (HTTP
503); it preserves the URL, credentials, and remembered grants. Removing an ACP
connection cancels pending requests, removes its grants, and revokes the endpoint
(HTTP 404). If the proxy is unreachable, Darc saves the revocation and retries at
the next startup or reconnect. The private owner credential required to reconnect
or remove an endpoint is kept in Darc and is never sent to
the downstream agent. Old workerd MCP endpoints are no
longer connected to this browser client. CDP services remain separate.

Tools:

| Tool | Requested permission scope |
| --- | --- |
| `listSpaces` | Space metadata only; `currentOnly: true` limits the result to the current space |
| `listTabs` | Tab metadata for the current tab, its tab group, specified spaces, or explicitly all spaces |
| `openTab` / `displayHtml` | Open in the current group in the foreground, or an agent-created group in the background |
| `activateTab` | Bring an existing tab, its group, and its space into the foreground; separate activation permission |
| `readTabs` | Read one or more tab IDs, the current tab or its group, or tabs in specified spaces |

Always use the smallest scope needed for the task. Both `listTabs` and `readTabs`
default to the focused tab and return arrays. Their scope options are:

| Arguments | Selected tabs |
| --- | --- |
| `{ "current": "tab" }` | Focused tab |
| `{ "current": "tabList" }` | All tabs in the focused tab's group; errors if it has no group |
| `{ "spaceIds": ["space-a", "space-b"] }` | Open tabs in those spaces |
| `{ "spaceIds": "*" }` | Open tabs in all spaces; use only when required by the task |
| `{ "spaceIds": ["space-a"], "tabGroupId": "group:example" }` | One specific group |
| `{ "tabIds": ["tab-a", "tab-b"] }` | Specific tabs (`readTabs` only) |

Do not combine `current` or `tabIds` with other scope options. Empty ID lists,
unknown arguments, and incompatible scopes are rejected. Current selections are
resolved when the call arrives, so changing focus while approving does not switch
the target. Multi-space requests require permission for each requested space;
explicit tab reads require permission for those tabs. All permissions must be
granted before any page content is read.

The former separate space/group listing and reading tools have been removed.
Reconnect agents to refresh their tool definitions.

Tab listing does not grant content access. Listings return IDs that subsequent
scoped calls can use. Reads default to HTML, accept `textOnly: true` for text and
an optional XPath `selector`, and require active frames. New tabs accept HTTP(S)
or `about:newtab`; `displayHtml` creates a data-URL page.

`openTab` and `displayHtml` accept `background` (default `false`), optional
`spaceId` (default current space), and optional `tabGroupId` to constrain the
destination. Foreground opens must target the current group in the current
space. If that group changes while approval is pending, the request fails.
With `background: true`, tabs open without changing focus in a separate group
created for the conversation in that space; later background opens reuse it.
An explicit group ID must match the current group for foreground opens or the
conversation's agent-created group for background opens. Permissions target
that group, including when it is about to be created. Each new conversation or
reconnected browser binding gets its own background group.

Agents should open research, investigation, and intermediate work with
`background: true`, and read those tabs by ID without activating them. Use
foreground opening in the current group only to show something to the user.
`activateTab({ "tabId": "tab-id" })` presents an existing result or fulfills a
user's request to switch tabs. It does not open, move, or read tabs. Listing,
reading, and opening permissions do not grant activation permission. Closed,
moved, or navigated targets invalidate a pending activation request.

Shared workflow guidance is published through the official MCP server
`instructions` field on all transports (native MCP-over-ACP, the HTTP proxy,
and workerd). Tool descriptions document each tool's arguments and behavior.
OpenCode's profile does not inject a duplicate browser system prompt; ACP setup
only registers the MCP connection. Reconnect to refresh server instructions.

Space listings mark the current space with `isActiveSpace`. All tab results
(list, read, and open) include `isActiveSpace`, `isActiveTabGroup` (the current
group in the current space), `isActiveTab` (the focused tab), and
`isActiveInTabGroup` (the selected tab within its group, including inactive
groups and spaces). Tabs outside a group have both group flags set to false.
These markers use the browser's current window state when the operation runs.

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
runs at a time per connection; further messages queue. Stop sends
`session/cancel` and pauses the queue. If cancellation does not finish within five
seconds, Darc closes the transport. Connection loss never automatically resubmits a
prompt or repeats a browser action. Darc reconnects automatically with bounded
backoff, initializes a new ACP transport, and reloads its saved sessions and MCP
bindings. Queued prompts stay paused until explicitly resumed. Disconnect stops
retrying; page reload preserves whether the connection was enabled.

An existing conversation can reattach only when the same endpoint and working
directory support `loadSession`. Otherwise start a new conversation; its old
transcript stays viewable. ACP v1 does not replay messages lost during a disconnect,
so the retained transcript may be incomplete. Changing a connection's endpoint,
working directory, or credentials disconnects its old transport, cancels its
approvals, and clears its queued messages. Other connections remain active.

References: [ACP SDK](https://www.npmjs.com/package/@agentclientprotocol/sdk),
[HTTP examples](https://github.com/agentclientprotocol/typescript-sdk/tree/main/src/examples),
[MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http).
