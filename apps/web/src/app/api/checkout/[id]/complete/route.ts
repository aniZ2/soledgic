import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import {
  fetchProcessorIdentity,
  fetchProcessorPaymentInstrumentsForIdentity,
  processorRequest,
} from '@/lib/processor'

type JsonRecord = Record<string, unknown>

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getNestedValue(value: unknown, ...path: string[]): unknown {
  let current: unknown = value
  for (const key of path) {
    if (!isJsonRecord(current)) return null
    current = current[key]
  }
  return current
}

function normalizePaymentInstrumentType(pi: unknown): string {
  const type = String(
    getNestedValue(pi, 'type') || getNestedValue(pi, 'instrument_type') || ''
  ).toUpperCase()
  if (type.includes('CARD')) return 'card'
  if (type.includes('BANK')) return 'bank_account'
  return type ? type.toLowerCase() : 'unknown'
}

function pickCheckoutInstrument(instruments: unknown[]): { id: string; type: string } | null {
  if (!Array.isArray(instruments) || instruments.length === 0) return null
  const enabled = instruments.filter((pi) => getNestedValue(pi, 'enabled') !== false)
  const list = enabled.length > 0 ? enabled : instruments

  // Prefer cards for checkout
  const cards = list.filter((pi) => normalizePaymentInstrumentType(pi) === 'card')
  const bankAccounts = list.filter((pi) => normalizePaymentInstrumentType(pi) === 'bank_account')
  const first = cards[0] || bankAccounts[0] || list[0]

  const idRaw = getNestedValue(first, 'id')
  if (typeof idRaw !== 'string' || idRaw.trim().length === 0) return null
  return { id: idRaw, type: normalizePaymentInstrumentType(first) }
}

interface CompleteRequest {
  identity_id?: string
  state?: string
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params

  let body: CompleteRequest = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const identityId = typeof body.identity_id === 'string' ? body.identity_id.trim() : ''
  const state = typeof body.state === 'string' ? body.state.trim() : ''

