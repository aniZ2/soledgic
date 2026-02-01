// Soledgic Edge Function: Stripe Webhook
// POST /stripe-webhook
// Phase 1: Stripe as a Data Source (not billing)
// Handles: charge.succeeded, charge.refunded, payout.paid, balance.available
// SECURITY HARDENED VERSION

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { 
  getCorsHeaders, 
  getSupabaseClient,
  getClientIp 
} from '../_shared/utils.ts'

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_BODY_SIZE = 256 * 1024 // 256KB max for webhook payloads
const MAX_TIMESTAMP_AGE = 300 // 5 minutes - reject old events (replay protection)

// ============================================================================
// TYPES
// ============================================================================

type StripeEvent = {
  id: string
  type: string
  created: number
  livemode: boolean
  data: {
    object: any
  }
  account?: string
}

interface HandlerResult {
  success: boolean
  transaction_id?: string
  skipped?: boolean
  reason?: string
  error?: string
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, req)
  }

  const supabase = getSupabaseClient()
  const clientIp = getClientIp(req)

  try {
    // SECURITY: Check content length before reading body
    const contentLength = parseInt(req.headers.get('content-length') || '0')
    if (contentLength > MAX_BODY_SIZE) {
      await logSecurityEvent(supabase, null, 'webhook_payload_too_large', {
        content_length: contentLength,
        ip: clientIp,
      })
      return jsonResponse({ error: 'Payload too large' }, 413, req)
    }

    const body = await req.text()
    
    // Double-check actual size
    if (body.length > MAX_BODY_SIZE) {
      return jsonResponse({ error: 'Payload too large' }, 413, req)
    }

    const signature = req.headers.get('stripe-signature')
    
    // SECURITY: Signature is required
    if (!signature) {
      await logSecurityEvent(supabase, null, 'webhook_missing_signature', {
        ip: clientIp,
        user_agent: req.headers.get('user-agent'),
      })
      return jsonResponse({ error: 'Missing stripe-signature header' }, 401, req)
    }

    // Parse event
    let event: StripeEvent
    try {
      event = JSON.parse(body)
    } catch {
      return jsonResponse({ error: 'Invalid JSON' }, 400, req)
    }

    // SECURITY: Basic event structure validation
    if (!event.id || !event.type || !event.created || !event.data) {
      return jsonResponse({ error: 'Invalid event structure' }, 400, req)
    }

    // Find the ledger this event belongs to
    const ledger = await findLedgerForEvent(supabase, event)
    
    if (!ledger) {
      console.log(`No ledger found for event ${event.id} (${event.type})`)
      return jsonResponse({ received: true, processed: false, reason: 'no_matching_ledger' }, 200, req)
    }

    // SECURITY: Get webhook secret from Vault (falls back to settings for unmigrated ledgers)
    const { data: webhookSecret, error: secretError } = await supabase.rpc(
      'get_stripe_webhook_secret_from_vault',
      { p_ledger_id: ledger.id }
    )
    
    if (secretError || !webhookSecret) {
      console.error(`Ledger ${ledger.id} has no stripe_webhook_secret configured`)
      return jsonResponse({ 
        error: 'Webhook secret not configured' 
      }, 500, req)
    }

    const signatureResult = await verifyStripeSignature(body, signature, webhookSecret)
    if (!signatureResult.valid) {
      await logSecurityEvent(supabase, ledger.id, 'webhook_invalid_signature', {
        ip: clientIp,
        event_id: event.id,
        reason: signatureResult.reason,
        risk_score: 80,
      })
      return jsonResponse({ error: 'Invalid signature' }, 401, req)
    }

    // SECURITY: Replay protection - check timestamp age
    const eventAge = Math.floor(Date.now() / 1000) - event.created
    if (eventAge > MAX_TIMESTAMP_AGE) {
      await logSecurityEvent(supabase, ledger.id, 'webhook_replay_attempt', {
        ip: clientIp,
        event_id: event.id,
        event_age_seconds: eventAge,
        risk_score: 70,
      })
      return jsonResponse({ error: 'Event too old' }, 400, req)
    }

    // SECURITY: Idempotency check - prevent duplicate processing
    const { data: existing } = await supabase
      .from('stripe_events')
      .select('id, processed_at, status')
      .eq('ledger_id', ledger.id)
      .eq('stripe_event_id', event.id)
      .single()

    if (existing) {
      return jsonResponse({ 
        received: true, 
        processed: false, 
        reason: 'duplicate',
        original_id: existing.id,
        original_status: existing.status
      }, 200, req)
    }

    // Store the raw event first (for reprocessing capability)
    const { data: storedEvent, error: storeError } = await supabase
      .from('stripe_events')
      .insert({
        ledger_id: ledger.id,
        stripe_event_id: event.id,
        event_type: event.type,
        livemode: event.livemode,
        raw_data: event,
        status: 'pending'
      })
      .select('id')
      .single()

    if (storeError) {
      console.error('Failed to store event:', storeError)
      return jsonResponse({ error: 'Failed to store event' }, 500, req)
    }

    // Process the event
    const result = await processEvent(supabase, ledger, event)

    // Update event status
    await supabase
      .from('stripe_events')
      .update({
        status: result.success ? 'processed' : (result.skipped ? 'skipped' : 'failed'),
        processed_at: new Date().toISOString(),
        transaction_id: result.transaction_id,
        error_message: result.error?.substring(0, 500), // Limit error message length
      })
      .eq('id', storedEvent.id)

    // Audit log
    await supabase.from('audit_log').insert({
      ledger_id: ledger.id,
      action: 'stripe_webhook',
      entity_type: 'stripe_event',
      entity_id: event.id,
      actor_type: 'system',
      actor_id: 'stripe',
      ip_address: clientIp,
      request_body: {
        event_type: event.type,
        livemode: event.livemode,
        success: result.success,
        skipped: result.skipped,
      }
    }).catch(() => {})

    return jsonResponse({ received: true, ...result }, 200, req)

  } catch (error: any) {
    console.error('Webhook error:', error)
    
    // Log the error but don't expose details
    await logSecurityEvent(supabase, null, 'webhook_error', {
      ip: clientIp,
      error: error.message?.substring(0, 200),
    }).catch(() => {})

    return jsonResponse({ error: 'Internal server error' }, 500, req)
  }
})

