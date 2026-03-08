# @soledgic/mcp-server

MCP (Model Context Protocol) server that exposes the Soledgic accounting API as AI-callable tools.

## Setup

```bash
cd packages/mcp-server
npm install
npm run build
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SOLEDGIC_API_KEY` | Yes | — | API key (`sk_live_*` or `sk_test_*`) |
| `SOLEDGIC_BASE_URL` | No | `https://api.soledgic.com/v1` | API base URL |
| `SOLEDGIC_ALLOW_WRITES` | No | `false` | Enable write operations |
| `SOLEDGIC_ALLOW_LIVE_WRITES` | No | `false` | Enable writes with live keys |
| `SOLEDGIC_ALLOWED_TOOLS` | No | all | Comma-separated tool allowlist |
| `SOLEDGIC_ACTOR` | No | `mcp-server` | Actor name for audit log |

**API key must be set as an environment variable — never in config files.**

## Security Model

This server handles financial operations. Multiple safety gates are enforced:

1. **Write gate** — All mutating tools blocked unless `SOLEDGIC_ALLOW_WRITES=true`
2. **Live gate** — Writes with `sk_live_*` keys require `SOLEDGIC_ALLOW_LIVE_WRITES=true`
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
      "command": "node",
      "args": ["packages/mcp-server/dist/index.js"],
      "env": {
        "SOLEDGIC_API_KEY": "${SOLEDGIC_API_KEY}",
        "SOLEDGIC_BASE_URL": "https://api.soledgic.com/v1"
      }
    }
  }
}
```

### Read-only mode (safest)

```json
{
  "env": {
    "SOLEDGIC_API_KEY": "${SOLEDGIC_API_KEY}"
  }
}
```

### Test key with writes

```json
{
  "env": {
    "SOLEDGIC_API_KEY": "${SOLEDGIC_API_KEY}",
    "SOLEDGIC_ALLOW_WRITES": "true"
  }
}
```

### Live key with writes (full access)

```json
{
  "env": {
    "SOLEDGIC_API_KEY": "${SOLEDGIC_API_KEY}",
    "SOLEDGIC_ALLOW_WRITES": "true",
    "SOLEDGIC_ALLOW_LIVE_WRITES": "true"
  }
}
```

### Restricted tool access

```json
{
  "env": {
    "SOLEDGIC_API_KEY": "${SOLEDGIC_API_KEY}",
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
