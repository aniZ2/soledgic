import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  createAuditLogAsync,
  errorResponse,
  jsonResponse,
  LedgerContext,
  sanitizeForAudit,
  validateAmount,
  validateEmail,
  validateId,
  validateString,
  validateUrl,
} from './utils.ts'
import {
  getPaymentProvider,
  type PaymentProviderName,
} from './payment-provider.ts'

export interface CreateCheckoutRequest {
  amount: number
  creator_id: string
  currency?: string
  product_id?: string
  product_name?: string
  customer_email?: string
  customer_id?: string
  payment_method_id?: string
  source_id?: string
  success_url?: string
  cancel_url?: string
  idempotency_key?: string
  metadata?: Record<string, string>
}

interface CreateCheckoutResponse {
  success: boolean
  provider: PaymentProviderName
  payment_id: string
  payment_intent_id: string
  client_secret?: string | null
  checkout_url?: string | null
  status?: string | null
  requires_action?: boolean
  amount: number
  currency: string
  breakdown?: {
    gross_amount: number
    creator_amount: number
    platform_amount: number
    creator_percent: number
  }
}

async function getCreatorSplit(
  supabase: SupabaseClient,
  ledger: LedgerContext,
  creatorId: string,
  productId?: string | null,
): Promise<number> {
  if (productId) {
    const { data: productSplit } = await supabase
      .from('product_splits')
      .select('creator_percent')
      .eq('ledger_id', ledger.id)
      .eq('product_id', productId)
      .single()

    if (productSplit?.creator_percent !== undefined) {
      return productSplit.creator_percent
    }
  }

  const { data: creatorAccount } = await supabase
    .from('accounts')
    .select('metadata')
    .eq('ledger_id', ledger.id)
    .eq('account_type', 'creator_balance')
    .eq('entity_id', creatorId)
    .eq('is_active', true)
    .single()

  if (creatorAccount?.metadata?.custom_split_percent !== undefined) {
    return creatorAccount.metadata.custom_split_percent
  }

  if (creatorAccount?.metadata?.tier_id) {
    const { data: tier } = await supabase
      .from('creator_tiers')
      .select('creator_percent')
      .eq('id', creatorAccount.metadata.tier_id)
      .single()

    if (tier?.creator_percent !== undefined) {
      return tier.creator_percent
    }
  }

  const settings = ledger.settings as Record<string, any>

  if (settings?.default_split_percent !== undefined) {
    return settings.default_split_percent
  }

  if (settings?.default_platform_fee_percent !== undefined) {
    return 100 - settings.default_platform_fee_percent
  }

  return 80
}