// ============================================================================
// SECURITY HELPERS
// ============================================================================

async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<{ valid: boolean; reason?: string }> {
  try {
    const parts = signature.split(',')
    const timestampPart = parts.find(p => p.startsWith('t='))
    const v1Part = parts.find(p => p.startsWith('v1='))
    
    if (!timestampPart || !v1Part) {
      return { valid: false, reason: 'missing_parts' }
    }

    const timestamp = timestampPart.slice(2)
    const expectedSig = v1Part.slice(3)

    // SECURITY: Validate timestamp is a number
    if (!/^\d+$/.test(timestamp)) {
      return { valid: false, reason: 'invalid_timestamp' }
    }

    const signedPayload = `${timestamp}.${payload}`
    const encoder = new TextEncoder()
    
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload))
    const computed = Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    // SECURITY: Constant-time comparison to prevent timing attacks
    if (computed.length !== expectedSig.length) {
      return { valid: false, reason: 'length_mismatch' }
    }

    let result = 0
    for (let i = 0; i < computed.length; i++) {
      result |= computed.charCodeAt(i) ^ expectedSig.charCodeAt(i)
    }

    return { valid: result === 0, reason: result === 0 ? undefined : 'signature_mismatch' }
  } catch (err) {
    console.error('Signature verification error:', err)
    return { valid: false, reason: 'verification_error' }
  }
}

async function logSecurityEvent(
  supabase: any,
  ledgerId: string | null,
  action: string,
  details: Record<string, any>
): Promise<void> {
  try {
    await supabase.from('audit_log').insert({
      ledger_id: ledgerId,
      action,
      actor_type: 'system',
      actor_id: 'stripe_webhook',
      ip_address: details.ip,
      request_body: details,
      risk_score: details.risk_score || 50,
    })
  } catch (err) {
    console.error('Failed to log security event:', err)
  }
}

// ============================================================================
// EVENT PROCESSING
// ============================================================================

