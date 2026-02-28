// Soledgic Edge Function: Release Funds
// POST /release-funds
// Manage escrow/held-funds release lifecycle.

import {
  createHandler,
  jsonResponse,
  errorResponse,
  validateId,
  validateString,
  LedgerContext,
  createAuditLogAsync,
  sanitizeForAudit,
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getPaymentProvider } from '../_shared/payment-provider.ts'

type Action = 'get_summary' | 'get_held' | 'release' | 'batch_release' | 'auto_release'

type RpcCandidate = {
  name: string
  args: Record<string, unknown>
}

type ReleaseQueueSchema = 'escrow_releases' | 'release_queue'

interface ReleaseFundsRequest {
  action?: Action
  entry_id?: string
  entry_ids?: string[]
  venture_id?: string
  creator_id?: string
  ready_only?: boolean
  limit?: number
  execute_transfer?: boolean
}

interface HeldFundRow {
  entry_id: string
  amount: number
  currency: string
  held_since: string
  days_held: number
  hold_reason: string | null
  hold_until: string | null
  ready_for_release: boolean
  recipient_type: string
  recipient_id: string
  recipient_name: string | null
  has_connected_account: boolean
  processor_account_id: string | null
  transaction_ref: string | null
  product_name: string | null
  venture_id: string | null
  release_status: 'held' | 'pending_release'
}

interface SummaryRow {
  venture_id: string | null
  venture_name?: string | null
  total_held: number
  total_ready: number
  total_pending_release: number
  entry_count: number
}

interface ReleaseTransferRecord {
  table: ReleaseQueueSchema
  release_id: string
  entry_id: string
  ledger_id: string
  amount_major: number
  currency: string
  recipient_processor_account: string | null
}

function isRpcMissing(error: any): boolean {
  if (!error) return false
  const code = String(error.code || '')
  const message = String(error.message || '').toLowerCase()
  return code === 'PGRST202' || message.includes('could not find the function')
}

function isRelationMissing(error: any): boolean {
  if (!error) return false
  const code = String(error.code || '')
  const message = String(error.message || '').toLowerCase()
  return code === 'PGRST205' || message.includes('could not find the table') || message.includes('relation')
}

async function rpcWithFallback(
  supabase: SupabaseClient,
  candidates: RpcCandidate[],
): Promise<{ data: any; error: any; used: string | null }> {
  let lastMissingError: any = null

  for (const candidate of candidates) {
    const { data, error } = await supabase.rpc(candidate.name, candidate.args)
    if (!error) {
      return { data, error: null, used: candidate.name }
    }
    if (isRpcMissing(error)) {
      lastMissingError = error
      continue
    }
    return { data: null, error, used: candidate.name }
  }

  return { data: null, error: lastMissingError || { message: 'No compatible RPC found' }, used: null }
}

function minorUnitFactor(currency: string): number {
  const c = (currency || 'USD').toUpperCase()
  if (['JPY', 'KRW', 'VND'].includes(c)) return 1
  if (['BHD', 'IQD', 'JOD', 'KWD', 'OMR', 'TND'].includes(c)) return 1000
  return 100
}

function majorToMinor(amountMajor: number, currency: string): number {
  return Math.round(amountMajor * minorUnitFactor(currency))
}

function asNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function summarizeEscrowRows(rows: any[]): SummaryRow[] {
  const summaryRows: SummaryRow[] = []

  for (const row of rows) {
    summaryRows.push({
      venture_id: row?.venture_id ? String(row.venture_id) : null,
      total_held: asNumber(row?.total_held),
      total_ready: asNumber(row?.total_ready),
      total_pending_release: asNumber(row?.total_pending_release),
      entry_count: Math.trunc(asNumber(row?.entry_count)),
    })
  }

  return summaryRows
}

