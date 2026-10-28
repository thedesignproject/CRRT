export function assertLocalMcpTargets(env: Record<string, string | undefined>) {
  for (const [name, protocols] of [['DATABASE_URL', ['postgres:', 'postgresql:']], ['SUPABASE_URL', ['http:', 'https:']]] as const) {
    let url: URL
    try { url = new URL(env[name]!) } catch { throw new Error(`MCP tests require a loopback ${name}`) }
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !protocols.includes(url.protocol as never)) throw new Error(`MCP tests require a loopback ${name}`)
  }
}