async function processEvent(
  supabase: any, 
  ledger: any, 
  event: StripeEvent
): Promise<HandlerResult> {
  
  switch (event.type) {
    case 'charge.succeeded':
      return handleChargeSucceeded(supabase, ledger, event)
    
    case 'charge.refunded':
      return handleChargeRefunded(supabase, ledger, event)
    
    case 'payout.paid':
      return handlePayoutPaid(supabase, ledger, event)
    
    case 'payout.failed':
      return handlePayoutFailed(supabase, ledger, event)
    
    case 'balance.available':
      return handleBalanceAvailable(supabase, ledger, event)
    
    case 'payment_intent.succeeded':
      return handlePaymentIntentSucceeded(supabase, ledger, event)
    
    case 'charge.dispute.created':
      return handleDisputeCreated(supabase, ledger, event)
    
    case 'charge.dispute.closed':
      return handleDisputeClosed(supabase, ledger, event)

    default:
      return { success: true, skipped: true, reason: `Unhandled event type: ${event.type}` }
  }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

// SECURITY FIX C1: Fetch actual Stripe fee from balance transaction
// Returns { fee, estimated } to track when we fall back to estimates
interface StripeFeeResult {
  fee: number
  estimated: boolean
  reason?: string
}

async function getStripeFee(
  balanceTransactionId: string | null,
  amountCents: number
): Promise<StripeFeeResult> {
  // Default estimate: 2.9% + 30¢ (standard Stripe pricing)
  const estimatedFee = Math.round(amountCents * 0.029 + 30) / 100
  
  if (!balanceTransactionId) {
    return { 
      fee: estimatedFee, 
      estimated: true, 
      reason: 'no_balance_transaction_id' 
    }
  }
  
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  if (!stripeKey) {
    return { 
      fee: estimatedFee, 
      estimated: true, 
      reason: 'no_stripe_key' 
    }
  }
  
  try {
    const response = await fetch(
      `https://api.stripe.com/v1/balance_transactions/${balanceTransactionId}`,
      { headers: { 'Authorization': `Bearer ${stripeKey}` } }
    )
    const bt = await response.json()
    
    if (bt.error) {
      console.warn(`Failed to fetch balance transaction ${balanceTransactionId}:`, bt.error.message)
      return { 
        fee: estimatedFee, 
        estimated: true, 
        reason: `stripe_error: ${bt.error.code}` 
      }
    }
    
    return { 
      fee: bt.fee / 100,  // Convert from cents to dollars
      estimated: false 
    }
  } catch (err: any) {
    console.warn(`Exception fetching balance transaction:`, err.message)
    return { 
      fee: estimatedFee, 
      estimated: true, 
      reason: `exception: ${err.message?.substring(0, 50)}` 
    }
  }
}

// DEPRECATED: Use getStripeFee instead
async function getActualStripeFee(balanceTransactionId: string | null): Promise<number | null> {
  if (!balanceTransactionId) return null
  const result = await getStripeFee(balanceTransactionId, 0)
  return result.estimated ? null : result.fee
}

async function handleChargeSucceeded(
  supabase: any,
  ledger: any,
  event: StripeEvent
): Promise<HandlerResult> {
  const charge = event.data.object
  
  // Skip if already captured via payment_intent.succeeded
  const { data: existingByIntent } = await supabase
    .from('transactions')
    .select('id')
    .eq('ledger_id', ledger.id)
    .eq('metadata->stripe_payment_intent_id', charge.payment_intent)
    .single()
  
  if (existingByIntent) {
    return { success: true, skipped: true, reason: 'Already recorded via payment_intent' }
  }

  const grossAmount = charge.amount / 100
  const currency = charge.currency.toUpperCase()
  
  // SECURITY FIX C1: Get actual fee from Stripe with tracking for estimated fees
  const feeResult = await getStripeFee(charge.balance_transaction, charge.amount)
  const stripeFee = feeResult.fee
  const netAmount = grossAmount - stripeFee
  
  // Log warning if using estimated fee (for reconciliation tracking)
  if (feeResult.estimated) {
    console.warn(`[charge.succeeded] Using ESTIMATED fee for ${charge.id}: ${stripeFee} (reason: ${feeResult.reason})`)
  }

  const creatorId = charge.metadata?.creator_id
  const productId = charge.metadata?.product_id
  const description = charge.description || charge.metadata?.product_name || 'Stripe charge'

  const accounts = await getOrCreateAccounts(supabase, ledger.id, creatorId)
  if (!accounts.cash || !accounts.revenue) {
    return { success: false, error: 'Required accounts not found' }
  }

  const { data: transaction, error: txError } = await supabase
    .from('transactions')
    .insert({
      ledger_id: ledger.id,
      transaction_type: 'sale',
      reference_id: `stripe_${charge.id}`,
      reference_type: 'stripe_charge',
      description: description.substring(0, 500), // Limit description length
      amount: grossAmount,
      currency,
      status: 'completed',
      metadata: {
        source: 'stripe',
        stripe_charge_id: charge.id,
        stripe_payment_intent_id: charge.payment_intent,
        stripe_customer_id: charge.customer,
        creator_id: creatorId,
        product_id: productId,
        breakdown: {
          gross: grossAmount,
          stripe_fee: stripeFee,
          net: netAmount,
          // SECURITY FIX C1: Track estimated fees for reconciliation
          fee_estimated: feeResult.estimated,
          fee_estimate_reason: feeResult.reason,
        }
      }
    })
    .select('id')
    .single()

  if (txError) {
    return { success: false, error: 'Transaction creation failed' }
  }

  // Create entries
  // ESCROW CONTROL: Calculate hold_until date (default 7 days for dispute window)
  const holdDays = ledger.settings?.default_hold_days ?? 7
  const holdUntil = new Date(Date.now() + holdDays * 24 * 60 * 60 * 1000).toISOString()

  const entries = [
    { transaction_id: transaction.id, account_id: accounts.cash.id, entry_type: 'debit', amount: grossAmount },
    { transaction_id: transaction.id, account_id: accounts.fees.id, entry_type: 'debit', amount: stripeFee },
    { transaction_id: transaction.id, account_id: accounts.revenue.id, entry_type: 'credit', amount: netAmount },
  ]

  // If marketplace mode with creator, split revenue
  if (creatorId && accounts.creator) {
    const splitPercent = ledger.settings?.default_split_percent || 80
    const creatorAmount = Math.round(netAmount * (splitPercent / 100) * 100) / 100
    const platformAmount = netAmount - creatorAmount

    entries.pop()
    // ESCROW: Creator balance entries are HELD until manually released or auto-release
    entries.push(
      { 
        transaction_id: transaction.id, 
        account_id: accounts.creator.id, 
        entry_type: 'credit', 
        amount: creatorAmount,
        release_status: 'held',
        hold_reason: 'dispute_window',
        hold_until: holdUntil
      },
      { transaction_id: transaction.id, account_id: accounts.platformRevenue.id, entry_type: 'credit', amount: platformAmount },
    )
  }

  await supabase.from('entries').insert(entries)

  // Store for reconciliation
  await supabase.from('stripe_transactions').insert({
    ledger_id: ledger.id,
    stripe_id: charge.id,
    stripe_type: 'charge',
    amount: grossAmount,
    fee: stripeFee,
    net: netAmount,
    currency,
    status: 'succeeded',
    description: description.substring(0, 500),
    transaction_id: transaction.id,
    match_status: 'auto_matched',
    raw_data: charge,
  }).catch(() => {}) // Don't fail if this fails

  return { success: true, transaction_id: transaction.id }
}

async function handlePaymentIntentSucceeded(
  supabase: any,
  ledger: any,
  event: StripeEvent
): Promise<HandlerResult> {
  const paymentIntent = event.data.object
  
  const { data: existing } = await supabase
    .from('transactions')
    .select('id')
    .eq('ledger_id', ledger.id)
    .or(`reference_id.eq.stripe_${paymentIntent.id},metadata->stripe_payment_intent_id.eq.${paymentIntent.id}`)
    .single()
  
  if (existing) {
    return { success: true, skipped: true, reason: 'Already recorded' }
  }

  const grossAmount = paymentIntent.amount_received / 100
  const currency = paymentIntent.currency.toUpperCase()
  
  // SECURITY FIX: Get actual fee from latest charge's balance transaction
  const latestChargeId = paymentIntent.latest_charge
  let stripeFee: number
  
  if (latestChargeId && typeof latestChargeId === 'string') {
    // Fetch the charge to get balance_transaction
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    try {
      const chargeRes = await fetch(`https://api.stripe.com/v1/charges/${latestChargeId}`, {
        headers: { 'Authorization': `Bearer ${stripeKey}` }
      })
      const chargeData = await chargeRes.json()
      const actualFee = await getActualStripeFee(chargeData.balance_transaction)
      stripeFee = actualFee ?? Math.round(paymentIntent.amount_received * 0.029 + 30) / 100
    } catch {
      stripeFee = Math.round(paymentIntent.amount_received * 0.029 + 30) / 100
    }
  } else {
    stripeFee = Math.round(paymentIntent.amount_received * 0.029 + 30) / 100
  }
  
  const netAmount = grossAmount - stripeFee

  const creatorId = paymentIntent.metadata?.creator_id
  const description = paymentIntent.description || paymentIntent.metadata?.product_name || 'Payment'

  const accounts = await getOrCreateAccounts(supabase, ledger.id, creatorId)
  if (!accounts.cash || !accounts.revenue) {
    return { success: false, error: 'Required accounts not found' }
  }

  const { data: transaction, error: txError } = await supabase
    .from('transactions')
    .insert({
      ledger_id: ledger.id,
      transaction_type: 'sale',
      reference_id: `stripe_pi_${paymentIntent.id}`,
      reference_type: 'stripe_payment_intent',
      description: description.substring(0, 500),
      amount: grossAmount,
      currency,
      status: 'completed',
      metadata: {
        source: 'stripe',
        stripe_payment_intent_id: paymentIntent.id,
        stripe_customer_id: paymentIntent.customer,
        creator_id: creatorId,
        breakdown: { gross: grossAmount, stripe_fee: stripeFee, net: netAmount }
      }
    })
    .select('id')
    .single()

  if (txError) {
    return { success: false, error: 'Transaction creation failed' }
  }

  const entries = [
    { transaction_id: transaction.id, account_id: accounts.cash.id, entry_type: 'debit', amount: grossAmount },
    { transaction_id: transaction.id, account_id: accounts.fees.id, entry_type: 'debit', amount: stripeFee },
  ]

  // ESCROW CONTROL: Calculate hold_until date (default 7 days for dispute window)
  const holdDays = ledger.settings?.default_hold_days ?? 7
  const holdUntil = new Date(Date.now() + holdDays * 24 * 60 * 60 * 1000).toISOString()

  if (creatorId && accounts.creator) {
    const splitPercent = ledger.settings?.default_split_percent || 80
    const creatorAmount = Math.round(netAmount * (splitPercent / 100) * 100) / 100
    const platformAmount = netAmount - creatorAmount
    // ESCROW: Creator balance entries are HELD until manually released or auto-release
    entries.push(
      { 
        transaction_id: transaction.id, 
        account_id: accounts.creator.id, 
        entry_type: 'credit', 
        amount: creatorAmount,
        release_status: 'held',
        hold_reason: 'dispute_window',
        hold_until: holdUntil
      },
      { transaction_id: transaction.id, account_id: accounts.platformRevenue.id, entry_type: 'credit', amount: platformAmount },
    )
  } else {
    entries.push(
      { transaction_id: transaction.id, account_id: accounts.revenue.id, entry_type: 'credit', amount: netAmount },
    )
  }

  await supabase.from('entries').insert(entries)

  await supabase.from('stripe_transactions').insert({
    ledger_id: ledger.id,
    stripe_id: paymentIntent.id,
    stripe_type: 'payment_intent',
    amount: grossAmount,
    fee: stripeFee,
    net: netAmount,
    currency,
    status: 'succeeded',
    description: description.substring(0, 500),
    transaction_id: transaction.id,
    match_status: 'auto_matched',
    raw_data: paymentIntent,
  }).catch(() => {})

  return { success: true, transaction_id: transaction.id }
}

async function handleChargeRefunded(
  supabase: any,
  ledger: any,
  event: StripeEvent
): Promise<HandlerResult> {
  const charge = event.data.object
  const currency = charge.currency.toUpperCase()

  // Extract the individual refund that triggered this event from charge.refunds.data.
  // Each Stripe refund has a stable ID (re_xxx) — use it for idempotency instead of
  // the cumulative charge.amount_refunded which is incorrect for per-refund tracking.
  const refunds: any[] = charge.refunds?.data || []
  const latestRefund = refunds.length > 0
    ? refunds.reduce((latest: any, r: any) => r.created > latest.created ? r : latest, refunds[0])
    : null

  const refundId = latestRefund?.id as string | null
  const refundAmount = latestRefund
    ? latestRefund.amount / 100
    : charge.amount_refunded / 100

  // Per-refund idempotency fast-path: if we have a refund ID, check if already
  // processed before doing any heavier work.
  const referenceId = refundId
    ? `stripe_refund_${refundId}`
    : `stripe_refund_${charge.id}_${event.id}`

  if (refundId) {
    const { data: existingRefundTx } = await supabase
      .from('transactions')
      .select('id')
      .eq('ledger_id', ledger.id)
      .eq('reference_id', referenceId)
      .single()

    if (existingRefundTx) {
      return { success: true, transaction_id: existingRefundTx.id }
    }
  }

  // Find the original sale transaction for this charge.
  const { data: originalTx } = await supabase
    .from('transactions')
    .select('id, metadata, amount')
    .eq('ledger_id', ledger.id)
    .or(`reference_id.eq.stripe_${charge.id},metadata->stripe_charge_id.eq.${charge.id},metadata->stripe_payment_intent_id.eq.${charge.payment_intent}`)
    .single()

  if (!originalTx) {
    await supabase.from('stripe_transactions').insert({
      ledger_id: ledger.id,
      stripe_id: refundId ? `refund_${refundId}` : `refund_${charge.id}`,
      stripe_type: 'refund',
      amount: -refundAmount,
      currency,
      status: 'needs_review',
      description: `Refund for ${charge.id} (original not found)`,
      match_status: 'unmatched',
      raw_data: charge,
    }).catch(() => {})
    return { success: false, error: 'Original transaction not found' }
  }

  const creatorId = originalTx.metadata?.creator_id

  // Atomic refund processing via RPC: locks the original transaction row
  // (FOR UPDATE), sums existing refunds, checks the over-refund guard,
  // and inserts the refund transaction in a single DB transaction.
  const description = refundId
    ? `Refund ${refundId}: ${charge.id}`
    : `Refund: ${charge.id}`

  const metadata = {
    source: 'stripe',
    stripe_charge_id: charge.id,
    stripe_refund_id: refundId,
    original_transaction_id: originalTx.id,
    creator_id: creatorId,
  }

  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    'process_stripe_refund',
    {
      p_ledger_id: ledger.id,
      p_original_tx_id: originalTx.id,
      p_charge_id: charge.id,
      p_reference_id: referenceId,
      p_description: description,
      p_amount: refundAmount,
      p_currency: currency,
      p_metadata: metadata,
    }
  )

  if (rpcError) {
    return { success: false, error: `Refund RPC failed: ${rpcError.message}` }
  }

  const result = rpcResult as {
    status: string
    transaction_id?: string
    already_refunded?: number
    is_full_refund?: boolean
    error?: string
  }

  if (result.status === 'blocked') {
    return { success: true, skipped: true, reason: 'over_refund_guard' }
  }

  if (result.status === 'duplicate') {
    return { success: true, transaction_id: result.transaction_id }
  }

  if (result.status === 'error') {
    return { success: false, error: result.error || 'RPC returned error' }
  }

  // Transaction created — now insert the ledger entries (these reference the
  // transaction ID so they're safe even without the row lock).
  const transactionId = result.transaction_id!
  const isFullRefund = result.is_full_refund || false
  const accounts = await getOrCreateAccounts(supabase, ledger.id, creatorId)

  const entries = [
    { transaction_id: transactionId, account_id: accounts.cash.id, entry_type: 'credit', amount: refundAmount },
  ]

  if (creatorId && accounts.creator) {
    const splitPercent = ledger.settings?.default_split_percent || 80
    const creatorRefund = Math.round(refundAmount * (splitPercent / 100) * 100) / 100
    const platformRefund = refundAmount - creatorRefund
    entries.push(
      { transaction_id: transactionId, account_id: accounts.creator.id, entry_type: 'debit', amount: creatorRefund },
      { transaction_id: transactionId, account_id: accounts.platformRevenue.id, entry_type: 'debit', amount: platformRefund },
    )
  } else {
    entries.push(
      { transaction_id: transactionId, account_id: accounts.revenue.id, entry_type: 'debit', amount: refundAmount },
    )
  }

  await supabase.from('entries').insert(entries)

  // Record in stripe_transactions for reconciliation.
  await supabase.from('stripe_transactions').insert({
    ledger_id: ledger.id,
    stripe_id: refundId ? `refund_${refundId}` : `refund_${charge.id}`,
    stripe_type: 'refund',
    amount: -refundAmount,
    currency,
    status: 'succeeded',
    description: `Refund for ${charge.id}`,
    transaction_id: transactionId,
    match_status: 'auto_matched',
    raw_data: charge,
  }).catch(() => {})

  return { success: true, transaction_id: transactionId }
}