function summarizeHeldSummaryRows(rows: any[]): SummaryRow[] {
  const byVenture = new Map<string, SummaryRow>()

  for (const row of rows) {
    const ventureId = row?.venture_id ? String(row.venture_id) : 'unassigned'
    const ventureName = row?.venture_name ? String(row.venture_name) : null

    const existing = byVenture.get(ventureId) || {
      venture_id: ventureId === 'unassigned' ? null : ventureId,
      venture_name: ventureName,
      total_held: 0,
      total_ready: 0,
      total_pending_release: 0,
      entry_count: 0,
    }

    existing.total_held += asNumber(row?.total_held)
    existing.total_ready += asNumber(row?.ready_for_release)
    existing.entry_count += Math.trunc(asNumber(row?.entry_count))

    if (!existing.venture_name && ventureName) {
      existing.venture_name = ventureName
    }

    byVenture.set(ventureId, existing)
  }

  return Array.from(byVenture.values())
}

async function fetchConnectedAccountMap(supabase: SupabaseClient, ledgerId: string): Promise<Map<string, string>> {
  const mapping = new Map<string, string>()

  const { data: connectedRows, error: connectedErr } = await supabase
    .from('connected_accounts')
    .select('entity_type, entity_id, processor_account_id, is_active')
    .eq('ledger_id', ledgerId)
    .eq('entity_type', 'creator')
    .eq('is_active', true)

  if (!connectedErr) {
    for (const row of connectedRows || []) {
      if (row?.entity_id && row?.processor_account_id) {
        mapping.set(String(row.entity_id), String(row.processor_account_id))
      }
    }
    return mapping
  }

  if (!isRelationMissing(connectedErr)) {
    return mapping
  }

  const { data: legacyRows } = await supabase
    .from('processor_connected_accounts')
    .select('entity_type, entity_id, processor_account_id, status')
    .eq('ledger_id', ledgerId)
    .eq('entity_type', 'creator')
    .eq('status', 'active')

  for (const row of legacyRows || []) {
    if (row?.entity_id && row?.processor_account_id) {
      mapping.set(String(row.entity_id), String(row.processor_account_id))
    }
  }

  return mapping
}

