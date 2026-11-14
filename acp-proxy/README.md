# OpenCode ACP proxy demo

Requires Deno and OpenCode v2 on PATH (tested with 2.3.0). This proxy uses a
private OpenCode profile in the git-ignored `acp-proxy/data/opencode/` directory.
If prompts report "provider authentication required", run `deno task login`
from this folder before connecting. Provider API keys from the environment
remain available; the profile does not reuse your normal OpenCode login/config.

```sh
cd acp-proxy
deno task start
```

In Darc's Agent connection settings:

- Endpoint: `https://localhost:7331/acp`
- Working directory: ignored by this restricted proxy; it uses its private workspace
- Bearer token: leave empty

HTTPS uses the same `../certs/localhost.crt` and `../certs/device.key` as Darc's
Vite server. Your browser must trust the project's `../certs/rootCA.pem`. Use
`localhost`: the existing certificate does not cover `127.0.0.1`. The smoke task
trusts this CA explicitly and keeps certificate verification enabled.

On macOS, trust the local CA once for SSL in your login keychain (run from this
folder; macOS may ask for your password):

```sh
security add-trusted-cert -r trustRoot -p ssl \
  -k "$HOME/Library/Keychains/login.keychain-db" ../certs/rootCA.pem
```

Reload Darc after trusting the CA. If Chrome retains the certificate error,
restart Chrome. A passing smoke test alone does not confirm browser trust
because that test supplies the CA explicitly.

The default browser origins are HTTP/HTTPS localhost and 127.0.0.1 on port 5194,
plus Darc's installed app origin
`isolated-app://cjmvvyipbvzrcsssdqwerai5ohqiwkuyf6jf4jonrwdzucmc3d2aaaic`. For
another origin, including an isolated web app, pass its exact origin:

```sh
deno task start isolated-app://your-app-id
```

If Darc itself is served from another origin, pass that exact origin when starting
the proxy. For example, for a Darc development server on port 6000:

```sh
deno task start http://127.0.0.1:6000
```

The origin is the requesting browser page's scheme, host, and port. Match it to
Darc's actual address before adding it; unrelated local tools can also make
requests to the proxy. A rejected request from Darc cannot register browser tools.

In another terminal, run `deno task smoke` from this folder. It initializes the
real OpenCode agent and creates a session over HTTPS/SSE without sending a
prompt. `deno task check` type-checks both scripts.

To also verify a streamed model reply using your configured provider:

```sh
deno task smoke "Reply exactly ACP_PROXY_OK. Do not use tools."
```

The official SDK's `AcpServer` handles ACP HTTP routing. The proxy supports one
active ACP client and one private `opencode acp` process. OpenCode starts when
the ACP client connects, not when the proxy starts. Another simultaneous client
receives HTTP 409; disconnect the existing client before running the smoke task.
Requests, notifications, cancellation, and permission replies are forwarded
through the SDK. DELETE or server shutdown terminates that child. Multiple ACP
profiles belong to the browser; each proxy instance has only one active client.

`opencode.json` defines the restricted browser agent. It denies local tools,
skills, plugins, and other MCP servers. The bridge replaces incoming working
directories with `data/opencode/workspace/` and disables project/Claude config
discovery. It writes the exact browser MCP URL to
`data/opencode/config/opencode/opencode.json` before forwarding session creation
or loading, and supplies that same URL through ACP under the fixed name `darc`.
Additional MCP declarations are rejected. The existing browser permission
prompts still authorize each browser operation.

OpenCode's database, login, cache, config, logs, and temporary files live in
`data/opencode/`. This is why the start/login tasks need `--allow-write=./data`.
This directory stores OpenCode runtime data, not a proxy connection registry;
saved connection identities and permissions remain browser-owned. Reconnects
retain OpenCode's database/login. Darc retains session IDs and transcripts in browser
storage and reloads sessions after reconnecting. OpenCode must support loading
those sessions; the proxy does not store agent state or replay interrupted prompts.

## Browser MCP compatibility

Create an MCP connection in Darc and select it in Agent connection settings.
Darc supplies its browser tools over ACP. For OpenCode, the proxy substitutes a persistent
`https://localhost:7331/mcp/<connection-id>` endpoint. The agent receives this URL
automatically; no separate MCP configuration or tool token is needed.

