import { z } from 'zod'
import type { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import {
  GetBalanceSchema,
  GetAllBalancesSchema,
  GetTransactionsSchema,
  GetTrialBalanceSchema,
  GetProfitLossSchema,
  GetBalanceSheetSchema,
  HealthCheckSchema,
  ExportReportSchema,
  ManageWebhooksSchema,
  RecordSaleSchema,
  ProcessPayoutSchema,
  RecordRefundSchema,
  ReverseTransactionSchema,
  CreateCreatorSchema,
  CreateCheckoutSchema,
  RecordAdjustmentSchema,
  ClosePeriodSchema,
} from './schemas.js'

// ─── Types ───────────────────────────────────────────────────────

interface ToolDef {
  name: string
  description: string
  inputSchema: z.ZodType
  method: 'GET' | 'POST'
  endpoint: string
  resolveEndpoint?: (args: Record<string, unknown>) => string
  mutating: boolean
  isMutatingCall?: (args: Record<string, unknown>) => boolean
  requireIdempotency?: boolean
  /** Max single-call amount in cents (0 = no limit) */
  amountLimitCents: number
}

interface AuditEntry {
  timestamp: string
  tool: string
  actor: string
  args_summary: string
  request_id: string | null
  success: boolean
  error: string | null
}

// ─── Config ──────────────────────────────────────────────────────

let apiKey = ''
let baseUrl = ''
let allowWrites = false
let allowLiveWrites = false
let allowedTools: Set<string> | null = null // null = all tools allowed
let actor = 'mcp-server'

export function configure(opts: {
  apiKey: string
  baseUrl: string
  allowWrites: boolean
  allowLiveWrites: boolean
  allowedTools: string[] | null
  actor: string
}) {
  apiKey = opts.apiKey
  baseUrl = opts.baseUrl
  allowWrites = opts.allowWrites
  allowLiveWrites = opts.allowLiveWrites
  allowedTools = opts.allowedTools ? new Set(opts.allowedTools) : null
  actor = opts.actor || 'mcp-server'
}

// ─── Per-tool rate limiting ──────────────────────────────────────

const RATE_WINDOW_MS = 60_000 // 1 minute
const DEFAULT_RATE_LIMIT = 30 // calls per window
const WRITE_RATE_LIMIT = 10 // calls per window for mutating tools

const rateBuckets = new Map<string, { count: number; windowStart: number }>()

function checkRateLimit(toolName: string, isMutating: boolean): string | null {
  const now = Date.now()
  const limit = isMutating ? WRITE_RATE_LIMIT : DEFAULT_RATE_LIMIT
  const bucket = rateBuckets.get(toolName)

  if (!bucket || now - bucket.windowStart > RATE_WINDOW_MS) {
    rateBuckets.set(toolName, { count: 1, windowStart: now })
    return null
  }

  if (bucket.count >= limit) {
    const retryAfter = Math.ceil(
      (bucket.windowStart + RATE_WINDOW_MS - now) / 1000,
    )
    return `Rate limited: ${toolName} exceeded ${limit} calls/minute. Retry after ${retryAfter}s.`
  }

  bucket.count++
  return null
}

// ─── Audit log ───────────────────────────────────────────────────

function audit(entry: AuditEntry) {
  process.stderr.write(JSON.stringify(entry) + '\n')
}

// ─── HTTP helper ─────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 30_000

async function apiRequest(
  method: string,
  endpoint: string,
  body?: unknown,
  queryParams?: Record<string, string | number | boolean | undefined>,
): Promise<{ data: unknown; requestId: string | null; ok: boolean }> {
  const url = new URL(`${baseUrl}/${endpoint}`)

  if (queryParams) {
    for (const [k, v] of Object.entries(queryParams)) {
      if (v !== undefined) url.searchParams.set(k, String(v))
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })

    const requestId = res.headers.get('x-request-id')

    if (!res.ok) {
      const errorBody = await res.text().catch(() => 'Unknown error')
      let parsed: { error?: string } = {}
      try {
        parsed = JSON.parse(errorBody)
      } catch {
        // not JSON
      }
      return {
        data: {
          success: false,
          error: parsed.error || `HTTP ${res.status}`,
          status: res.status,
        },
        requestId,
        ok: false,
      }
    }

    const data = await res.json()
    return { data, requestId, ok: true }
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === 'AbortError'
          ? `Request timed out after ${REQUEST_TIMEOUT_MS}ms`
          : err.message
        : 'Unknown error'
    return {
      data: { success: false, error: message },
      requestId: null,
      ok: false,
    }
  } finally {
    clearTimeout(timeout)
  }
}

