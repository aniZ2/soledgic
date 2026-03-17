# @soledgic/mcp-server

MCP (Model Context Protocol) server that exposes the Soledgic accounting API as AI-callable tools.

## Setup

```bash
cd packages/mcp-server
npm install
npm run build
```

Or launch it via the repo wrapper:

```bash
./scripts/run-soledgic-mcp.sh
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SOLEDGIC_API_KEY` | Yes | — | API key (`slk_live_*` or `slk_test_*`) |
| `SOLEDGIC_BASE_URL` | No | `https://api.soledgic.com/v1` | API base URL |
| `SOLEDGIC_ALLOW_WRITES` | No | `false` | Enable write operations |
| `SOLEDGIC_ALLOW_LIVE_WRITES` | No | `false` | Enable writes with live keys |
| `SOLEDGIC_ALLOWED_TOOLS` | No | all | Comma-separated tool allowlist |
| `SOLEDGIC_ACTOR` | No | `mcp-server` | Actor name for audit log |

**API key must be set as an environment variable or an untracked local env file loaded by the wrapper script — never inline in agent config files.**

## Wrapper Script

`scripts/run-soledgic-mcp.sh` is the recommended launcher for Codex and Claude.
It:

- loads `SOLEDGIC_*` settings from the current shell first
- optionally loads an env file from `SOLEDGIC_MCP_ENV_FILE`
- falls back to `test-data/api-keys.env` when present
- defaults to read-only mode unless `SOLEDGIC_ALLOW_WRITES=true` is set explicitly

Run `./scripts/run-soledgic-mcp.sh --help` for the full contract.

## Security Model

This server handles financial operations. Multiple safety gates are enforced:

1. **Write gate** — All mutating tools blocked unless `SOLEDGIC_ALLOW_WRITES=true`
2. **Live gate** — Writes with `slk_live_*` keys require `SOLEDGIC_ALLOW_LIVE_WRITES=true`
3. **Confirmation gate** — Every write tool requires `confirm: true` in the call arguments
4. **Idempotency** — Financial write tools require a unique `idempotency_key`
5. **Tool allowlist** — Restrict available tools via `SOLEDGIC_ALLOWED_TOOLS`
6. **Amount limits** — Per-tool caps on amount fields (payouts: $50k, sales/refunds: $100k)
7. **Rate limits** — 30 reads/min, 10 writes/min per tool
8. **Audit trail** — Every tool call logged to stderr (tool, actor, args, request_id, result)
9. **Timeout** — 30s per API request with abort controller
10. **Input validation** — Zod schemas validate all inputs before API calls

## Claude Code Integration

Register in `.claude/claude_mcp_config.json`:

```json
{
  "mcpServers": {
    "soledgic": {
      "command": "/Users/osifo/Desktop/soledgic/scripts/run-soledgic-mcp.sh",
      "env": {
        "SOLEDGIC_MCP_ENV_FILE": "/Users/osifo/Desktop/soledgic/test-data/api-keys.env",
        "SOLEDGIC_ALLOWED_TOOLS": "get_balance,get_transactions,create_checkout,create_creator",
        "SOLEDGIC_ACTOR": "claude"
      }
    }
  }
}
```

The env file should stay untracked. Do not inline live or test API keys in
`claude_mcp_config.json`.

## Codex Integration

Register the same wrapper command in your Codex config:

```toml
[mcp_servers.soledgic]
command = "/Users/osifo/Desktop/soledgic/scripts/run-soledgic-mcp.sh"
```

Then provide secrets through your shell environment or
`/Users/osifo/Desktop/soledgic/test-data/api-keys.env`.

### Read-only mode (safest)

```json
{
  "env": {
    "SOLEDGIC_MCP_ENV_FILE": "/Users/osifo/Desktop/soledgic/test-data/api-keys.env"
  }
}
```

### Test key with writes

```json
{
  "env": {
    "SOLEDGIC_MCP_ENV_FILE": "/Users/osifo/Desktop/soledgic/test-data/api-keys.env",
    "SOLEDGIC_ALLOW_WRITES": "true"
  }
}
```

### Live key with writes (full access)

```json
{
  "env": {
    "SOLEDGIC_MCP_ENV_FILE": "/Users/osifo/Desktop/soledgic/test-data/api-keys.env",
    "SOLEDGIC_ALLOW_WRITES": "true",
    "SOLEDGIC_ALLOW_LIVE_WRITES": "true"
  }
}
```

### Restricted tool access

```json
{
  "env": {
    "SOLEDGIC_MCP_ENV_FILE": "/Users/osifo/Desktop/soledgic/test-data/api-keys.env",
    "SOLEDGIC_ALLOW_WRITES": "true",
    "SOLEDGIC_ALLOWED_TOOLS": "get_balance,get_transactions,record_sale,get_all_balances"
  }
}
```

## Tools (17)

### Read-only (8)

| Tool | Description |
|------|-------------|
| `get_balance` | Get creator balance |
| `get_all_balances` | List all balances / chart of accounts |
| `get_transactions` | List/filter transactions |
| `get_trial_balance` | Trial balance report |
| `get_profit_loss` | Profit & loss statement |
| `get_balance_sheet` | Balance sheet |
| `health_check` | Ledger health diagnostics |
| `export_report` | Export data (CSV/JSON) |

### Webhooks (1) — action-based writes require `confirm: true`

| Tool | Description |
|------|-------------|
| `manage_webhooks` | List/create/update/delete/test webhooks, view deliveries, retry deliveries, rotate secrets |

### Write (8) — require `confirm: true` + `idempotency_key`

| Tool | Description |
|------|-------------|
| `record_sale` | Record a sale with revenue split |
| `process_payout` | Process creator payout |
| `record_refund` | Refund a sale |
| `reverse_transaction` | Reverse a transaction |
| `create_creator` | Create creator account |
| `create_checkout` | Create checkout/charge |
| `record_adjustment` | Record journal adjustment |
| `close_period` | Close accounting period |

## Testing

```bash
npm run build
npx @modelcontextprotocol/inspector node dist/index.js
```
