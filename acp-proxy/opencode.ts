import { ndJsonStream, type Stream } from "@agentclientprotocol/sdk";
import { fileURLToPath } from "node:url";
import { connectProxy } from "./bridge.ts";
import type { createMcpGateway } from "./mcp-gateway.ts";
import baseConfig from "./opencode.json" with { type: "json" };

export const openCodeData = new URL("./data/opencode/", import.meta.url);

export function prepareOpenCode(directory = openCodeData) {
  const path = (relative: string) => fileURLToPath(new URL(relative, directory));
  for (const folder of ["home/", "config/opencode/", "data/", "cache/", "state/", "tmp/", "workspace/"]) {
    Deno.mkdirSync(path(folder), { recursive: true, mode: 0o700 });
  }
  const configPath = path("config/opencode/opencode.json");
  const configure = (mcpUrl?: string) => {
    const servers = mcpUrl
      ? { darc: { type: "remote", url: mcpUrl, oauth: false, codemode: false } }
      : {};
    Deno.writeTextFileSync(configPath, JSON.stringify({ ...baseConfig, mcp: { servers } }, null, 2) + "\n", { mode: 0o600 });
  };
  // Reconnects keep OpenCode's database/login, but never reuse an offline MCP binding.
  configure();
  return {
    cwd: path("workspace/"),
    configure,
    env: {
      XDG_DATA_HOME: path("data/"),
      XDG_CONFIG_HOME: path("config/"),
      XDG_CACHE_HOME: path("cache/"),
      XDG_STATE_HOME: path("state/"),
      TMPDIR: path("tmp/"),
      OPENCODE_TEST_HOME: path("home/"),
      OPENCODE_CONFIG_DIR: path("config/opencode/"),
      OPENCODE_CONFIG: configPath,
      OPENCODE_DB: path("data/opencode/opencode.db"),
      OPENCODE_CONFIG_CONTENT: "{}",
      OPENCODE_CLI_CONFIG_CONTENT: "{}",
      OPENCODE_FLAGS: "{}",
      OPENCODE_CONFIG_PROJECT_DISABLE: "true",
      OPENCODE_DISABLE_CLAUDE_CODE: "true",
      OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "true",
      OPENCODE_FILEWATCHER_DISABLE: "true",
      OPENCODE_DISABLE_FFF: "true",
      OPENCODE_DISABLE_AUTOUPDATE: "true",
      NODE_EXTRA_CA_CERTS: fileURLToPath(new URL("../certs/rootCA.pem", import.meta.url)),
    },
  };
}

export function createOpenCodeAgent(gateway: ReturnType<typeof createMcpGateway>, directory = openCodeData) {
  let busy = false;
  return {
    get busy() { return busy; },
    connect(stream: Stream) {
      if (busy) throw new Error("This proxy already has an ACP client connected");
      busy = true;
      let child: Deno.ChildProcess | undefined;
      let stopping = false;
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const stop = () => {
        if (stopping || !child) return;
        stopping = true;
        try {
          child.kill("SIGTERM");
          killTimer = setTimeout(() => {
            try {
              child?.kill("SIGKILL");
            } catch { /* Already exited. */ }
          }, 2000);
        } catch { /* Already exited. */ }
      };
      try {
        const runtime = prepareOpenCode(directory);
        child = new Deno.Command("opencode", {
          args: ["acp"],
          cwd: runtime.cwd,
          env: runtime.env,
          stdin: "piped",
          stdout: "piped",
          stderr: "inherit",
        }).spawn();
        // Forward raw ACP messages in both directions, including permission replies.
        // The bridge only adapts browser MCP declarations for HTTP-only agents.
        const proxy = connectProxy(stream, ndJsonStream(child.stdin, child.stdout), gateway, {
          browserOnly: { cwd: runtime.cwd, configure: runtime.configure },
        });
        void proxy.closed.then(stop, stop);
        const exited = child.status.then(async (status) => {
          const expected = stopping;
          stop();
          clearTimeout(killTimer);
          await child!.stdin.close().catch(() => {});
          if (!expected && !status.success) {
            console.error(`opencode exited: ${status.code} (${status.signal ?? "no signal"})`);
          }
        });
        return { closed: Promise.allSettled([proxy.closed, exited]).then(() => { busy = false; }) };
      } catch (error) {
        stop();
        if (child) {
          void child.status.finally(async () => {
            clearTimeout(killTimer);
            await child!.stdin.close().catch(() => {});
            busy = false;
          });
        } else {
          busy = false;
        }
        throw error;
      }
    },
  };
}

if (import.meta.main && Deno.args[0] === "login") {
  const runtime = prepareOpenCode();
  const child = new Deno.Command("opencode", {
    args: ["acp", "--login"], cwd: runtime.cwd, env: runtime.env,
    stdin: "inherit", stdout: "inherit", stderr: "inherit",
  }).spawn();
  Deno.exit((await child.status).code);
}