async function handlePayoutPaid(
  supabase: any,
  ledger: any,
  event: StripeEvent
): Promise<HandlerResult> {
  const payout = event.data.object
  const amount = payout.amount / 100
  const currency = payout.currency.toUpperCase()

  const accounts = await getOrCreateAccounts(supabase, ledger.id)
  
  let bankAccount = accounts.bank
  if (!bankAccount) {
    const { data: newBank } = await supabase
      .from('accounts')
      .insert({
        ledger_id: ledger.id,
        account_type: 'bank',
        entity_type: 'platform',
        name: 'Bank Account',
      })
      .select('id')
      .single()
    bankAccount = newBank
  }

  const { data: transaction, error: txError } = await supabase
    .from('transactions')
    .insert({
      ledger_id: ledger.id,
      transaction_type: 'payout',
      reference_id: `stripe_payout_${payout.id}`,
      reference_type: 'stripe_payout',
      description: `Stripe payout to bank`,
      amount,
      currency,
      status: 'completed',
      metadata: {
        source: 'stripe',
        stripe_payout_id: payout.id,
        arrival_date: payout.arrival_date,
        // SECURITY: Don't store full bank account details
        bank_account_last4: payout.destination?.last4,
      }
    })
    .select('id')
    .single()

  if (txError) {
    return { success: false, error: 'Payout transaction creation failed' }
  }

  await supabase.from('entries').insert([
    { transaction_id: transaction.id, account_id: accounts.cash.id, entry_type: 'credit', amount },
    { transaction_id: transaction.id, account_id: bankAccount.id, entry_type: 'debit', amount },
  ])

  await supabase.from('stripe_transactions').insert({
    ledger_id: ledger.id,
    stripe_id: payout.id,
    stripe_type: 'payout',
    amount: -amount,
    currency,
    status: 'paid',
    description: `Payout to bank`,
    transaction_id: transaction.id,
    match_status: 'auto_matched',
    raw_data: payout,
  }).catch(() => {})

  return { success: true, transaction_id: transaction.id }
}