async function fetchHeldFunds(
  supabase: SupabaseClient,
  ledgerId: string,
  opts: {
    ventureId?: string | null
    creatorId?: string | null
    readyOnly: boolean
    limit: number
  },
): Promise<{ rows: HeldFundRow[]; source: string }> {
  const rpcResult = await rpcWithFallback(supabase, [
    {
      name: 'get_held_funds_dashboard',
      args: {
        p_ledger_id: ledgerId,
        p_venture_id: opts.ventureId || null,
        p_ready_only: opts.readyOnly,
        p_limit: opts.limit,
      },
    },
  ])

  if (!rpcResult.error) {
    const rows = toArray<any>(rpcResult.data)
      .filter((row) => !opts.creatorId || String(row?.recipient_id || '') === opts.creatorId)
      .map((row): HeldFundRow => ({
        entry_id: String(row.entry_id),
        amount: asNumber(row.amount),
        currency: String(row.currency || 'USD'),
        held_since: String(row.held_since || new Date().toISOString()),
        days_held: Math.trunc(asNumber(row.days_held)),
        hold_reason: row.hold_reason ? String(row.hold_reason) : null,
        hold_until: row.hold_until ? String(row.hold_until) : null,
        ready_for_release: Boolean(row.ready_for_release),
        recipient_type: String(row.recipient_type || 'creator'),
        recipient_id: String(row.recipient_id || ''),
        recipient_name: row.recipient_name ? String(row.recipient_name) : null,
        has_connected_account: Boolean(row.has_connected_account),
        processor_account_id: row.processor_account_id ? String(row.processor_account_id) : null,
        transaction_ref: row.transaction_ref ? String(row.transaction_ref) : null,
        product_name: row.product_name ? String(row.product_name) : null,
        venture_id: row.venture_id ? String(row.venture_id) : null,
        release_status: 'held',
      }))
    return { rows, source: rpcResult.used || 'get_held_funds_dashboard' }
  }

  if (!isRpcMissing(rpcResult.error)) {
    throw rpcResult.error
  }

  const { data: creatorAccounts, error: creatorErr } = await supabase
    .from('accounts')
    .select('id, entity_id, name')
    .eq('ledger_id', ledgerId)
    .eq('account_type', 'creator_balance')

  if (creatorErr) throw creatorErr

  const creatorRows = (creatorAccounts || []).filter((row) => !opts.creatorId || String(row.entity_id) === opts.creatorId)
  if (creatorRows.length === 0) return { rows: [], source: 'entries_fallback' }

  const accountIds = creatorRows.map((row) => String(row.id))
  const creatorNameByAccountId = new Map<string, { entityId: string; name: string | null }>()
  for (const row of creatorRows) {
    creatorNameByAccountId.set(String(row.id), {
      entityId: String(row.entity_id),
      name: row.name ? String(row.name) : null,
    })
  }

  const connectedByCreatorId = await fetchConnectedAccountMap(supabase, ledgerId)

  const { data: entryRows, error: entryErr } = await supabase
    .from('entries')
    .select(`
      id,
      account_id,
      amount,
      created_at,
      release_status,
      hold_reason,
      hold_until,
      transaction:transactions(
        reference_id,
        status,
        currency,
        metadata
      )
    `)
    .in('account_id', accountIds)
    .eq('entry_type', 'credit')
    .in('release_status', ['held', 'pending_release'])
    .order('created_at', { ascending: true })
    .limit(Math.max(opts.limit * 5, opts.limit))

  if (entryErr) throw entryErr

  const now = Date.now()
  const rows: HeldFundRow[] = []

  for (const row of entryRows || []) {
    const accountMeta = creatorNameByAccountId.get(String(row.account_id))
    if (!accountMeta) continue

    const txStatus = String(row?.transaction?.status || '')
    if (txStatus === 'voided' || txStatus === 'reversed') continue

    const holdUntil = row.hold_until ? String(row.hold_until) : null
    const holdUntilMs = holdUntil ? Date.parse(holdUntil) : NaN
    const readyForRelease = !holdUntil || (Number.isFinite(holdUntilMs) && holdUntilMs <= now)
    if (opts.readyOnly && !readyForRelease) continue

    const ventureId = row?.transaction?.metadata?.venture_id
      ? String(row.transaction.metadata.venture_id)
      : null

    if (opts.ventureId && ventureId !== opts.ventureId) continue

    const releaseStatus = String(row.release_status || 'held') as 'held' | 'pending_release'

    rows.push({
      entry_id: String(row.id),
      amount: asNumber(row.amount),
      currency: String(row?.transaction?.currency || 'USD').toUpperCase(),
      held_since: String(row.created_at || new Date().toISOString()),
      days_held: Math.max(0, Math.floor((now - Date.parse(String(row.created_at))) / (1000 * 60 * 60 * 24))),
      hold_reason: row.hold_reason ? String(row.hold_reason) : null,
      hold_until: holdUntil,
      ready_for_release: readyForRelease,
      recipient_type: 'creator',
      recipient_id: accountMeta.entityId,
      recipient_name: accountMeta.name,
      has_connected_account: connectedByCreatorId.has(accountMeta.entityId),
      processor_account_id: connectedByCreatorId.get(accountMeta.entityId) || null,
      transaction_ref: row?.transaction?.reference_id ? String(row.transaction.reference_id) : null,
      product_name: row?.transaction?.metadata?.product_name
        ? String(row.transaction.metadata.product_name)
        : null,
      venture_id: ventureId,
      release_status: releaseStatus,
    })
  }

  rows.sort((a, b) => Date.parse(a.held_since) - Date.parse(b.held_since))

  return { rows: rows.slice(0, opts.limit), source: 'entries_fallback' }
}