// ─── Tool definitions ────────────────────────────────────────────

const TOOLS: ToolDef[] = [
  // ── Read-only ──
  {
    name: 'get_balance',
    description:
      "Get a participant's balance snapshot. Pass creator_id for a specific participant, or omit for all participants.",
    inputSchema: GetBalanceSchema,
    method: 'GET',
    endpoint: 'participants',
    resolveEndpoint: (args) =>
      typeof args.creator_id === 'string' && args.creator_id.trim().length > 0
        ? `participants/${encodeURIComponent(args.creator_id)}`
        : 'participants',
    mutating: false,
    amountLimitCents: 0,
  },
  {
    name: 'get_all_balances',
    description:
      'List all participant balances.',
    inputSchema: GetAllBalancesSchema,
    method: 'GET',
    endpoint: 'participants',
    mutating: false,
    amountLimitCents: 0,
  },
  {
    name: 'get_transactions',
    description:
      'List and filter transactions with pagination. Filter by creator, type, status, date range.',
    inputSchema: GetTransactionsSchema,
    method: 'GET',
    endpoint: 'get-transactions',
    mutating: false,
    amountLimitCents: 0,
  },
  {
    name: 'get_trial_balance',
    description:
      'Generate a trial balance report. Optionally specify a snapshot or as-of date.',
    inputSchema: GetTrialBalanceSchema,
    method: 'GET',
    endpoint: 'trial-balance',
    mutating: false,
    amountLimitCents: 0,
  },
  {
    name: 'get_profit_loss',
    description:
      'Generate a profit & loss statement. Filter by year, month, quarter, or date range.',
    inputSchema: GetProfitLossSchema,
    method: 'GET',
    endpoint: 'profit-loss',
    mutating: false,
    amountLimitCents: 0,
  },
  {
    name: 'get_balance_sheet',
    description: 'Generate a balance sheet as of a specific date.',
    inputSchema: GetBalanceSheetSchema,
    method: 'GET',
    endpoint: 'balance-sheet',
    mutating: false,
    amountLimitCents: 0,
  },
  {
    name: 'health_check',
    description:
      'Run ledger health diagnostics. Actions: "run" (single check), "run_all" (all checks), "status", "history".',
    inputSchema: HealthCheckSchema,
    method: 'POST',
    endpoint: 'health-check',
    mutating: false,
    amountLimitCents: 0,
  },
  {
    name: 'export_report',
    description:
      'Export financial data as CSV or JSON. Report types: transaction_detail, creator_earnings, platform_revenue, payout_summary, reconciliation, audit_log.',
    inputSchema: ExportReportSchema,
    method: 'POST',
    endpoint: 'export-report',
    mutating: false,
    amountLimitCents: 0,
  },
  {
    name: 'manage_webhooks',
    description:
      'Manage webhook endpoints and deliveries. Actions: list, create, update, delete, test, deliveries, retry, rotate_secret. Write actions require confirm=true.',
    inputSchema: ManageWebhooksSchema,
    method: 'POST',
    endpoint: 'webhooks',
    mutating: true,
    isMutatingCall: (args) => {
      const action = args.action
      return (
        typeof action === 'string' &&
        [
          'create',
          'update',
          'delete',
          'test',
          'retry',
          'rotate_secret',
        ].includes(action)
      )
    },
    requireIdempotency: false,
    amountLimitCents: 0,
  },

  // ── Write (mutating) ──
  {
    name: 'record_sale',
    description:
      '[WRITE] Record a sale with automatic revenue split. Amount in cents. Requires confirm=true and idempotency_key.',
    inputSchema: RecordSaleSchema,
    method: 'POST',
    endpoint: 'record-sale',
    mutating: true,
    amountLimitCents: 100_000_00, // $100,000
  },
  {
    name: 'process_payout',
    description:
      '[WRITE] Process a payout to a creator. Amount in cents. Requires confirm=true and idempotency_key.',
    inputSchema: ProcessPayoutSchema,
    method: 'POST',
    endpoint: 'payouts',
    mutating: true,
    amountLimitCents: 50_000_00, // $50,000
  },
  {
    name: 'record_refund',
    description:
      '[WRITE] Refund a sale (full or partial). Requires confirm=true and idempotency_key.',
    inputSchema: RecordRefundSchema,
    method: 'POST',
    endpoint: 'refunds',
    mutating: true,
    amountLimitCents: 100_000_00, // $100,000
  },
  {
    name: 'reverse_transaction',
    description:
      '[WRITE] Reverse a transaction (immutable pattern). Requires confirm=true and idempotency_key.',
    inputSchema: ReverseTransactionSchema,
    method: 'POST',
    endpoint: 'reverse-transaction',
    mutating: true,
    amountLimitCents: 100_000_00,
  },
  {
    name: 'create_creator',
    description:
      '[WRITE] Create a new creator account. Requires confirm=true and idempotency_key.',
    inputSchema: CreateCreatorSchema,
    method: 'POST',
    endpoint: 'participants',
    mutating: true,
    amountLimitCents: 0,
  },
  {
    name: 'create_checkout',
    description:
      '[WRITE] Create checkout session or direct charge. Amount in cents. Requires confirm=true and idempotency_key.',
    inputSchema: CreateCheckoutSchema,
    method: 'POST',
    endpoint: 'checkout-sessions',
    mutating: true,
    amountLimitCents: 100_000_00,
  },
  {
    name: 'record_adjustment',
    description:
      '[WRITE] Record a journal adjustment. Entries must balance. Requires confirm=true and idempotency_key.',
    inputSchema: RecordAdjustmentSchema,
    method: 'POST',
    endpoint: 'record-adjustment',
    mutating: true,
    amountLimitCents: 100_000_00,
  },
  {
    name: 'close_period',
    description:
      '[WRITE] Close an accounting period. Requires confirm=true and idempotency_key.',
    inputSchema: ClosePeriodSchema,
    method: 'POST',
    endpoint: 'close-period',
    mutating: true,
    amountLimitCents: 0,
  },
]