async function handlePayoutFailed(
  supabase: any,
  ledger: any,
  event: StripeEvent
): Promise<HandlerResult> {
  const payout = event.data.object
  
  const { data: originalTx } = await supabase
    .from('transactions')
    .select('id')
    .eq('ledger_id', ledger.id)
    .eq('reference_id', `stripe_payout_${payout.id}`)
    .single()

  if (originalTx) {
    await supabase.rpc('void_transaction', { p_transaction_id: originalTx.id }).catch(() => {})
  }

  await supabase
    .from('stripe_transactions')
    .update({ status: 'failed', match_status: 'excluded' })
    .eq('stripe_id', payout.id)
    .eq('ledger_id', ledger.id)

  return { success: true, reason: 'Payout failed, original voided' }
}

async function handleBalanceAvailable(
  supabase: any,
  ledger: any,
  event: StripeEvent
): Promise<HandlerResult> {
  const balance = event.data.object

  await supabase.from('stripe_balance_snapshots').upsert({
    ledger_id: ledger.id,
    snapshot_at: new Date(event.created * 1000).toISOString(),
    available: balance.available,
    pending: balance.pending,
    raw_data: balance,
  }, { onConflict: 'ledger_id,snapshot_at' }).catch(() => {})

  return { success: true, skipped: true, reason: 'Balance snapshot stored' }
}