async function fetchSummary(
  supabase: SupabaseClient,
  ledgerId: string,
): Promise<{ rows: SummaryRow[]; source: string }> {
  const escrowSummary = await rpcWithFallback(supabase, [
    { name: 'get_escrow_summary', args: { p_ledger_id: ledgerId } },
  ])

  if (!escrowSummary.error) {
    return {
      rows: summarizeEscrowRows(toArray<any>(escrowSummary.data)),
      source: escrowSummary.used || 'get_escrow_summary',
    }
  }

  if (!isRpcMissing(escrowSummary.error)) {
    throw escrowSummary.error
  }

  const heldSummary = await rpcWithFallback(supabase, [
    { name: 'get_held_funds_summary', args: { p_ledger_id: ledgerId } },
  ])

  if (heldSummary.error) {
    throw heldSummary.error
  }

  return {
    rows: summarizeHeldSummaryRows(toArray<any>(heldSummary.data)),
    source: heldSummary.used || 'get_held_funds_summary',
  }
}

async function requestRelease(
  supabase: SupabaseClient,
  entryId: string,
  releaseType: 'manual' | 'auto',
): Promise<{ releaseId: string; rpcUsed: string }> {
  const response = await rpcWithFallback(supabase, [
    {
      name: 'request_fund_release',
      args: {
        p_entry_id: entryId,
        p_requested_by: null,
        p_release_type: releaseType,
      },
    },
    {
      name: 'request_release',
      args: {
        p_entry_id: entryId,
        p_requested_by: null,
        p_release_type: releaseType,
      },
    },
  ])

  if (response.error) throw response.error

  const releaseId = String(response.data || '')
  if (!isUuidLike(releaseId)) {
    throw new Error('Release request did not return a valid release ID')
  }

  return {
    releaseId,
    rpcUsed: response.used || 'request_fund_release',
  }
}

async function fetchReleaseTransferRecord(
  supabase: SupabaseClient,
  ledgerId: string,
  releaseId: string,
): Promise<ReleaseTransferRecord | null> {
  const { data: escrowRelease, error: escrowError } = await supabase
    .from('escrow_releases')
    .select('id, entry_id, ledger_id, amount, currency, recipient_processor_account')
    .eq('id', releaseId)
    .eq('ledger_id', ledgerId)
    .maybeSingle()

  if (!escrowError && escrowRelease) {
    return {
      table: 'escrow_releases',
      release_id: String(escrowRelease.id),
      entry_id: String(escrowRelease.entry_id),
      ledger_id: String(escrowRelease.ledger_id),
      amount_major: asNumber(escrowRelease.amount),
      currency: String(escrowRelease.currency || 'USD').toUpperCase(),
      recipient_processor_account: escrowRelease.recipient_processor_account
        ? String(escrowRelease.recipient_processor_account)
        : null,
    }
  }

  if (escrowError && !isRelationMissing(escrowError)) {
    throw escrowError
  }

  const { data: legacyRelease, error: legacyError } = await supabase
    .from('release_queue')
    .select('id, entry_id, ledger_id, amount, currency, recipient_processor_account_id')
    .eq('id', releaseId)
    .eq('ledger_id', ledgerId)
    .maybeSingle()

  if (legacyError && !isRelationMissing(legacyError)) {
    throw legacyError
  }

  if (!legacyRelease) return null

  return {
    table: 'release_queue',
    release_id: String(legacyRelease.id),
    entry_id: String(legacyRelease.entry_id),
    ledger_id: String(legacyRelease.ledger_id),
    amount_major: asNumber(legacyRelease.amount),
    currency: String(legacyRelease.currency || 'USD').toUpperCase(),
    recipient_processor_account: legacyRelease.recipient_processor_account_id
      ? String(legacyRelease.recipient_processor_account_id)
      : null,
  }
}

