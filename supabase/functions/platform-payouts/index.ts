// SERVICE_ID: SVC_PLATFORM_PAYOUT
//
// Handles payouts from Soledgic to platform organizations (their accumulated
// platform_revenue). Money moves via Mercury ACH to the org's configured
// bank account.
//
// This is Soledgic paying the platform their commission — separate from
// creator payouts (which go from creator_balance to creators).
//
// Auth: requireAuth (API key) + admin only via proxy.

import {
  createHandler,
  jsonResponse,
  errorResponse,
  LedgerContext,
  createAuditLog,
  sanitizeForAudit,
  validateAmount,
} from '../_shared/utils.ts'
import { sendACH, createRecipient, getRecipient, listRecipients, getAccountBalance } from '../_shared/mercury-client.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface PlatformPayoutRequest {
  action: 'request' | 'status' | 'history'
  amount?: number       // cents — if omitted, pays out full available balance
  description?: string
  reference_id?: string
}

async function getPlatformBalance(supabase: SupabaseClient, ledgerId: string): Promise<number> {
  // Sum credits - debits on platform_revenue account
  const { data: account } = await supabase
    .from('accounts')
    .select('id')
    .eq('ledger_id', ledgerId)
    .eq('account_type', 'platform_revenue')
    .limit(1)
    .single()

  if (!account) return 0

  const { data: entries } = await supabase
    .from('entries')
    .select('entry_type, amount, transactions!inner(status)')
    .eq('account_id', account.id)
    .not('transactions.status', 'in', '("voided","reversed")')

  let balance = 0
  for (const e of entries || []) {
    balance += e.entry_type === 'credit' ? Number(e.amount) : -Number(e.amount)
  }
  return Math.round(balance * 100) // return cents
}

async function getOrgMercuryRecipientId(supabase: SupabaseClient, organizationId: string): Promise<string | null> {
  const { data: org } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', organizationId)
    .single()

  const settings = org?.settings as Record<string, unknown> | null
  const payout = settings?.payout as Record<string, unknown> | undefined
  return (payout?.mercury_recipient_id as string) || null
}