async function handleDisputeCreated(
  supabase: any,
  ledger: any,
  event: StripeEvent
): Promise<HandlerResult> {
  const dispute = event.data.object
  const amount = dispute.amount / 100
  const currency = dispute.currency.toUpperCase()

  const { data: originalTx } = await supabase
    .from('transactions')
    .select('id, metadata')
    .eq('ledger_id', ledger.id)
    .eq('metadata->stripe_charge_id', dispute.charge)
    .single()

  const accounts = await getOrCreateAccounts(supabase, ledger.id, originalTx?.metadata?.creator_id)

  let disputesAccount = accounts.disputes
  if (!disputesAccount) {
    const { data: newDisputes } = await supabase
      .from('accounts')
      .insert({
        ledger_id: ledger.id,
        account_type: 'disputes_pending',
        entity_type: 'platform',
        name: 'Pending Disputes',
      })
      .select('id')
      .single()
    disputesAccount = newDisputes
  }

  const { data: transaction, error: txError } = await supabase
    .from('transactions')
    .insert({
      ledger_id: ledger.id,
      transaction_type: 'dispute',
      reference_id: `stripe_dispute_${dispute.id}`,
      reference_type: 'stripe_dispute',
      description: `Dispute opened: ${dispute.reason}`,
      amount,
      currency,
      status: 'pending',
      metadata: {
        source: 'stripe',
        stripe_dispute_id: dispute.id,
        stripe_charge_id: dispute.charge,
        reason: dispute.reason,
        original_transaction_id: originalTx?.id,
      }
    })
    .select('id')
    .single()

  if (txError) {
    return { success: false, error: 'Dispute transaction creation failed' }
  }

  await supabase.from('entries').insert([
    { transaction_id: transaction.id, account_id: accounts.cash.id, entry_type: 'credit', amount },
    { transaction_id: transaction.id, account_id: disputesAccount.id, entry_type: 'debit', amount },
  ])

  await supabase.from('stripe_transactions').insert({
    ledger_id: ledger.id,
    stripe_id: dispute.id,
    stripe_type: 'dispute',
    amount: -amount,
    currency,
    status: 'pending',
    description: `Dispute: ${dispute.reason}`,
    transaction_id: transaction.id,
    match_status: 'auto_matched',
    raw_data: dispute,
  }).catch(() => {})

  // DISPUTE BALANCE LOCKING: Insert held_funds to block payout calculations
  const creatorId = originalTx?.metadata?.creator_id
  if (creatorId) {
    await supabase.from('held_funds').insert({
      ledger_id: ledger.id,
      transaction_id: transaction.id,
      withholding_rule_id: null,          // Disputes are event-driven, not rule-based
      creator_id: creatorId,
      held_amount: amount,
      status: 'held',
      hold_reason: `dispute:${dispute.id}`,
      release_eligible_at: null,          // Manual release only — resolved via dispute close
    }).catch((err: any) => {
      console.error(`Failed to create dispute hold for ${dispute.id}:`, err.message)
    })
  }

  return { success: true, transaction_id: transaction.id }
}

