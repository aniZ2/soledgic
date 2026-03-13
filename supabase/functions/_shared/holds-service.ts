import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  createAuditLogAsync,
  LedgerContext,
  sanitizeForAudit,
  validateId,
} from './utils.ts'
import { getPaymentProvider } from './payment-provider.ts'
import {
  ResourceResult,
  resourceError,
  resourceOk,
} from './treasury-resource.ts'

type RpcCandidate = {
  name: string
  args: Record<string, unknown>
}

type ReleaseQueueSchema = 'escrow_releases' | 'release_queue'

export interface HoldsQueryRequest {
  entry_id?: string
  venture_id?: string
  participant_id?: string
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
    if (!error) return { data, error: null, used: candidate.name }
    if (isRpcMissing(error)) {
      lastMissingError = error
      continue
    }
    return { data: null, error, used: candidate.name }
  }

  return { data: null, error: lastMissingError || { message: 'No compatible RPC found' }, used: null }
}

function minorUnitFactor(currency: string): number {
  const normalized = (currency || 'USD').toUpperCase()
  if (['JPY', 'KRW', 'VND'].includes(normalized)) return 1
  if (['BHD', 'IQD', 'JOD', 'KWD', 'OMR', 'TND'].includes(normalized)) return 1000
  return 100
}

function majorToMinor(amountMajor: number, currency: string): number {
  return Math.round(amountMajor * minorUnitFactor(currency))
}

function asNumber(value: unknown): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function summarizeEscrowRows(rows: any[]): SummaryRow[] {
  return rows.map((row) => ({
    venture_id: row?.venture_id ? String(row.venture_id) : null,
    total_held: asNumber(row?.total_held),
    total_ready: asNumber(row?.total_ready),
    total_pending_release: asNumber(row?.total_pending_release),
    entry_count: Math.trunc(asNumber(row?.entry_count)),
  }))
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

  const { data: connectedRows, error: connectedError } = await supabase
    .from('connected_accounts')
    .select('entity_type, entity_id, processor_account_id, is_active')
    .eq('ledger_id', ledgerId)
    .eq('entity_type', 'creator')
    .eq('is_active', true)

  if (!connectedError) {
    for (const row of connectedRows || []) {
      if (row?.entity_id && row?.processor_account_id) {
        mapping.set(String(row.entity_id), String(row.processor_account_id))
      }
    }
    return mapping
  }

  if (!isRelationMissing(connectedError)) {
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
  options: {
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
        p_venture_id: options.ventureId || null,
        p_ready_only: options.readyOnly,
        p_limit: options.limit,
      },
    },
  ])

  if (!rpcResult.error) {
    const rows = toArray<any>(rpcResult.data)
      .filter((row) => !options.creatorId || String(row?.recipient_id || '') === options.creatorId)
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

  const { data: creatorAccounts, error: creatorError } = await supabase
    .from('accounts')
    .select('id, entity_id, name')
    .eq('ledger_id', ledgerId)
    .eq('account_type', 'creator_balance')

  if (creatorError) throw creatorError

  const creatorRows = (creatorAccounts || []).filter((row) => !options.creatorId || String(row.entity_id) === options.creatorId)
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

  const { data: entryRows, error: entryError } = await supabase
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
    .limit(Math.max(options.limit * 5, options.limit))

  if (entryError) throw entryError

  const now = Date.now()
  const rows: HeldFundRow[] = []

  for (const row of entryRows || []) {
    const accountMeta = creatorNameByAccountId.get(String(row.account_id))
    if (!accountMeta) continue

    const transaction = Array.isArray((row as any).transaction)
      ? (row as any).transaction[0]
      : (row as any).transaction

    const txStatus = String(transaction?.status || '')
    if (txStatus === 'voided' || txStatus === 'reversed') continue

    const holdUntil = row.hold_until ? String(row.hold_until) : null
    const holdUntilMs = holdUntil ? Date.parse(holdUntil) : NaN
    const readyForRelease = !holdUntil || (Number.isFinite(holdUntilMs) && holdUntilMs <= now)
    if (options.readyOnly && !readyForRelease) continue

    const ventureId = transaction?.metadata?.venture_id
      ? String(transaction.metadata.venture_id)
      : null

    if (options.ventureId && ventureId !== options.ventureId) continue

    const releaseStatus = String(row.release_status || 'held') as 'held' | 'pending_release'

    rows.push({
      entry_id: String(row.id),
      amount: asNumber(row.amount),
      currency: String(transaction?.currency || 'USD').toUpperCase(),
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
      transaction_ref: transaction?.reference_id ? String(transaction.reference_id) : null,
      product_name: transaction?.metadata?.product_name ? String(transaction.metadata.product_name) : null,
      venture_id: ventureId,
      release_status: releaseStatus,
    })
  }

  rows.sort((left, right) => Date.parse(left.held_since) - Date.parse(right.held_since))
  return { rows: rows.slice(0, options.limit), source: 'entries_fallback' }
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

  if (heldSummary.error) throw heldSummary.error

  return {
    rows: summarizeHeldSummaryRows(toArray<any>(heldSummary.data)),
    source: heldSummary.used || 'get_held_funds_summary',
  }
}

