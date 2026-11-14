import { ndJsonStream, type Stream } from '@agentclientprotocol/sdk'
import { fileURLToPath } from 'node:url'
import { connectProxy } from './bridge.ts'
import type { createMcpGateway } from './mcp-gateway.ts'
import baseConfig from './opencode.json' with { type: 'json' }

export const openCodeData = new URL('./data/opencode/', import.meta.url)

export function prepareOpenCode(directory = openCodeData) {
    const folders = ['home/', 'config/opencode/', 'data/', 'cache/', 'state/', 'tmp/', 'workspace/']
    for (const folder of folders) { Deno.mkdirSync(new URL(folder, directory), { recursive: true, mode: 0o700 }) }
    const configFile = new URL('config/opencode/opencode.json', directory)
    function configure(mcpUrl?: string) {
        const config = { ...baseConfig, mcp: { servers: mcpUrl ? {
            darc: { type: 'remote', url: mcpUrl, oauth: false, codemode: false }
        } : {} } }
        Deno.writeTextFileSync(configFile, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
    }
    // Reconnects keep OpenCode's database/login, but never reuse an offline MCP binding.
    // A stale URL is never registered before the browser supplies its live binding again.
    configure()
    return {
        cwd: fileURLToPath(new URL('workspace/', directory)),
        env: {
            XDG_DATA_HOME: fileURLToPath(new URL('data/', directory)),
            XDG_CONFIG_HOME: fileURLToPath(new URL('config/', directory)),
            XDG_CACHE_HOME: fileURLToPath(new URL('cache/', directory)),
            XDG_STATE_HOME: fileURLToPath(new URL('state/', directory)),
            TMPDIR: fileURLToPath(new URL('tmp/', directory)),
            OPENCODE_TEST_HOME: fileURLToPath(new URL('home/', directory)),
            OPENCODE_CONFIG_DIR: fileURLToPath(new URL('config/opencode/', directory)),
            OPENCODE_CONFIG: fileURLToPath(configFile),
            OPENCODE_DB: fileURLToPath(new URL('data/opencode/opencode.db', directory)),
            OPENCODE_CONFIG_CONTENT: '{}',
            OPENCODE_CLI_CONFIG_CONTENT: '{}',
            OPENCODE_FLAGS: '{}',
            OPENCODE_CONFIG_PROJECT_DISABLE: 'true',
            OPENCODE_DISABLE_CLAUDE_CODE: 'true',
            OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: 'true',
            OPENCODE_FILEWATCHER_DISABLE: 'true',
            OPENCODE_DISABLE_FFF: 'true',
            OPENCODE_DISABLE_AUTOUPDATE: 'true',
            NODE_EXTRA_CA_CERTS: fileURLToPath(new URL('../certs/rootCA.pem', import.meta.url))
        },
        configure
    }
}

export function createOpenCodeAgent(gateway: ReturnType<typeof createMcpGateway>, directory = openCodeData) {
    let busy = false
    return {
        get busy() { return busy },
        connect(stream: Stream) {
            if (busy) { throw new Error('This proxy already has an ACP client connected') }
            busy = true
            let child: Deno.ChildProcess | undefined
            let stopping = false
            let killTimer: ReturnType<typeof setTimeout> | undefined
            const stop = () => {
                if (stopping || !child) { return }
                stopping = true
                try {
                    child.kill('SIGTERM')
                    killTimer = setTimeout(() => {
                        try { child?.kill('SIGKILL') } catch { /* Already exited. */ }
                    }, 2000)
                } catch { /* Already exited. */ }
            }
            try {
                const runtime = prepareOpenCode(directory)
                child = new Deno.Command('opencode', { args: ['acp'], cwd: runtime.cwd, env: runtime.env,
                    stdin: 'piped', stdout: 'piped', stderr: 'inherit' }).spawn()
                const stdio = ndJsonStream(child.stdin, child.stdout)
                // Forward raw ACP messages in both directions, including permission replies.
                // The bridge only adapts browser MCP declarations for HTTP-only agents.
                const proxy = connectProxy(stream, stdio, gateway, { browserOnly: {
                    cwd: runtime.cwd,
                    configure: url => runtime.configure(url)
                } })
                void proxy.closed.then(stop, stop)
                const exited = child.status.then(async status => {
                    const expected = stopping
                    stop()
                    clearTimeout(killTimer)
                    await child!.stdin.close().catch(() => {})
                    if (!expected && !status.success) { console.error(`opencode exited: ${status.code} (${status.signal ?? 'no signal'})`) }
                })
                return { closed: Promise.allSettled([proxy.closed, exited]).then(() => { busy = false }) }
            } catch (error) {
                stop()
                if (child) {
                    void child.status.finally(async () => {
                        clearTimeout(killTimer)
                        await child!.stdin.close().catch(() => {})
                        busy = false
                    })
                } else { busy = false }
                throw error
            }
        }
    }
}

if (import.meta.main) {
    if (Deno.args[0] !== 'login') { throw new Error('Usage: deno task login') }
    const runtime = prepareOpenCode()
    const child = new Deno.Command('opencode', { args: ['acp', '--login'], cwd: runtime.cwd, env: runtime.env,
        stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' }).spawn()
    Deno.exit((await child.status).code)
}
