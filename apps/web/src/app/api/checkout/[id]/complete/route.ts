import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import {
  extractProcessorTaxLocation,
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

function normalizeStateCode(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = value.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null
}

function normalizeCountryCode(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = value.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null
}

function normalizePostalCode(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim().toUpperCase()
  if (trimmed.length === 0) return null
  return trimmed.slice(0, 20)
}

function isDigitalGoodsTaxCategory(value: unknown): boolean {
  return typeof value === 'string' && value === 'digital_goods'
}

function shouldCollectMarylandDigitalGoodsTax(
  taxCategory: unknown,
  collectSalesTax: boolean,
  countryCode: string | null,
  stateCode: string | null
): boolean {
  if (!collectSalesTax) return false
  if (!isDigitalGoodsTaxCategory(taxCategory)) return false
  if ((countryCode || 'US') !== 'US') return false
  return stateCode === 'MD'
}

function pickCheckoutInstrument(instruments: unknown[]): { id: string; type: string; raw: unknown } | null {
  if (!Array.isArray(instruments) || instruments.length === 0) return null
  const enabled = instruments.filter((pi) => getNestedValue(pi, 'enabled') !== false)
  const list = enabled.length > 0 ? enabled : instruments

  // Prefer cards for checkout
  const cards = list.filter((pi) => normalizePaymentInstrumentType(pi) === 'card')
  const bankAccounts = list.filter((pi) => normalizePaymentInstrumentType(pi) === 'bank_account')
  const first = cards[0] || bankAccounts[0] || list[0]

  const idRaw = getNestedValue(first, 'id')
  if (typeof idRaw !== 'string' || idRaw.trim().length === 0) return null
  return { id: idRaw, type: normalizePaymentInstrumentType(first), raw: first }
}

interface CompleteRequest {
  identity_id?: string
  state?: string
}

async function recordSalesTaxThresholdProgress(
  ledgerId: string,
  stateCode: string | null | undefined,
  sourceId: string,
  taxableSalesCents: number,
  taxAmountCents: number,
  metadata: Record<string, unknown>,
) {
  if (!stateCode || taxableSalesCents <= 0) return

  const supabase = createServiceRoleClient()
  const now = new Date()
  await supabase.rpc('record_sales_tax_threshold_event', {
    p_ledger_id: ledgerId,
    p_state_code: stateCode,
    p_source_type: 'checkout_session',
    p_source_id: sourceId,
    p_taxable_sales_cents: taxableSalesCents,
    p_tax_amount_cents: taxAmountCents,
    p_calendar_year: now.getUTCFullYear(),
    p_metadata: metadata,
  })
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

  const taxCategory = typeof session.metadata?.tax_category === 'string' ? session.metadata.tax_category : null
  const collectSalesTax = session.metadata?.collect_sales_tax === true
  const verifiedLocation = extractProcessorTaxLocation(identity, chosen.raw)
  const verifiedCountry = normalizeCountryCode(verifiedLocation.country)
  const verifiedState = normalizeStateCode(verifiedLocation.state)
  const verifiedPostalCode = normalizePostalCode(verifiedLocation.postalCode)
  const subtotalAmount = Number(session.subtotal_amount ?? session.amount)
  const verifiedSalesTaxAmount = shouldCollectMarylandDigitalGoodsTax(
    taxCategory,
    collectSalesTax,
    verifiedCountry,
    verifiedState
  )
    ? Math.round(subtotalAmount * 0.06)
    : 0
  const verifiedSalesTaxState = verifiedSalesTaxAmount > 0 ? 'MD' : null
  const verifiedTotalAmount = subtotalAmount + verifiedSalesTaxAmount

  if (isDigitalGoodsTaxCategory(taxCategory) && collectSalesTax && !verifiedState) {
    await supabase
      .from('checkout_sessions')
      .update({
        status: 'collecting',
        setup_state: null,
        setup_state_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)

    return NextResponse.json(
      { error: 'Billing address state is required to calculate sales tax. Please review your payment details and try again.' },
      { status: 400 }
    )
  }

  const needsSessionTaxRefresh =
    normalizeCountryCode(session.customer_tax_country) !== verifiedCountry ||
    normalizeStateCode(session.customer_tax_state) !== verifiedState ||
    normalizePostalCode(session.customer_tax_postal_code) !== verifiedPostalCode ||
    Number(session.sales_tax_amount ?? 0) !== verifiedSalesTaxAmount ||
    normalizeStateCode(session.sales_tax_state) !== verifiedSalesTaxState ||
    Number(session.amount) !== verifiedTotalAmount

  if (isDigitalGoodsTaxCategory(taxCategory) && needsSessionTaxRefresh) {
    await supabase
      .from('checkout_sessions')
      .update({
        status: 'collecting',
        amount: verifiedTotalAmount,
        sales_tax_amount: verifiedSalesTaxAmount,
        sales_tax_rate_bps: verifiedSalesTaxAmount > 0 ? 600 : null,
        sales_tax_state: verifiedSalesTaxState,
        customer_tax_country: verifiedCountry,
        customer_tax_state: verifiedState,
        customer_tax_postal_code: verifiedPostalCode,
        metadata: {
          ...(session.metadata || {}),
          customer_tax_source: verifiedLocation.source || 'processor_verified',
        },
        setup_state: null,
        setup_state_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)

    return NextResponse.json(
      { error: 'Your billing details updated the checkout tax information. Please review the checkout page and try again.' },
      { status: 409 }
    )
  }

  if (isDigitalGoodsTaxCategory(taxCategory) && !needsSessionTaxRefresh && verifiedLocation.source) {
    await supabase
      .from('checkout_sessions')
      .update({
        customer_tax_country: verifiedCountry,
        customer_tax_state: verifiedState,
        customer_tax_postal_code: verifiedPostalCode,
        metadata: {
          ...(session.metadata || {}),
          customer_tax_source: verifiedLocation.source,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
  }

  // Verify creator is still active before charging
  const { data: creatorAccount } = await supabase
    .from('accounts')
    .select('is_active')
    .eq('ledger_id', session.ledger_id)
    .eq('account_type', 'creator_balance')
    .eq('entity_id', session.creator_id)
    .maybeSingle()

  if (creatorAccount && creatorAccount.is_active === false) {
    await supabase
      .from('checkout_sessions')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', sessionId)
    return NextResponse.json({ error: 'Creator is no longer available' }, { status: 410 })
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
  // Forward caller-provided metadata as tags. Processor constraints:
  // keys ≤40 chars (alphanumeric + underscores), values ≤500 chars, ≤50 pairs total.
  if (session.metadata && typeof session.metadata === 'object') {
    const entries = Object.entries(session.metadata as Record<string, unknown>)
    for (const [k, v] of entries.slice(0, 10)) {
      if (typeof v !== 'string') continue
      const safeKey = `meta_${k.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}`.slice(0, 40).toLowerCase()
      if (safeKey.length > 5) transferTags[safeKey] = v.substring(0, 500)
    }
  }

  const transferPayload: Record<string, unknown> = {
    amount: session.amount,
    currency: session.currency,
    source: chosen.id,
    merchant: merchantId,
    tags: transferTags,
    idempotency_id: `checkout_${session.id}`,
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
  // CHECK TRANSFER STATE: If the processor returned a terminal failure state,
  // do NOT book the sale. Revert to collecting so the buyer can retry.
  // Must match all failure states from payment-provider.ts mapStatus().
  // ========================================================================
  const transferState = (transfer.state || '').toUpperCase()
  const TERMINAL_FAILURE_STATES = ['FAILED', 'CANCELED', 'CANCELLED', 'REJECTED', 'DECLINED', 'RETURNED']
  if (TERMINAL_FAILURE_STATES.includes(transferState)) {
    await supabase
      .from('checkout_sessions')
      .update({
        status: 'collecting',
        updated_at: new Date().toISOString(),
        payment_id: transfer.id,
      })
      .eq('id', sessionId)
    return NextResponse.json(
      { error: 'Payment was declined. Please try a different payment method.' },
      { status: 402 }
    )
  }

  // ========================================================================
  // Record sale via record_sale_atomic.
  // If this fails, mark session as 'charged_pending_ledger' so it can be
  // retried by reconciliation instead of silently losing the journal entry.
  // ========================================================================
  const referenceId = `checkout_${session.id}`
  const soledgicFeeAmount = Math.floor(subtotalAmount * 0.035)
  let saleRecorded = false
  try {
    const { error: rpcError } = await supabase.rpc('record_sale_atomic', {
      p_ledger_id: session.ledger_id,
      p_reference_id: referenceId,
      p_creator_id: session.creator_id,
      p_gross_amount: verifiedTotalAmount,
      p_creator_amount: session.creator_amount,
      p_platform_amount: session.platform_amount,
      p_processing_fee: 0,
      p_soledgic_fee: soledgicFeeAmount,
      p_sales_tax: verifiedSalesTaxAmount,
      p_product_id: session.product_id || null,
      p_product_name: session.product_name || null,
      p_metadata: {
        ...(session.metadata || {}),
        subtotal_amount_cents: subtotalAmount,
        sales_tax_amount_cents: verifiedSalesTaxAmount,
        customer_tax_country: verifiedCountry,
        customer_tax_state: verifiedState,
        customer_tax_source: verifiedLocation.source || session.metadata?.customer_tax_source || null,
      },
    })
    if (rpcError) {
      console.error('record_sale_atomic RPC error after successful charge:', rpcError.message)
    } else {
      saleRecorded = true
    }
  } catch (err: unknown) {
    console.error('Failed to record sale after successful charge:', err)
  }

  const completedAt = new Date()

  if (saleRecorded) {
    try {
      await recordSalesTaxThresholdProgress(
        session.ledger_id,
        taxCategory === 'digital_goods' ? verifiedState : null,
        session.id,
        subtotalAmount,
        verifiedSalesTaxAmount,
        {
          source: 'checkout_complete',
          sales_tax_state: verifiedSalesTaxState,
          customer_tax_country: verifiedCountry,
          customer_tax_source: verifiedLocation.source || session.metadata?.customer_tax_source || null,
        },
      )
    } catch (error) {
      console.error('Failed to record sales tax threshold progress:', error)
    }

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
            amount: verifiedTotalAmount / 100,
            subtotal_amount: subtotalAmount / 100,
            sales_tax_amount: verifiedSalesTaxAmount / 100,
            sales_tax_state: verifiedSalesTaxState,
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