async function handleDisputeClosed(
  supabase: any,
  ledger: any,
  event: StripeEvent
): Promise<HandlerResult> {
  const dispute = event.data.object
  const amount = dispute.amount / 100
  const won = dispute.status === 'won'

  const accounts = await getOrCreateAccounts(supabase, ledger.id)

  const { data: disputeTx } = await supabase
    .from('transactions')
    .select('id')
    .eq('ledger_id', ledger.id)
    .eq('reference_id', `stripe_dispute_${dispute.id}`)
    .single()

  const { data: transaction, error: txError } = await supabase
    .from('transactions')
    .insert({
      ledger_id: ledger.id,
      transaction_type: won ? 'dispute_won' : 'dispute_lost',
      reference_id: `stripe_dispute_closed_${dispute.id}`,
      reference_type: 'stripe_dispute_closed',
      description: `Dispute ${won ? 'won' : 'lost'}: ${dispute.id}`,
      amount,
      status: 'completed',
      reverses: disputeTx?.id,
      metadata: {
        source: 'stripe',
        stripe_dispute_id: dispute.id,
        outcome: dispute.status,
      }
    })
    .select('id')
    .single()

  if (txError) {
    return { success: false, error: 'Dispute close transaction creation failed' }
  }

  if (won) {
    await supabase.from('entries').insert([
      { transaction_id: transaction.id, account_id: accounts.disputes.id, entry_type: 'credit', amount },
      { transaction_id: transaction.id, account_id: accounts.cash.id, entry_type: 'debit', amount },
    ])
  } else {
    await supabase.from('entries').insert([
      { transaction_id: transaction.id, account_id: accounts.disputes.id, entry_type: 'credit', amount },
      { transaction_id: transaction.id, account_id: accounts.fees.id, entry_type: 'debit', amount },
    ])
  }

  await supabase
    .from('stripe_transactions')
    .update({ status: dispute.status })
    .eq('stripe_id', dispute.id)
    .eq('ledger_id', ledger.id)

  // DISPUTE BALANCE LOCKING: Update held_funds based on outcome
  const holdReason = `dispute:${dispute.id}`
  if (won) {
    // Dispute won — release the held funds back to creator
    await supabase
      .from('held_funds')
      .update({
        status: 'released',
        released_amount: amount,
        released_at: new Date().toISOString(),
        release_reason: 'Dispute won',
        release_transaction_id: transaction.id,
      })
      .eq('ledger_id', ledger.id)
      .eq('hold_reason', holdReason)
      .eq('status', 'held')
  } else {
    // Dispute lost — forfeit the held funds
    await supabase
      .from('held_funds')
      .update({
        status: 'forfeited',
        released_at: new Date().toISOString(),
        release_reason: 'Dispute lost',
        release_transaction_id: transaction.id,
      })
      .eq('ledger_id', ledger.id)
      .eq('hold_reason', holdReason)
      .eq('status', 'held')
  }

  return { success: true, transaction_id: transaction.id }
}