async function requestRelease(
  supabase: SupabaseClient,
  entryId: string,
): Promise<{ releaseId: string; rpcUsed: string }> {
  const response = await rpcWithFallback(supabase, [
    {
      name: 'request_fund_release',
      args: {
        p_entry_id: entryId,
        p_requested_by: null,
        p_release_type: 'manual',
      },
    },
    {
      name: 'request_release',
      args: {
        p_entry_id: entryId,
        p_requested_by: null,
        p_release_type: 'manual',
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
  transferId: string | null
  providerStatus: string | null
  amountMajor: number | null
  currency: string | null
  error: string | null
  completionRpc: string | null
}> {
  const releaseRecord = await fetchReleaseTransferRecord(supabase, ledger.id, releaseId)

  if (!releaseRecord) {
    return {
      success: false,
      transferId: null,
      providerStatus: null,
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
      transferId: null,
      providerStatus: null,
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
      transferId: null,
      providerStatus: null,
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
    idempotency_id: `release_${releaseRecord.release_id}`,
  })

  if (!transfer.success || !transfer.id) {
    const errorMessage = transfer.error || 'Transfer execution failed'
    await failRelease(supabase, releaseRecord, 'processor_transfer_failed', errorMessage)
    return {
      success: false,
      transferId: null,
      providerStatus: transfer.status || null,
      amountMajor: releaseRecord.amount_major,
      currency: releaseRecord.currency,
      error: errorMessage,
      completionRpc: null,
    }
  }

  const completionRpc = await completeRelease(supabase, releaseRecord.release_id, transfer.id)
  return {
    success: true,
    transferId: transfer.id,
    providerStatus: transfer.status || null,
    amountMajor: releaseRecord.amount_major,
    currency: releaseRecord.currency,
    error: null,
    completionRpc,
  }
}

function normalizeLimit(raw: unknown, defaultValue = 100, max = 500): number {
  const numeric = Number(raw)
  if (!Number.isFinite(numeric)) return defaultValue
  return Math.max(1, Math.min(max, Math.trunc(numeric)))
}

export async function listHeldFundsResponse(
  _req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: HoldsQueryRequest,
  requestId: string,
): Promise<ResourceResult> {
  const ventureId = body.venture_id ? validateId(body.venture_id, 100) : null
  if (body.venture_id && !ventureId) {
    return resourceError('Invalid venture_id', 400, {}, 'invalid_venture_id')
  }

  const participantId = body.participant_id ? validateId(body.participant_id, 100) : null
  if (body.participant_id && !participantId) {
    return resourceError('Invalid participant_id', 400, {}, 'invalid_participant_id')
  }

  try {
    const readyOnly = body.ready_only === true
    const limit = normalizeLimit(body.limit, 100, 1000)
    const { rows, source } = await fetchHeldFunds(supabase, ledger.id, {
      ventureId,
      creatorId: participantId,
      readyOnly,
      limit,
    })

    return resourceOk({
      success: true,
      source,
      holds: rows.map((row) => ({
        id: row.entry_id,
        participant_id: row.recipient_id,
        participant_name: row.recipient_name,
        amount: row.amount,
        currency: row.currency,
        held_since: row.held_since,
        days_held: row.days_held,
        hold_reason: row.hold_reason,
        hold_until: row.hold_until,
        ready_for_release: row.ready_for_release,
        release_status: row.release_status,
        transaction_reference: row.transaction_ref,
        product_name: row.product_name,
        venture_id: row.venture_id,
        connected_account_ready: row.has_connected_account,
      })),
      count: rows.length,
    })
  } catch (error: any) {
    console.error(`[${requestId}] holds list error:`, error)
    return resourceError('Failed to fetch held funds', 500, {}, 'holds_fetch_failed')
  }
}

export async function getHeldFundsSummaryResponse(
  _req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  requestId: string,
): Promise<ResourceResult> {
  try {
    const { rows, source } = await fetchSummary(supabase, ledger.id)
    const totalHeld = rows.reduce((sum, row) => sum + asNumber(row.total_held), 0)
    const totalReady = rows.reduce((sum, row) => sum + asNumber(row.total_ready), 0)
    const totalPending = rows.reduce((sum, row) => sum + asNumber(row.total_pending_release), 0)

    return resourceOk({
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
    })
  } catch (error: any) {
    console.error(`[${requestId}] holds summary error:`, error)
    return resourceError('Failed to fetch held funds summary', 500, {}, 'holds_summary_fetch_failed')
  }
}

export async function releaseHeldFundsResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: HoldsQueryRequest,
  requestId: string,
): Promise<ResourceResult> {
  const entryId = body.entry_id ? validateId(body.entry_id, 120) : null
  if (!entryId || !isUuidLike(entryId)) {
    return resourceError('entry_id is required and must be a valid UUID', 400, {}, 'invalid_hold_id')
  }

  try {
    const executeTransfer = body.execute_transfer !== false
    const queued = await requestRelease(supabase, entryId)

    let transferResult: Awaited<ReturnType<typeof executeReleaseTransfer>> | null = null
    if (executeTransfer) {
      transferResult = await executeReleaseTransfer(supabase, ledger, queued.releaseId)
      if (!transferResult.success) {
        return resourceError(transferResult.error || 'Failed to execute release transfer', 502, {}, 'release_transfer_failed')
      }
    }

    createAuditLogAsync(supabase, req, {
      ledger_id: ledger.id,
      action: executeTransfer ? 'release_funds_executed' : 'release_funds_queued',
      entity_type: 'entry',
      entity_id: entryId,
      actor_type: 'api',
      request_body: sanitizeForAudit({
        entry_id: entryId,
        execute_transfer: executeTransfer,
        request_release_rpc: queued.rpcUsed,
        release_id: queued.releaseId,
        transfer_id: transferResult?.transferId || null,
      }),
      response_status: 200,
      risk_score: 45,
    }, requestId)

    return resourceOk({
      success: true,
      release: {
        id: queued.releaseId,
        hold_id: entryId,
        queued_with: queued.rpcUsed,
        executed: executeTransfer,
        transfer_id: transferResult?.transferId || null,
        transfer_status: transferResult?.providerStatus || null,
        completion_rpc: transferResult?.completionRpc || null,
        amount: transferResult?.amountMajor || null,
        currency: transferResult?.currency || null,
      },
    })
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
      return resourceError(message, 409, {}, 'hold_release_conflict')
    }

    if (normalized.includes('invalid') || normalized.includes('must be')) {
      return resourceError(message, 400, {}, 'invalid_hold_release_request')
    }

    console.error(`[${requestId}] holds release error:`, error)
    return resourceError('Failed to process release request', 500, {}, 'hold_release_failed')
  }
}