  if (!identityId || !state) {
    return NextResponse.json({ error: 'identity_id and state are required' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  // ========================================================================
  // ATOMIC CLAIM: Atomically transition session from collecting → charging.
  // This prevents double-charge from concurrent callbacks:
  //   UPDATE ... SET status='charging' WHERE id=? AND setup_state=? AND status IN ('collecting','pending')
  // Only one concurrent request can win the update; the loser sees 0 rows.
  // ========================================================================
  const now = new Date()
  const { data: claimed, error: claimError } = await supabase
    .from('checkout_sessions')
    .update({
      status: 'charging',
      updated_at: now.toISOString(),
    })
    .eq('id', sessionId)
    .eq('setup_state', state)
    .in('status', ['collecting', 'pending'])
    .select('*')
    .maybeSingle()

  if (claimError || !claimed) {
    // Either session not found, state doesn't match (replay), or already claimed
    return NextResponse.json({ error: 'Invalid or expired checkout state' }, { status: 409 })
  }

  const session = claimed

  // Check expiry
  const expiresAt = new Date(session.expires_at)
  if (expiresAt.getTime() <= now.getTime()) {
    await supabase
      .from('checkout_sessions')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', sessionId)
    return NextResponse.json({ error: 'Checkout session has expired' }, { status: 410 })
  }

  const stateExpiresAt = session.setup_state_expires_at
    ? new Date(session.setup_state_expires_at)
    : null
  if (stateExpiresAt && stateExpiresAt.getTime() <= now.getTime()) {
    // Revert to collecting so user can try again
    await supabase
      .from('checkout_sessions')
      .update({ status: 'collecting', updated_at: new Date().toISOString() })
      .eq('id', sessionId)
    return NextResponse.json({ error: 'Checkout setup session expired. Please start again.' }, { status: 410 })
  }

  // Fetch identity and instruments from processor
  let identity: { id?: string }
  try {
    identity = await fetchProcessorIdentity(identityId)
  } catch (err: unknown) {
    // Revert status so user can retry
    await supabase
      .from('checkout_sessions')
      .update({ status: 'collecting', updated_at: new Date().toISOString() })
      .eq('id', sessionId)
    const msg = err instanceof Error ? err.message : 'Invalid identity'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const instruments = await fetchProcessorPaymentInstrumentsForIdentity(identityId).catch(() => [])
  const chosen = pickCheckoutInstrument(instruments)
  if (!chosen) {
    await supabase
      .from('checkout_sessions')
      .update({ status: 'collecting', updated_at: new Date().toISOString() })
      .eq('id', sessionId)
    return NextResponse.json(
      { error: 'No payment method found. Please try again.' },
      { status: 400 }
    )
  }

  // Execute charge via processor
  const merchantId = (process.env.PROCESSOR_MERCHANT_ID || '').trim()
  if (!merchantId) {
    await supabase
      .from('checkout_sessions')
      .update({ status: 'collecting', updated_at: new Date().toISOString() })
      .eq('id', sessionId)
    return NextResponse.json({ error: 'Payment processing is not configured' }, { status: 503 })
  }

  const transferTags: Record<string, string> = {
    soledgic_checkout_session_id: session.id,
    soledgic_ledger_id: session.ledger_id,
    soledgic_creator_id: session.creator_id,
  }
  if (session.product_id) transferTags.product_id = session.product_id
  if (session.product_name) transferTags.product_name = session.product_name
  if (session.customer_id) transferTags.customer_id = session.customer_id
  if (session.customer_email) transferTags.customer_email = session.customer_email
  // Forward caller-provided metadata as tags (processor limits key count,
  // so only pass first 10 entries to stay within safe bounds).
  if (session.metadata && typeof session.metadata === 'object') {
    const entries = Object.entries(session.metadata as Record<string, unknown>)
    for (const [k, v] of entries.slice(0, 10)) {
      if (typeof v === 'string') transferTags[`meta_${k}`] = v.substring(0, 500)
    }
  }

  const transferPayload: Record<string, unknown> = {
    amount: session.amount,
    currency: session.currency,
    source: chosen.id,
    merchant: merchantId,
    tags: transferTags,
  }

  let transfer: { id?: string; state?: string }
  try {
    transfer = await processorRequest<{ id?: string; state?: string }>('/transfers', {
      method: 'POST',
      body: transferPayload,
    })
  } catch (err: unknown) {
    // Charge failed - revert to collecting so user can retry
    await supabase
      .from('checkout_sessions')
      .update({ status: 'collecting', updated_at: new Date().toISOString() })
      .eq('id', sessionId)
    const msg = err instanceof Error ? err.message : 'Payment processing failed'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  if (!transfer?.id) {
    await supabase
      .from('checkout_sessions')
      .update({ status: 'collecting', updated_at: new Date().toISOString() })
      .eq('id', sessionId)
    return NextResponse.json({ error: 'Payment processing failed' }, { status: 502 })
  }

  // ========================================================================
  // Record sale via record_sale_atomic.
  // If this fails, mark session as 'charged_pending_ledger' so it can be
  // retried by reconciliation instead of silently losing the journal entry.
  // ========================================================================
  const referenceId = `checkout_${session.id}`
  let saleRecorded = false
  try {
    await supabase.rpc('record_sale_atomic', {
      p_ledger_id: session.ledger_id,
      p_reference_id: referenceId,
      p_creator_id: session.creator_id,
      p_gross_amount: session.amount,
      p_creator_amount: session.creator_amount,
      p_platform_amount: session.platform_amount,
      p_processing_fee: 0,
      p_product_id: session.product_id || null,
      p_product_name: session.product_name || null,
      p_metadata: session.metadata || {},
    })
    saleRecorded = true
  } catch (err: unknown) {
    console.error('Failed to record sale after successful charge:', err)
  }

  const completedAt = new Date()

  if (saleRecorded) {
    // Full success: mark completed, clear state
    await supabase
      .from('checkout_sessions')
      .update({
        status: 'completed',
        payment_id: transfer.id,
        reference_id: referenceId,
        processor_identity_id: identity.id || identityId,
        setup_state: null,
        setup_state_expires_at: null,
        completed_at: completedAt.toISOString(),
        updated_at: completedAt.toISOString(),
      })
      .eq('id', sessionId)

    // Queue webhook only after both charge and ledger write succeeded
    supabase
      .rpc('queue_webhook', {
        p_ledger_id: session.ledger_id,
        p_event_type: 'checkout.completed',
        p_payload: {
          event: 'checkout.completed',
          data: {
            session_id: session.id,
            payment_id: transfer.id,
            reference_id: referenceId,
            amount: session.amount / 100,
            currency: session.currency,
            creator_id: session.creator_id,
            product_id: session.product_id,
            product_name: session.product_name,
            customer_email: session.customer_email,
            customer_id: session.customer_id,
            created_at: completedAt.toISOString(),
          },
        },
      })
      .then(({ error }) => {
        if (error) console.error('Failed to queue checkout webhook:', error)
      })
      .catch((err) => {
        console.error('Failed to queue checkout webhook:', err)
      })
    return NextResponse.json({
      success: true,
      payment_id: transfer.id,
      redirect_url: session.success_url,
    })
  }

  // Charge succeeded but ledger write failed.
  // Mark as 'charged_pending_ledger' so reconciliation can pick it up.
  // Do NOT queue webhook and do NOT tell the caller it succeeded.
  await supabase
    .from('checkout_sessions')
    .update({
      status: 'charged_pending_ledger',
      payment_id: transfer.id,
      reference_id: referenceId,
      processor_identity_id: identity.id || identityId,
      setup_state: null,
      setup_state_expires_at: null,
      updated_at: completedAt.toISOString(),
    })
    .eq('id', sessionId)

  // Return 202 — payment was captured but not yet fully reconciled.
  // The client page should show a "processing" state, not a success page.
  return NextResponse.json(
    {
      success: false,
      status: 'pending_reconciliation',
      payment_id: transfer.id,
      error: 'Your payment was received but is still being processed. You will receive confirmation shortly.',
    },
    { status: 202 }
  )
}