After a conversation opens, Darc's MCP connection entry displays the full URL,
and **Copy MCP URL** copies the entire value. The proxy also
provides this URL through the ACP session response. The URL remains
saved until the MCP connection is removed. They survive disconnects, browser
reloads, and proxy restarts, and are excluded from Darc exports. A direct ACP
connection without this proxy has no HTTP URL to copy.

HTTP tool calls are forwarded to Darc over the existing ACP connection. Tool
schemas, execution, scoped permission prompts, remembered grants, and revocation
continue to use Darc's existing implementation. The proxy grants no browser access.
It accepts both current MCP requests and older initialization-based clients using
the MCP SDK's stateless compatibility mode. Agents with neither HTTP nor native
ACP MCP support cannot receive these browser tools.

Endpoints and credentials belong to the saved browser connection. Closing ACP
cancels outstanding requests and marks browser tools offline, retaining the same
endpoint and credentials for reconnect. Removing the browser connection in Darc
revokes its endpoint and saved permissions. Offline removals are saved locally and
retried when Darc starts or reconnects. No automatic time limit is applied.
HTTP tool requests use the connection ID in the URL and the same host/origin checks
as `/acp`. The browser owns the saved connection IDs, URLs, credentials, permissions,
and ACP sessions. The proxy keeps registrations and routing state only in memory:
no connection file or disk-write permission is needed for these registrations.
It ignores any old `data/mcp-connections.json`.
After restart, Darc reconnects and registers the same saved IDs. Removing an identity
from Darc removes its grants and prevents the browser from registering it again.
The browser retains its owner key for reconnect and removal; tool clients need
only the URL. ACP connection settings and their bearer token are also
saved until changed or removed.
There is no additional MCP tool token or Authorization header. Old saved token
fields are removed from browser storage during migration.

Darc supplies its saved connection identity in `darc/connections` metadata when
opening or loading a session. The proxy requires this identity and uses its ID
for the MCP URL.

## Test browser MCP without a model prompt

1. Start the proxy with `deno task start` and reload Darc with the updated app.
2. In Settings → MCP connections, create a connection with a title; the description
   is optional. Select it in Agent connection settings, using
   `https://localhost:7331/acp`, and save.
3. Open the Agent sidebar and click **Connect** to open a conversation without
   sending a prompt. **Test connection** in Settings only initializes ACP; it does
   not create an MCP endpoint.
4. Return to MCP connections and click **Copy MCP URL**. Keep Darc and ACP connected.

In a second terminal, from `acp-proxy`, run `read -r MCP_URL`, paste the copied URL,
and press Enter. Then list the nine browser tools:

```sh
curl --cacert ../certs/rootCA.pem "$MCP_URL" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

To test the existing permission flow, request the list of spaces:

```sh
curl --cacert ../certs/rootCA.pem "$MCP_URL" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"listSpaces","arguments":{}}}'
```

Darc shows a permission request. **Allow once** returns the spaces; **Deny** returns
a tool error. Disconnecting ACP makes the same URL return **503 (offline)**.
Reconnect and repeat the command with the original URL: it works again without
copying a new URL. Restarting the proxy also preserves the URL in the browser;
Darc reconnects automatically to bring browser tools online. Removing the connection
revokes its current proxy registration with **404**. A fresh proxy returns **503**
for an unregistered MCP URL until the browser supplies a live registration; it has
no stored connection list or deletion history. Removed browser connections are not
registered again and cannot execute tools.
Discovery alone needs no browser-data permission and does not prove a tool ran.

For the automated native/fallback permission and URL tests, run from the repo root:

```sh
deno test --no-check --allow-env --allow-read --allow-write=.cache --allow-sys --allow-net tests/acp-mcp-proxy.test.js
```

To verify the installed OpenCode's isolated configuration, single-client lifecycle,
and actual MCP discovery without a model prompt:

```sh
deno test --no-check --allow-env --allow-read --allow-write=.cache --allow-sys --allow-net --allow-run=opencode tests/opencode-proxy.test.js
```

The test uses a random loopback port and a temporary profile inside `.cache/`;
it closes its child and listener and removes that profile afterward.

This is a local, unauthenticated HTTPS demo bound to loopback. Deno handles TLS
directly. MCP tool clients use their connection URL and Darc's permission prompts.
For remote deployment, add ACP
authentication and WebSocket support.
Browser local-network restrictions still apply.