// ============================================================================
// HELPERS
// ============================================================================

async function findLedgerForEvent(supabase: any, event: StripeEvent): Promise<any | null> {
  const obj = event.data.object
  
  // Try ledger_id from metadata
  const ledgerId = obj.metadata?.ledger_id || obj.payment_intent?.metadata?.ledger_id
  if (ledgerId) {
    const { data } = await supabase
      .from('ledgers')
      .select('id, settings, status')
      .eq('id', ledgerId)
      .single()
    return data
  }

  // Try Stripe account ID
  const stripeAccountId = event.account || obj.on_behalf_of
  if (stripeAccountId) {
    const { data } = await supabase
      .from('ledgers')
      .select('id, settings, status')
      .eq('settings->stripe_account_id', stripeAccountId)
      .single()
    return data
  }

  return null
}

async function getOrCreateAccounts(
  supabase: any, 
  ledgerId: string, 
  creatorId?: string
): Promise<Record<string, any>> {
  const result: Record<string, any> = {}

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, account_type, entity_id')
    .eq('ledger_id', ledgerId)
    .eq('is_active', true)

  for (const acc of accounts || []) {
    if (acc.account_type === 'cash') result.cash = acc
    if (acc.account_type === 'revenue') result.revenue = acc
    if (acc.account_type === 'platform_revenue') result.platformRevenue = acc
    if (acc.account_type === 'processing_fees') result.fees = acc
    if (acc.account_type === 'bank') result.bank = acc
    if (acc.account_type === 'disputes_pending') result.disputes = acc
    if (acc.account_type === 'creator_balance' && acc.entity_id === creatorId) {
      result.creator = acc
    }
  }

  if (!result.fees) {
    const { data } = await supabase
      .from('accounts')
      .insert({
        ledger_id: ledgerId,
        account_type: 'processing_fees',
        entity_type: 'platform',
        name: 'Stripe Processing Fees',
      })
      .select('id')
      .single()
    result.fees = data
  }

  if (creatorId && !result.creator) {
    const { data } = await supabase
      .from('accounts')
      .insert({
        ledger_id: ledgerId,
        account_type: 'creator_balance',
        entity_id: creatorId,
        entity_type: 'creator',
        name: `Creator ${creatorId}`,
      })
      .select('id')
      .single()
    result.creator = data
  }

  return result
}

function jsonResponse(data: any, status = 200, req?: Request) {
  const headers = req ? getCorsHeaders(req) : { 'Content-Type': 'application/json' }
  return new Response(
    JSON.stringify(data),
    { status, headers: { ...headers, 'Content-Type': 'application/json' } }
  )
}