// ─── Helpers ─────────────────────────────────────────────────────

function summarizeArgs(args: Record<string, unknown>): string {
  const safe = { ...args }
  for (const key of Object.keys(safe)) {
    if (key.includes('tax_id') || key.includes('secret')) {
      safe[key] = '[REDACTED]'
    }
  }
  return JSON.stringify(safe)
}

function errorResult(text: string, auditPartial?: Partial<AuditEntry>) {
  if (auditPartial) {
    audit({
      timestamp: new Date().toISOString(),
      actor,
      request_id: null,
      success: false,
      tool: '',
      args_summary: '',
      ...auditPartial,
    } as AuditEntry)
  }
  return {
    content: [{ type: 'text' as const, text }],
    isError: true,
  }
}

function isLiveKey(key: string): boolean {
  return key.startsWith('sk_live_')
}

function getAmountFromArgs(args: Record<string, unknown>): number | null {
  if (typeof args.amount === 'number') return args.amount
  if (typeof args.partial_amount === 'number') return args.partial_amount
  return null
}

// ─── Register tools with MCP server ─────────────────────────────

export function registerTools(server: Server) {
  // tools/list — only expose allowed tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.filter(
      (t) => !allowedTools || allowedTools.has(t.name),
    ).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(
        t.inputSchema,
        t.mutating,
        t.requireIdempotency ?? t.mutating,
      ),
    })),
  }))

  // tools/call
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: rawArgs = {} } = request.params
      const auditBase = { tool: name, actor, args_summary: summarizeArgs(rawArgs) }

      // ── Tool exists? ──
      const tool = TOOLS.find((t) => t.name === name)
      if (!tool) {
        return errorResult(`Unknown tool: ${name}`, {
          ...auditBase,
          error: 'unknown tool',
        })
      }

      // ── Tool allowlisted? ──
      if (allowedTools && !allowedTools.has(name)) {
        return errorResult(
          `Tool "${name}" is not in the allowed tools list. Allowed: ${[...allowedTools].join(', ')}`,
          { ...auditBase, error: 'tool not allowed' },
        )
      }

      // ── Validate input ──
      const parsed = tool.inputSchema.safeParse(rawArgs)
      if (!parsed.success) {
        const msg = parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join(', ')
        return errorResult(`Validation error: ${msg}`, {
          ...auditBase,
          error: `validation: ${msg}`,
        })
      }

      const args = parsed.data as Record<string, unknown>
      const isMutatingCall = tool.isMutatingCall
        ? tool.isMutatingCall(args)
        : tool.mutating

      // ── Rate limit ──
      const rateLimitError = checkRateLimit(name, isMutatingCall)
      if (rateLimitError) {
        return errorResult(rateLimitError, {
          ...auditBase,
          error: 'rate limited',
        })
      }

      // ── Gate 1: SOLEDGIC_ALLOW_WRITES ──
      if (isMutatingCall && !allowWrites) {
        return errorResult(
          'Writes are disabled. Set SOLEDGIC_ALLOW_WRITES=true to enable mutating operations.',
          { ...auditBase, error: 'writes disabled' },
        )
      }

      // ── Gate 2: SOLEDGIC_ALLOW_LIVE_WRITES (for sk_live_* keys) ──
      if (isMutatingCall && isLiveKey(apiKey) && !allowLiveWrites) {
        return errorResult(
          'Live writes are disabled. You are using a live API key (sk_live_*). Set SOLEDGIC_ALLOW_LIVE_WRITES=true to enable writes against production.',
          { ...auditBase, error: 'live writes disabled' },
        )
      }

      // ── Gate 3: explicit confirmation ──
      if (isMutatingCall && rawArgs.confirm !== true) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `This is a write operation (${name}). To execute, re-call with confirm: true. Details: ${summarizeArgs(args)}`,
            },
          ],
          isError: false,
        }
      }

      // ── Gate 4: idempotency key required for all writes ──
      const requireIdempotency = tool.requireIdempotency ?? tool.mutating
      if (isMutatingCall && requireIdempotency && !args.idempotency_key) {
        return errorResult(
          `Idempotency key required for ${name}. Pass idempotency_key to prevent duplicate operations.`,
          { ...auditBase, error: 'missing idempotency_key' },
        )
      }

      // ── Gate 5: amount limit ──
      if (tool.amountLimitCents > 0) {
        const amount = getAmountFromArgs(args)
        if (amount !== null && amount > tool.amountLimitCents) {
          const limitDollars = (tool.amountLimitCents / 100).toLocaleString(
            'en-US',
            { style: 'currency', currency: 'USD' },
          )
          return errorResult(
            `Amount $${(amount / 100).toFixed(2)} exceeds the per-call limit of ${limitDollars} for ${name}.`,
            { ...auditBase, error: `amount exceeds limit (${tool.amountLimitCents})` },
          )
        }
      }

      // ── Make API request ──
      let result: { data: unknown; requestId: string | null; ok: boolean }

      const endpoint = tool.resolveEndpoint ? tool.resolveEndpoint(args) : tool.endpoint

      if (tool.method === 'GET') {
        const queryParams: Record<
          string,
          string | number | boolean | undefined
        > = {}
        for (const [k, v] of Object.entries(args)) {
          if (v !== undefined && k !== 'confirm' && k !== 'idempotency_key') {
            if (tool.name === 'get_profit_loss' && k === 'breakdown') {
              queryParams[k] = v === true ? 'monthly' : undefined
              continue
            }
            queryParams[k] = v as string | number | boolean
          }
        }
        result = await apiRequest('GET', endpoint, undefined, queryParams)
      } else {
        const body = { ...args }
        delete body.confirm
        result = await apiRequest('POST', endpoint, body)
      }

      // ── Audit ──
      audit({
        timestamp: new Date().toISOString(),
        tool: name,
        actor,
        args_summary: summarizeArgs(args),
        request_id: result.requestId,
        success: result.ok,
        error: result.ok
          ? null
          : ((result.data as { error?: string })?.error ?? 'Unknown error'),
      })

      // ── Return result ──
      const text =
        typeof result.data === 'string'
          ? result.data
          : JSON.stringify(result.data, null, 2)

      return {
        content: [{ type: 'text' as const, text }],
        isError: !result.ok,
      }
  })
}

