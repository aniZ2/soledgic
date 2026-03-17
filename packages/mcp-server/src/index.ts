import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { configure, registerTools } from './tools.js'

// ─── Read config from environment ────────────────────────────────

const apiKey = process.env.SOLEDGIC_API_KEY
if (!apiKey) {
  process.stderr.write(
    'FATAL: SOLEDGIC_API_KEY is required. Set it as an environment variable.\n',
  )
  process.exit(1)
}

// Validate key format
if (!/^slk_(live|test)_[a-zA-Z0-9]+$/.test(apiKey) && !/^sk_(live|test)_[a-zA-Z0-9]+$/.test(apiKey)) {
  process.stderr.write(
    'FATAL: SOLEDGIC_API_KEY must match slk_live_* or slk_test_* format.\n',
  )
  process.exit(1)
}

const baseUrl = (
  process.env.SOLEDGIC_BASE_URL || 'https://api.soledgic.com/v1'
).replace(/\/+$/, '') // strip trailing slash

const allowWrites = process.env.SOLEDGIC_ALLOW_WRITES === 'true'
const allowLiveWrites = process.env.SOLEDGIC_ALLOW_LIVE_WRITES === 'true'
const actorName = process.env.SOLEDGIC_ACTOR || 'mcp-server'

// Tool allowlist: comma-separated list of tool names, or empty for all
const allowedToolsRaw = process.env.SOLEDGIC_ALLOWED_TOOLS
const allowedTools = allowedToolsRaw
  ? allowedToolsRaw.split(',').map((t) => t.trim()).filter(Boolean)
  : null

// ─── Security summary (stderr only) ─────────────────────────────

const isLive = apiKey.startsWith('slk_live_') || apiKey.startsWith('sk_live_')
process.stderr.write(
  JSON.stringify({
    event: 'mcp_server_start',
    timestamp: new Date().toISOString(),
    key_type: isLive ? 'live' : 'test',
    base_url: baseUrl,
    allow_writes: allowWrites,
    allow_live_writes: allowLiveWrites,
    allowed_tools: allowedTools ?? 'all',
    actor: actorName,
  }) + '\n',
)

if (isLive && !allowLiveWrites) {
  process.stderr.write(
    'INFO: Live key detected but SOLEDGIC_ALLOW_LIVE_WRITES is not set. Write operations will be blocked.\n',
  )
}

if (!allowWrites) {
  process.stderr.write(
    'INFO: SOLEDGIC_ALLOW_WRITES is not set. All write operations will be blocked (read-only mode).\n',
  )
}

// ─── Configure tools ─────────────────────────────────────────────

configure({
  apiKey,
  baseUrl,
  allowWrites,
  allowLiveWrites,
  allowedTools,
  actor: actorName,
})

// ─── Create and start MCP server ─────────────────────────────────

const server = new Server(
  {
    name: 'soledgic',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
)

registerTools(server)

const transport = new StdioServerTransport()
await server.connect(transport)

process.stderr.write('Soledgic MCP server running on stdio\n')
