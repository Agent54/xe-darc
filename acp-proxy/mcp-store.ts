import { type } from 'arktype'

export type McpRegistration = { id: string; path: string; ownerKeyHash?: string; deleted?: boolean }
export type McpRegistry = { load(): McpRegistration[]; save(records: McpRegistration[]): void }

const registrations = type({ id: 'string', path: 'string', 'token?': 'string', 'ownerKeyHash?': 'string', 'deleted?': 'boolean' }).array()

export function fileMcpRegistry(path: URL): McpRegistry {
    return {
        load() {
            try {
                const result = registrations(JSON.parse(Deno.readTextFileSync(path)))
                if (result instanceof type.errors) { throw new Error(`Invalid MCP registry: ${result.summary}`) }
                const records = result.map(({ token: _oldToken, ...record }) => record)
                if (result.some(record => record.token !== undefined)) { this.save(records) }
                return records
            } catch (error) {
                if (error instanceof Deno.errors.NotFound) { return [] }
                throw error
            }
        },
        save(records) {
            Deno.mkdirSync(new URL('./', path), { recursive: true, mode: 0o700 })
            // Replace the registry atomically so interrupted writes cannot rotate saved credentials.
            const next = new URL(`${path.href}.next`)
            Deno.writeTextFileSync(next, JSON.stringify(records), { mode: 0o600 })
            Deno.renameSync(next, path)
        }
    }
}
