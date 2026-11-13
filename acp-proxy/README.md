# OpenCode ACP proxy demo

Requires Deno and an installed, configured `opencode` on PATH. If prompts report
"provider authentication required", run `opencode acp --login` in your terminal
before connecting. The proxy does not perform provider login.

```sh
cd acp-proxy
deno task start
```

In Darc's Agent connection settings:

- Endpoint: `https://localhost:7331/acp`
- Working directory: the absolute project directory on this machine
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

In another terminal, run `deno task smoke` from this folder. It initializes the
real OpenCode agent and creates a session over HTTPS/SSE without sending a
prompt. `deno task check` type-checks both scripts.

To also verify a streamed model reply using your configured provider:

```sh
deno task smoke "Reply exactly ACP_PROXY_OK. Do not use tools."
```

The official SDK's `AcpServer` handles ACP HTTP routing. Each ACP connection
launches `opencode acp`; its newline-delimited stdio messages are piped through
the SDK unchanged. DELETE or server shutdown terminates that child. OpenCode
inherits your environment and uses its existing provider configuration/login.
Session recovery across child restarts depends on OpenCode's persistence.

This is a local, unauthenticated HTTPS demo bound to loopback. Deno handles TLS
directly. For remote deployment, add authentication and WebSocket support.
Browser local-network restrictions still apply.