async function completeRelease(
  supabase: SupabaseClient,
  releaseId: string,
  processorTransferId: string,
): Promise<string> {
  const response = await rpcWithFallback(supabase, [
    {
      name: 'complete_fund_release',
      args: {
        p_release_id: releaseId,
        p_processor_transfer_id: processorTransferId,
        p_approved_by: null,
      },
    },
    {
      name: 'complete_release',
      args: {
        p_release_id: releaseId,
        p_processor_transfer_id: processorTransferId,
        p_approved_by: null,
      },
    },
  ])

  if (response.error) throw response.error
  return response.used || 'complete_fund_release'
}

async function failRelease(
  supabase: SupabaseClient,
  releaseRecord: ReleaseTransferRecord,
  errorCode: string,
  errorMessage: string,
): Promise<void> {
  if (releaseRecord.table === 'escrow_releases') {
    const rpcResult = await rpcWithFallback(supabase, [
      {
        name: 'fail_fund_release',
        args: {
          p_release_id: releaseRecord.release_id,
          p_error_code: errorCode,
          p_error_message: errorMessage,
        },
      },
    ])

    if (!rpcResult.error) return

    if (!isRpcMissing(rpcResult.error)) {
      throw rpcResult.error
    }

    await supabase
      .from('escrow_releases')
      .update({
        status: 'failed',
        processor_error_code: errorCode,
        processor_error_message: errorMessage,
      })
      .eq('id', releaseRecord.release_id)

    await supabase
      .from('entries')
      .update({ release_status: 'held' })
      .eq('id', releaseRecord.entry_id)
      .eq('release_status', 'pending_release')

    return
  }

  await supabase
    .from('release_queue')
    .update({ status: 'failed', processor_error: `${errorCode}: ${errorMessage}` })
    .eq('id', releaseRecord.release_id)

  await supabase
    .from('entries')
    .update({ release_status: 'held' })
    .eq('id', releaseRecord.entry_id)
    .eq('release_status', 'pending_release')
}

async function executeReleaseTransfer(
  supabase: SupabaseClient,
  ledger: LedgerContext,
  releaseId: string,
): Promise<{
  success: boolean
  releaseId: string
  transferId: string | null
  providerStatus: string | null
  amountMinor: number | null
  amountMajor: number | null
  currency: string | null
  error: string | null
  completionRpc: string | null
}> {
  const releaseRecord = await fetchReleaseTransferRecord(supabase, ledger.id, releaseId)

  if (!releaseRecord) {
    return {
      success: false,
      releaseId,
      transferId: null,
      providerStatus: null,
      amountMinor: null,
      amountMajor: null,
      currency: null,
      error: 'Release record not found after queuing',
      completionRpc: null,
    }
  }

  if (!releaseRecord.recipient_processor_account) {
    await failRelease(supabase, releaseRecord, 'missing_destination', 'Missing recipient processor account')
    return {
      success: false,
      releaseId,
      transferId: null,
      providerStatus: null,
      amountMinor: null,
      amountMajor: releaseRecord.amount_major,
      currency: releaseRecord.currency,
      error: 'Missing recipient processor account',
      completionRpc: null,
    }
  }

  if (releaseRecord.amount_major <= 0) {
    await failRelease(supabase, releaseRecord, 'invalid_amount', 'Release amount must be positive')
    return {
      success: false,
      releaseId,
      transferId: null,
      providerStatus: null,
      amountMinor: null,
      amountMajor: releaseRecord.amount_major,
      currency: releaseRecord.currency,
      error: 'Release amount must be positive',
      completionRpc: null,
    }
  }

  const amountMinor = majorToMinor(releaseRecord.amount_major, releaseRecord.currency)
  const provider = getPaymentProvider('card')

  const transfer = await provider.createPaymentIntent({
    amount: amountMinor,
    currency: releaseRecord.currency,
    destination_id: releaseRecord.recipient_processor_account,
    metadata: {
      soledgic_ledger_id: ledger.id,
      soledgic_release_id: releaseRecord.release_id,
      soledgic_release_table: releaseRecord.table,
    },
    description: `Escrow release ${releaseRecord.release_id}`,
  })

  if (!transfer.success || !transfer.id) {
    const errorMessage = transfer.error || 'Transfer execution failed'
    await failRelease(supabase, releaseRecord, 'processor_transfer_failed', errorMessage)

    return {
      success: false,
      releaseId,
      transferId: null,
      providerStatus: transfer.status || null,
      amountMinor,
      amountMajor: releaseRecord.amount_major,
      currency: releaseRecord.currency,
      error: errorMessage,
      completionRpc: null,
    }
  }

  const completionRpc = await completeRelease(supabase, releaseRecord.release_id, transfer.id)

  return {
    success: true,
    releaseId,
    transferId: transfer.id,
    providerStatus: transfer.status || null,
    amountMinor,
    amountMajor: releaseRecord.amount_major,
    currency: releaseRecord.currency,
    error: null,
    completionRpc,
  }
}