export async function createCheckoutResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: CreateCheckoutRequest,
  requestId: string,
): Promise<Response> {
  const amount = validateAmount(body.amount)
  if (amount === null || amount <= 0) {
    return errorResponse('Invalid amount: must be a positive integer (cents)', 400, req, requestId)
  }

  if (amount < 50) {
    return errorResponse('Amount must be at least 50 cents', 400, req, requestId)
  }

  const creatorId = validateId(body.creator_id, 100)
  if (!creatorId) {
    return errorResponse('Invalid creator_id: must be 1-100 alphanumeric characters', 400, req, requestId)
  }

  const { data: creatorCheck } = await supabase
    .from('accounts')
    .select('id, is_active')
    .eq('ledger_id', ledger.id)
    .eq('account_type', 'creator_balance')
    .eq('entity_id', creatorId)
    .maybeSingle()

  if (creatorCheck && creatorCheck.is_active === false) {
    return errorResponse('Creator has been deleted', 410, req, requestId)
  }

  const currency = body.currency?.toUpperCase() || 'USD'
  const validCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'NGN']
  if (!validCurrencies.includes(currency)) {
    return errorResponse(`Invalid currency: must be one of ${validCurrencies.join(', ')}`, 400, req, requestId)
  }

  const productId = body.product_id ? validateId(body.product_id, 100) : null
  const productName = body.product_name ? validateString(body.product_name, 200) : null
  const customerEmail = body.customer_email ? validateEmail(body.customer_email) : null
  const customerId = body.customer_id ? validateId(body.customer_id, 100) : null
  const paymentMethodIdRaw = body.payment_method_id || body.source_id || null
  const paymentMethodId = paymentMethodIdRaw ? validateString(paymentMethodIdRaw, 200) : null

  const idempotencyKey = body.idempotency_key ? validateId(body.idempotency_key, 120) : null
  if (body.idempotency_key && !idempotencyKey) {
    return errorResponse('Invalid idempotency_key', 400, req, requestId)
  }

  if (!paymentMethodId) {
    const successUrl = body.success_url ? validateUrl(body.success_url) : null
    if (!successUrl) {
      return errorResponse('success_url is required and must be a valid URL when payment_method_id is omitted', 400, req, requestId)
    }
    const cancelUrl = body.cancel_url ? validateUrl(body.cancel_url) : null

    const creatorPercent = await getCreatorSplit(supabase, ledger, creatorId, productId)
    const creatorAmount = Math.floor(amount * (creatorPercent / 100))
    const platformAmount = amount - creatorAmount
    const sessionExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()

    const { data: session, error: sessionError } = await supabase
      .from('checkout_sessions')
      .insert({
        ledger_id: ledger.id,
        amount,
        currency,
        creator_id: creatorId,
        product_id: productId,
        product_name: productName,
        customer_email: customerEmail,
        customer_id: customerId,
        metadata: body.metadata || {},
        success_url: successUrl,
        cancel_url: cancelUrl,
        creator_percent: creatorPercent,
        creator_amount: creatorAmount,
        platform_amount: platformAmount,
        expires_at: sessionExpiresAt,
      })
      .select('id, expires_at')
      .single()

    if (sessionError || !session) {
      console.error(`[${requestId}] Failed to create checkout session:`, sessionError)
      return errorResponse('Failed to create checkout session', 500, req, requestId)
    }

    const appUrl = (Deno.env.get('APP_URL') || Deno.env.get('NEXT_PUBLIC_APP_URL') || 'https://soledgic.com').replace(/\/+$/, '')

    createAuditLogAsync(supabase, req, {
      ledger_id: ledger.id,
      action: 'checkout_session_created',
      entity_type: 'checkout_session',
      entity_id: session.id,
      actor_type: 'api',
      request_body: sanitizeForAudit({
        amount,
        currency,
        creator_id: creatorId,
        product_id: productId,
        creator_percent: creatorPercent,
      }),
      response_status: 200,
      risk_score: 10,
    }, requestId)

    return jsonResponse({
      success: true,
      mode: 'session',
      session_id: session.id,
      checkout_url: `${appUrl}/pay/${session.id}`,
      expires_at: session.expires_at,
      breakdown: {
        gross_amount: amount / 100,
        creator_amount: creatorAmount / 100,
        platform_amount: platformAmount / 100,
        creator_percent: creatorPercent,
      },
    }, 200, req, requestId)
  }

  const merchantOverride = typeof (body as any)?.merchant_id === 'string' ? String((body as any).merchant_id).trim() : ''
  if (merchantOverride.length > 0) {
    return errorResponse('merchant_id is not allowed', 400, req, requestId)
  }

  const provider = getPaymentProvider('card')
  const creatorPercent = await getCreatorSplit(supabase, ledger, creatorId, productId)
  const creatorAmount = Math.floor(amount * (creatorPercent / 100))
  const platformAmount = amount - creatorAmount
  const description = productName
    ? `${productName}`
    : `Purchase from ${(ledger.settings as any)?.platform_name || ledger.business_name}`

  const checkoutMetadata: Record<string, string> = {
    ledger_id: ledger.id,
    creator_id: creatorId,
    soledgic_request_id: requestId,
    checkout_provider: 'card',
  }

  if (productId) checkoutMetadata.product_id = productId
  if (productName) checkoutMetadata.product_name = productName
  if (customerId) checkoutMetadata.customer_id = customerId
  if (body.metadata) {
    for (const [key, value] of Object.entries(body.metadata)) {
      const safeKey = validateId(key, 40)
      const safeValue = typeof value === 'string' ? value.substring(0, 500) : String(value).substring(0, 500)
      if (safeKey && safeValue) {
        checkoutMetadata[safeKey] = safeValue
      }
    }
  }

  if (!idempotencyKey) {
    return errorResponse('idempotency_key is required for direct charges', 400, req, requestId)
  }

  const checkoutResult = await provider.createPaymentIntent({
    amount,
    currency,
    metadata: checkoutMetadata,
    description,
    receipt_email: customerEmail || undefined,
    payment_method_id: paymentMethodId,
    idempotency_id: `checkout_direct_${idempotencyKey}`,
  })

  if (!checkoutResult.success || !checkoutResult.id) {
    console.error(`[${requestId}] Checkout creation failed:`, {
      provider: 'card',
      error: checkoutResult.error,
    })

    const normalizedError = (checkoutResult.error || '').toLowerCase()
    const isProviderConfigError =
      normalizedError.includes('no payment method') ||
      normalizedError.includes('no destination') ||
      normalizedError.includes('configured') ||
      normalizedError.includes('disabled')

    return errorResponse(
      checkoutResult.error || 'Failed to create payment',
      isProviderConfigError ? 400 : 500,
      req,
      requestId,
    )
  }

  const checkoutPayment = {
    id: checkoutResult.id,
    client_secret: checkoutResult.client_secret || null,
    checkout_url: checkoutResult.redirect_url || null,
    status: checkoutResult.status || null,
    requires_action: Boolean(checkoutResult.requires_action),
  }

  const chargeStatus = (checkoutPayment.status || '').toUpperCase()
  const isChargeFailed = chargeStatus === 'FAILED' || chargeStatus === 'CANCELED'

  let saleBooked = false
  let saleTransactionId: string | null = null

  if (!isChargeFailed && !checkoutPayment.requires_action) {
    const directChargeReferenceId = `charge_${checkoutPayment.id}`
    try {
      const { data: saleResult, error: saleError } = await supabase.rpc('record_sale_atomic', {
        p_ledger_id: ledger.id,
        p_reference_id: directChargeReferenceId,
        p_creator_id: creatorId,
        p_gross_amount: amount,
        p_creator_amount: creatorAmount,
        p_platform_amount: platformAmount,
        p_processing_fee: 0,
        p_product_id: productId || null,
        p_product_name: productName || null,
        p_metadata: {
          ...(body.metadata || {}),
          checkout_provider: 'card',
          processor_transfer_id: checkoutPayment.id,
          direct_charge: true,
        },
      })

      if (saleError) {
        if (saleError.code === '23505' || String(saleError.message || '').includes('duplicate')) {
          saleBooked = true
        } else {
          console.error(`[${requestId}] Direct charge ledger booking failed:`, saleError.message)
        }
      } else {
        saleBooked = true
        const row = Array.isArray(saleResult) ? saleResult[0] : saleResult
        saleTransactionId = row?.out_transaction_id || null
      }
    } catch (error) {
      console.error(`[${requestId}] Direct charge ledger booking error:`, error)
    }

    if (saleBooked && saleTransactionId) {
      supabase.rpc('queue_webhook', {
        p_ledger_id: ledger.id,
        p_event_type: 'checkout.completed',
        p_payload: {
          event: 'checkout.completed',
          data: {
            payment_id: checkoutPayment.id,
            reference_id: directChargeReferenceId,
            transaction_id: saleTransactionId,
            amount: amount / 100,
            currency,
            creator_id: creatorId,
            product_id: productId,
            direct_charge: true,
            created_at: new Date().toISOString(),
          },
        },
      }).then(({ error }) => {
        if (error) console.error(`[${requestId}] Failed to queue checkout webhook:`, error)
      })
    }
  }

  createAuditLogAsync(supabase, req, {
    ledger_id: ledger.id,
    action: 'checkout_created',
    entity_type: 'payment_transfer',
    entity_id: checkoutPayment.id,
    actor_type: 'api',
    request_body: sanitizeForAudit({
      amount,
      currency,
      creator_id: creatorId,
      product_id: productId,
      creator_percent: creatorPercent,
      provider: 'card',
      sale_booked: saleBooked,
    }),
    response_status: 200,
    risk_score: 10,
  }, requestId)

  const response: CreateCheckoutResponse = {
    success: true,
    provider: 'card',
    payment_id: checkoutPayment.id,
    payment_intent_id: checkoutPayment.id,
    client_secret: checkoutPayment.client_secret,
    checkout_url: checkoutPayment.checkout_url,
    status: checkoutPayment.status,
    requires_action: checkoutPayment.requires_action,
    amount,
    currency,
    breakdown: {
      gross_amount: amount / 100,
      creator_amount: creatorAmount / 100,
      platform_amount: platformAmount / 100,
      creator_percent: creatorPercent,
    },
  }

  return jsonResponse(response, 200, req, requestId)
}