// ─── Zod → JSON Schema (minimal conversion for MCP) ─────────────

function zodToJsonSchema(
  schema: z.ZodType,
  mutating: boolean,
  requireIdempotency: boolean,
): Record<string, unknown> {
  const jsonSchema = zodToObj(schema)

  if (
    mutating &&
    jsonSchema.type === 'object' &&
    typeof jsonSchema.properties === 'object'
  ) {
    const props = jsonSchema.properties as Record<string, unknown>
    props.confirm = {
      type: 'boolean',
      description:
        'Must be true to execute this write operation. Omit or set false to preview.',
    }
    // Ensure idempotency_key shows when required by this tool.
    if (requireIdempotency && !props.idempotency_key) {
      props.idempotency_key = {
        type: 'string',
        description: 'Unique key to prevent duplicate operations (required).',
      }
    }
  }

  return jsonSchema
}

function zodToObj(schema: z.ZodType): Record<string, unknown> {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault) {
    return zodToObj((schema as z.ZodOptional<z.ZodType>)._def.innerType)
  }

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodType>
    const properties: Record<string, unknown> = {}
    const required: string[] = []

    for (const [key, val] of Object.entries(shape)) {
      properties[key] = zodToObj(val)
      if (!(val instanceof z.ZodOptional || val instanceof z.ZodDefault)) {
        required.push(key)
      }
    }

    const result: Record<string, unknown> = { type: 'object', properties }
    if (required.length > 0) result.required = required
    return result
  }

  if (schema instanceof z.ZodString) {
    const result: Record<string, unknown> = { type: 'string' }
    if (schema.description) result.description = schema.description
    return result
  }

  if (schema instanceof z.ZodNumber) {
    const result: Record<string, unknown> = { type: 'number' }
    if (schema.description) result.description = schema.description
    return result
  }

  if (schema instanceof z.ZodBoolean) {
    const result: Record<string, unknown> = { type: 'boolean' }
    if (schema.description) result.description = schema.description
    return result
  }

  if (schema instanceof z.ZodEnum) {
    const result: Record<string, unknown> = {
      type: 'string',
      enum: schema._def.values,
    }
    if (schema.description) result.description = schema.description
    return result
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: 'array',
      items: zodToObj(schema._def.type),
      ...(schema.description ? { description: schema.description } : {}),
    }
  }

  if (schema instanceof z.ZodRecord) {
    return {
      type: 'object',
      additionalProperties: true,
      ...(schema.description ? { description: schema.description } : {}),
    }
  }

  return { type: 'object' }
}