const handler = createHandler(
  { endpoint: 'platform-payouts', requireAuth: true, rateLimit: true },
  async (req, supabase, ledger: LedgerContext | null, body, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    const payload = (body || {}) as PlatformPayoutRequest

    if (payload.action === 'history') {
      const { data: payouts } = await supabase
        .from('transactions')
        .select('id, amount, status, reference_id, description, metadata, created_at')
        .eq('ledger_id', ledger.id)
        .eq('transaction_type', 'platform_payout')
        .order('created_at', { ascending: false })
        .limit(50)

      return jsonResponse({ success: true, payouts: payouts || [] }, 200, req, requestId)
    }

    if (payload.action === 'status') {
      const balanceCents = await getPlatformBalance(supabase, ledger.id)
      return jsonResponse({
        success: true,
        available_balance_cents: balanceCents,
        available_balance: balanceCents / 100,
      }, 200, req, requestId)
    }

    if (payload.action === 'mercury_balance') {
      const mercuryBalance = await getAccountBalance()
      return jsonResponse({ success: true, mercury_balance: mercuryBalance }, 200, req, requestId)
    }

    if (payload.action === 'list_recipients') {
      const recipients = await listRecipients()
      return jsonResponse({ success: true, recipients }, 200, req, requestId)
    }

    if (payload.action === 'get_recipient') {
      const recipientId = await getOrgMercuryRecipientId(supabase, ledger.organization_id || '')
      if (!recipientId) {
        return jsonResponse({ success: true, recipient: null }, 200, req, requestId)
      }
      const recipient = await getRecipient(recipientId)
      return jsonResponse({ success: true, recipient }, 200, req, requestId)
    }

    if (payload.action === 'configure_recipient') {
      const input = body as Record<string, unknown>
      if (!input.name || !input.account_number || !input.routing_number) {
        return errorResponse('name, account_number, and routing_number required', 400, req, requestId)
      }
      const result = await createRecipient({
        name: String(input.name),
        accountNumber: String(input.account_number),
        routingNumber: String(input.routing_number),
        email: typeof input.email === 'string' ? input.email : undefined,
      })
      if (!result.success) {
        return errorResponse(result.error || 'Failed to create recipient', 500, req, requestId)
      }
      // Store recipient ID in org settings
      await supabase.rpc('jsonb_merge_capabilities', {
        p_org_id: ledger.organization_id,
        p_patch: { payout: { mercury_recipient_id: result.recipientId } },
      }).then(() => {}, () => {
        // Fallback: direct update
        supabase.from('organizations')
          .update({ settings: { payout: { mercury_recipient_id: result.recipientId } } })
          .eq('id', ledger.organization_id)
      })
      return jsonResponse({ success: true, recipient_id: result.recipientId }, 200, req, requestId)
    }

    if (payload.action !== 'request') {
      return errorResponse('Invalid action. Use: request, status, history, mercury_balance, list_recipients, get_recipient, configure_recipient', 400, req, requestId)
    }

    // ── Execute platform payout ──────────────────────────────
    // Extra gate: require x-actor-type header to be 'admin' or actor source to be 'soledgic-dashboard'
    // This prevents API key holders from triggering payouts without dashboard context
    const actorType = req.headers.get('x-actor-type') || ''
    const actorSource = req.headers.get('x-actor-source') || ''
    if (actorType !== 'admin' && actorSource !== 'soledgic-dashboard') {
      return errorResponse('Platform payouts require admin authorization via dashboard', 403, req, requestId)
    }

    if (!ledger.organization_id) {
      return errorResponse('Organization not found for this ledger', 400, req, requestId)
    }

    const balanceCents = await getPlatformBalance(supabase, ledger.id)
    const requestedCents = payload.amount ? validateAmount(payload.amount) : balanceCents

    if (requestedCents === null || requestedCents <= 0) {
      return errorResponse('Invalid amount', 400, req, requestId)
    }

    if (requestedCents > balanceCents) {
      return errorResponse(
        `Insufficient platform balance. Available: $${(balanceCents / 100).toFixed(2)}, Requested: $${(requestedCents / 100).toFixed(2)}`,
        400, req, requestId,
      )
    }

    // Get org's Mercury recipient ID
    const mercuryRecipientId = await getOrgMercuryRecipientId(supabase, ledger.organization_id)
    if (!mercuryRecipientId) {
      return errorResponse(
        'No bank account configured for platform payouts. Set mercury_recipient_id in organization settings.',
        400, req, requestId,
      )
    }

    const refId = payload.reference_id || `platform_payout_${ledger.id}_${Date.now()}`
    const description = payload.description || `Platform payout - ${new Date().toISOString().slice(0, 10)}`

    // Check for duplicate
    const { data: existing } = await supabase
      .from('transactions')
      .select('id')
      .eq('ledger_id', ledger.id)
      .eq('reference_id', refId)
      .maybeSingle()

    if (existing) {
      return jsonResponse({ success: false, error: 'Duplicate reference_id', transaction_id: existing.id }, 409, req, requestId)
    }

    // Get accounts
    const { data: platformAccount } = await supabase
      .from('accounts')
      .select('id')
      .eq('ledger_id', ledger.id)
      .eq('account_type', 'platform_revenue')
      .limit(1)
      .single()

    const { data: cashAccount } = await supabase
      .from('accounts')
      .select('id')
      .eq('ledger_id', ledger.id)
      .eq('account_type', 'cash')
      .limit(1)
      .single()

    if (!platformAccount || !cashAccount) {
      return errorResponse('Platform or cash account not initialized', 500, req, requestId)
    }

    // Step 1: Book the ledger transaction FIRST (safe — can be voided if ACH fails)
    const amountMajor = requestedCents / 100
    const { data: txn, error: txnError } = await supabase
      .from('transactions')
      .insert({
        ledger_id: ledger.id,
        transaction_type: 'platform_payout',
        reference_id: refId,
        reference_type: 'platform_payout',
        description,
        amount: amountMajor,
        currency: 'USD',
        status: 'pending',
        metadata: {
          organization_id: ledger.organization_id,
          rail: 'ach',
        },
      })
      .select('id')
      .single()

    if (txnError) {
      return errorResponse('Failed to create payout transaction', 500, req, requestId)
    }

    // Double-entry: debit platform_revenue, credit cash (money leaving)
    const { error: entriesError } = await supabase.from('entries').insert([
      { transaction_id: txn.id, account_id: platformAccount.id, entry_type: 'debit', amount: amountMajor },
      { transaction_id: txn.id, account_id: cashAccount.id, entry_type: 'credit', amount: amountMajor },
    ])

    if (entriesError) {
      // Void the transaction if entries fail
      await supabase.from('transactions').update({ status: 'voided' }).eq('id', txn.id)
      return errorResponse('Failed to create ledger entries', 500, req, requestId)
    }

    // Step 2: Send ACH via Mercury (ledger is booked, safe to attempt)
    const achResult = await sendACH({
      recipientId: mercuryRecipientId,
      amountDollars: requestedCents / 100,
      description,
      idempotencyKey: `platform_${refId}`,
    })

    if (!achResult.success) {
      // ACH failed — void the ledger transaction (money never left)
      await supabase.from('transactions').update({
        status: 'voided',
        metadata: {
          organization_id: ledger.organization_id,
          rail: 'ach',
          voided_reason: achResult.error || 'Mercury ACH transfer failed',
        },
      }).eq('id', txn.id)
      return errorResponse(achResult.error || 'Mercury ACH transfer failed', 502, req, requestId)
    }

    // Step 3: Mark transaction completed with Mercury reference
    await supabase.from('transactions').update({
      status: 'completed',
      metadata: {
        organization_id: ledger.organization_id,
        mercury_transaction_id: achResult.transactionId,
        rail: 'ach',
      },
    }).eq('id', txn.id)

    await createAuditLog(supabase, req, {
      ledger_id: ledger.id,
      action: 'platform_payout',
      entity_type: 'transaction',
      entity_id: txn.id,
      actor_type: 'api',
      request_body: sanitizeForAudit({
        amount_cents: requestedCents,
        mercury_transaction_id: achResult.transactionId,
        reference_id: refId,
      }),
      response_status: 200,
      risk_score: 30,
    }, requestId)

    return jsonResponse({
      success: true,
      payout: {
        transaction_id: txn.id,
        amount: amountMajor,
        amount_cents: requestedCents,
        mercury_transaction_id: achResult.transactionId,
        status: 'completed',
        reference_id: refId,
      },
    }, 200, req, requestId)
  },
)

Deno.serve(handler)