async function listPendingReleaseIds(
  supabase: SupabaseClient,
  ledgerId: string,
  limit: number,
): Promise<string[]> {
  const { data: escrowRows, error: escrowErr } = await supabase
    .from('escrow_releases')
    .select('id')
    .eq('ledger_id', ledgerId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (!escrowErr) {
    return (escrowRows || []).map((row) => String(row.id)).filter((id) => isUuidLike(id))
  }

  if (!isRelationMissing(escrowErr)) {
    throw escrowErr
  }

  const { data: legacyRows, error: legacyErr } = await supabase
    .from('release_queue')
    .select('id')
    .eq('ledger_id', ledgerId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (legacyErr) throw legacyErr

  return (legacyRows || []).map((row) => String(row.id)).filter((id) => isUuidLike(id))
}

function normalizeLimit(raw: unknown, defaultValue = 100, max = 500): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return defaultValue
  return Math.max(1, Math.min(max, Math.trunc(n)))
}

const handler = createHandler(
  { endpoint: 'release-funds', requireAuth: true, rateLimit: true },
  async (req: Request, supabase: SupabaseClient, ledger: LedgerContext | null, body: ReleaseFundsRequest, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    const action = body?.action || 'get_summary'

    try {
      switch (action) {
        case 'get_summary': {
          const { rows, source } = await fetchSummary(supabase, ledger.id)

          const totalHeld = rows.reduce((sum, row) => sum + asNumber(row.total_held), 0)
          const totalReady = rows.reduce((sum, row) => sum + asNumber(row.total_ready), 0)
          const totalPending = rows.reduce((sum, row) => sum + asNumber(row.total_pending_release), 0)

          return jsonResponse(
            {
              success: true,
              source,
              summary: {
                total_held: Math.round(totalHeld * 100) / 100,
                total_ready: Math.round(totalReady * 100) / 100,
                total_pending_release: Math.round(totalPending * 100) / 100,
                venture_count: rows.length,
                ventures: rows.map((row) => ({
                  venture_id: row.venture_id,
                  venture_name: row.venture_name || row.venture_id || 'Unassigned',
                  total_held: Math.round(asNumber(row.total_held) * 100) / 100,
                  total_ready: Math.round(asNumber(row.total_ready) * 100) / 100,
                  total_pending_release: Math.round(asNumber(row.total_pending_release) * 100) / 100,
                  entry_count: Math.trunc(asNumber(row.entry_count)),
                })),
              },
            },
            200,
            req,
            requestId,
          )
        }

        case 'get_held': {
          const ventureId = body.venture_id ? validateId(body.venture_id, 100) : null
          if (body.venture_id && !ventureId) {
            return errorResponse('Invalid venture_id', 400, req, requestId)
          }

          const creatorId = body.creator_id ? validateId(body.creator_id, 100) : null
          if (body.creator_id && !creatorId) {
            return errorResponse('Invalid creator_id', 400, req, requestId)
          }

          const readyOnly = body.ready_only === true
          const limit = normalizeLimit(body.limit, 100, 1000)

          const { rows, source } = await fetchHeldFunds(supabase, ledger.id, {
            ventureId,
            creatorId,
            readyOnly,
            limit,
          })

          return jsonResponse(
            {
              success: true,
              source,
              data: rows,
              count: rows.length,
            },
            200,
            req,
            requestId,
          )
        }

        case 'release': {
          const entryId = body.entry_id ? validateId(body.entry_id, 120) : null
          if (!entryId || !isUuidLike(entryId)) {
            return errorResponse('entry_id is required and must be a valid UUID', 400, req, requestId)
          }

          const executeTransfer = body.execute_transfer !== false

          const queued = await requestRelease(supabase, entryId, 'manual')

          let transferResult: Awaited<ReturnType<typeof executeReleaseTransfer>> | null = null
          if (executeTransfer) {
            transferResult = await executeReleaseTransfer(supabase, ledger, queued.releaseId)
            if (!transferResult.success) {
              return errorResponse(transferResult.error || 'Failed to execute release transfer', 502, req, requestId)
            }
          }

          createAuditLogAsync(
            supabase,
            req,
            {
              ledger_id: ledger.id,
              action: executeTransfer ? 'release_funds_executed' : 'release_funds_queued',
              entity_type: 'entry',
              entity_id: entryId,
              actor_type: 'api',
              request_body: sanitizeForAudit({
                action,
                entry_id: entryId,
                execute_transfer: executeTransfer,
                request_release_rpc: queued.rpcUsed,
                release_id: queued.releaseId,
                transfer_id: transferResult?.transferId || null,
              }),
              response_status: 200,
              risk_score: 45,
            },
            requestId,
          )

          return jsonResponse(
            {
              success: true,
              release_id: queued.releaseId,
              entry_id: entryId,
              queued_with: queued.rpcUsed,
              executed: executeTransfer,
              transfer_id: transferResult?.transferId || null,
              transfer_status: transferResult?.providerStatus || null,
              completion_rpc: transferResult?.completionRpc || null,
              amount: transferResult?.amountMajor || null,
              currency: transferResult?.currency || null,
            },
            200,
            req,
            requestId,
          )
        }

        case 'batch_release': {
          const rawEntryIds = Array.isArray(body.entry_ids) ? body.entry_ids : []
          const executeTransfer = body.execute_transfer !== false

          const uniqueEntryIds = Array.from(new Set(rawEntryIds.map((id) => String(id))))
          const entryIds = uniqueEntryIds
            .map((id) => validateId(id, 120))
            .filter((id): id is string => Boolean(id && isUuidLike(id)))

          if (entryIds.length === 0) {
            return errorResponse('entry_ids must contain at least one valid UUID', 400, req, requestId)
          }

          if (entryIds.length > 100) {
            return errorResponse('batch_release supports up to 100 entries per request', 400, req, requestId)
          }

          const results: Array<{
            entry_id: string
            success: boolean
            release_id?: string
            transfer_id?: string | null
            error?: string
          }> = []

          for (const entryId of entryIds) {
            try {
              const queued = await requestRelease(supabase, entryId, 'manual')

              let transferId: string | null = null
              if (executeTransfer) {
                const transferResult = await executeReleaseTransfer(supabase, ledger, queued.releaseId)
                if (!transferResult.success) {
                  results.push({
                    entry_id: entryId,
                    success: false,
                    release_id: queued.releaseId,
                    error: transferResult.error || 'Transfer execution failed',
                  })
                  continue
                }
                transferId = transferResult.transferId
              }

              results.push({
                entry_id: entryId,
                success: true,
                release_id: queued.releaseId,
                transfer_id: transferId,
              })
            } catch (error: any) {
              results.push({
                entry_id: entryId,
                success: false,
                error: String(error?.message || error || 'Failed to release entry'),
              })
            }
          }

          const successCount = results.filter((r) => r.success).length
          const failureCount = results.length - successCount

          createAuditLogAsync(
            supabase,
            req,
            {
              ledger_id: ledger.id,
              action: executeTransfer ? 'batch_release_funds_executed' : 'batch_release_funds_queued',
              entity_type: 'ledger',
              entity_id: ledger.id,
              actor_type: 'api',
              request_body: sanitizeForAudit({
                action,
                execute_transfer: executeTransfer,
                requested_count: entryIds.length,
                success_count: successCount,
                failure_count: failureCount,
              }),
              response_status: failureCount > 0 ? 207 : 200,
              risk_score: 55,
            },
            requestId,
          )

          return jsonResponse(
            {
              success: failureCount === 0,
              requested: entryIds.length,
              success_count: successCount,
              failure_count: failureCount,
              executed: executeTransfer,
              results,
            },
            failureCount > 0 ? 207 : 200,
            req,
            requestId,
          )
        }

        case 'auto_release': {
          const executeTransfer = body.execute_transfer === true
          const limit = normalizeLimit(body.limit, 100, 1000)

          const queueResult = await rpcWithFallback(supabase, [
            { name: 'queue_auto_releases', args: { p_ledger_id: ledger.id } },
            { name: 'auto_release_ready_funds', args: { p_ledger_id: ledger.id } },
          ])

          if (queueResult.error) {
            throw queueResult.error
          }

          const queuedCount = Math.trunc(asNumber(queueResult.data))
          const queuedWith = queueResult.used || 'queue_auto_releases'

          const executions: Array<{
            release_id: string
            success: boolean
            transfer_id?: string | null
            error?: string
          }> = []

          if (executeTransfer && queuedCount > 0) {
            const releaseIds = await listPendingReleaseIds(supabase, ledger.id, Math.max(limit, queuedCount))
            for (const releaseId of releaseIds) {
              const transfer = await executeReleaseTransfer(supabase, ledger, releaseId)
              if (transfer.success) {
                executions.push({
                  release_id: releaseId,
                  success: true,
                  transfer_id: transfer.transferId,
                })
              } else {
                executions.push({
                  release_id: releaseId,
                  success: false,
                  error: transfer.error || 'Transfer execution failed',
                })
              }
            }
          }

          const executedCount = executions.filter((r) => r.success).length
          const executeFailures = executions.length - executedCount

          return jsonResponse(
            {
              success: executeFailures === 0,
              queued_count: queuedCount,
              queued_with: queuedWith,
              executed: executeTransfer,
              executed_count: executedCount,
              execution_failures: executeFailures,
              executions,
            },
            executeFailures > 0 ? 207 : 200,
            req,
            requestId,
          )
        }

        default: {
          const safeAction = body?.action ? validateString(String(body.action), 50) : null
          return errorResponse(`Unknown action: ${safeAction || 'undefined'}`, 400, req, requestId)
        }
      }
    } catch (error: any) {
      const message = String(error?.message || error || 'Unknown error')
      const normalized = message.toLowerCase()

      if (
        normalized.includes('not found') ||
        normalized.includes('no active connected account') ||
        normalized.includes('cannot receive transfers') ||
        normalized.includes('not held') ||
        normalized.includes('already')
      ) {
        return errorResponse(message, 409, req, requestId)
      }

      if (normalized.includes('invalid') || normalized.includes('must be')) {
        return errorResponse(message, 400, req, requestId)
      }

      console.error(`[${requestId}] release-funds error:`, error)
      return errorResponse('Failed to process release-funds request', 500, req, requestId)
    }
  },
)

Deno.serve(handler)
