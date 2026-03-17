// SERVICE_ID: SVC_CHECKOUT_ORCHESTRATOR
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  createAuditLog,
  LedgerContext,
  sanitizeForAudit,
  validateAmount,
  validateEmail,
  validateId,
  validateString,
  validateUrl,
} from './utils.ts'
import type { PaymentProvider } from './payment-provider.ts'
import { autoLinkTransaction } from './transaction-graph.ts'
import {
  ResourceResult,
  resourceError,
  resourceOk,
} from './treasury-resource.ts'

export interface CreateCheckoutRequest {
  amount: number
  participant_id: string
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

async function getParticipantSplit(
  supabase: SupabaseClient,
  ledger: LedgerContext,
  participantId: string,
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

  const { data: participantAccount } = await supabase
    .from('accounts')
    .select('metadata')
    .eq('ledger_id', ledger.id)
    .eq('account_type', 'creator_balance')
    .eq('entity_id', participantId)
    .eq('is_active', true)
    .single()

  if (participantAccount?.metadata?.custom_split_percent !== undefined) {
    return participantAccount.metadata.custom_split_percent
  }

  if (participantAccount?.metadata?.tier_id) {
    const { data: tier } = await supabase
      .from('creator_tiers')
      .select('creator_percent')
      .eq('id', participantAccount.metadata.tier_id)
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
  provider?: PaymentProvider,
): Promise<ResourceResult> {
  const amount = validateAmount(body.amount)
  if (amount === null || amount <= 0) {
    return resourceError('Invalid amount: must be a positive integer (cents)', 400, {}, 'invalid_amount')
  }

  if (amount < 50) {
    return resourceError('Amount must be at least 50 cents', 400, {}, 'amount_below_minimum')
  }

  const participantId = validateId(body.participant_id, 100)
  if (!participantId) {
    return resourceError('Invalid participant_id: must be 1-100 alphanumeric characters', 400, {}, 'invalid_participant_id')
  }

  const { data: participantCheck } = await supabase
    .from('accounts')
    .select('id, is_active')
    .eq('ledger_id', ledger.id)
    .eq('account_type', 'creator_balance')
    .eq('entity_id', participantId)
    .maybeSingle()

  if (participantCheck && participantCheck.is_active === false) {
    return resourceError('Participant has been deleted', 410, {}, 'participant_deleted')
  }

  const currency = body.currency?.toUpperCase() || 'USD'
  const validCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'NGN']
  if (!validCurrencies.includes(currency)) {
    return resourceError(`Invalid currency: must be one of ${validCurrencies.join(', ')}`, 400, {}, 'invalid_currency')
  }

  const productId = body.product_id ? validateId(body.product_id, 100) : null
  const productName = body.product_name ? validateString(body.product_name, 200) : null
  const customerEmail = body.customer_email ? validateEmail(body.customer_email) : null
  const customerId = body.customer_id ? validateId(body.customer_id, 100) : null
  const paymentMethodIdRaw = body.payment_method_id || body.source_id || null
  const paymentMethodId = paymentMethodIdRaw ? validateString(paymentMethodIdRaw, 200) : null

  const idempotencyKey = body.idempotency_key ? validateId(body.idempotency_key, 120) : null
  if (body.idempotency_key && !idempotencyKey) {
    return resourceError('Invalid idempotency_key', 400, {}, 'invalid_idempotency_key')
  }

  const participantPercent = await getParticipantSplit(supabase, ledger, participantId, productId)
  const participantAmount = Math.floor(amount * (participantPercent / 100))
  const platformAmount = amount - participantAmount

  if (!paymentMethodId) {
    const successUrl = body.success_url ? validateUrl(body.success_url) : null
    if (!successUrl) {
      return resourceError('success_url is required and must be a valid URL when payment_method_id is omitted', 400, {}, 'invalid_success_url')
    }
    const cancelUrl = body.cancel_url ? validateUrl(body.cancel_url) : null
    const sessionExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()

    const { data: session, error: sessionError } = await supabase
      .from('checkout_sessions')
      .insert({
        ledger_id: ledger.id,
        amount,
        currency,
        creator_id: participantId,
        product_id: productId,
        product_name: productName,
        customer_email: customerEmail,
        customer_id: customerId,
        metadata: body.metadata || {},
        success_url: successUrl,
        cancel_url: cancelUrl,
        creator_percent: participantPercent,
        creator_amount: participantAmount,
        platform_amount: platformAmount,
        expires_at: sessionExpiresAt,
      })
      .select('id, expires_at')
      .single()

    if (sessionError || !session) {
      console.error(`[${requestId}] Failed to create checkout session:`, sessionError)
      return resourceError('Failed to create checkout session', 500, {}, 'checkout_session_create_failed')
    }

    const appUrl = (Deno.env.get('APP_URL') || Deno.env.get('NEXT_PUBLIC_APP_URL') || 'https://soledgic.com').replace(/\/+$/, '')

    await createAuditLog(supabase, req, {
      ledger_id: ledger.id,
      action: 'checkout_session_created',
      entity_type: 'checkout_session',
      entity_id: session.id,
      actor_type: 'api',
      request_body: sanitizeForAudit({
        amount,
        currency,
        participant_id: participantId,
        product_id: productId,
        participant_percent: participantPercent,
      }),
      response_status: 200,
      risk_score: 10,
    }, requestId)

    return resourceOk({
      success: true,
      checkout_session: {
        id: session.id,
        mode: 'session',
        provider: null,
        client_secret: null,
        checkout_url: `${appUrl}/pay/${session.id}`,
        payment_id: null,
        payment_intent_id: null,
        status: null,
        requires_action: false,
        amount,
        currency,
        expires_at: session.expires_at,
        breakdown: {
          gross_amount: amount / 100,
          creator_amount: participantAmount / 100,
          platform_amount: platformAmount / 100,
          creator_percent: participantPercent,
        },
      },
    })
  }

  const merchantOverride = typeof (body as any)?.merchant_id === 'string' ? String((body as any).merchant_id).trim() : ''
  if (merchantOverride.length > 0) {
    return resourceError('merchant_id is not allowed', 400, {}, 'merchant_override_not_allowed')
  }

  if (!provider) throw new Error('PaymentProvider is required for direct charge flows')
  const description = productName
    ? `${productName}`
    : `Purchase from ${(ledger.settings as any)?.platform_name || ledger.business_name}`

  const checkoutMetadata: Record<string, string> = {
    ledger_id: ledger.id,
    creator_id: participantId,
    participant_id: participantId,
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
    return resourceError('idempotency_key is required for direct charges', 400, {}, 'missing_idempotency_key')
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

    return resourceError(
      checkoutResult.error || 'Failed to create payment',
      isProviderConfigError ? 400 : 500,
      {},
      isProviderConfigError ? 'payment_provider_configuration_error' : 'payment_provider_error',
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
        p_creator_id: participantId,
        p_gross_amount: amount,
        p_creator_amount: participantAmount,
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
      // Build transaction graph node for this sale (no edges yet — edges created when refunds/payouts reference it)
      void autoLinkTransaction(supabase, ledger.id, {
        id: saleTransactionId,
        transaction_type: 'sale',
      })

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
            participant_id: participantId,
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

  await createAuditLog(supabase, req, {
    ledger_id: ledger.id,
    action: 'checkout_created',
    entity_type: 'payment_transfer',
    entity_id: checkoutPayment.id,
    actor_type: 'api',
    request_body: sanitizeForAudit({
      amount,
      currency,
      participant_id: participantId,
      product_id: productId,
      participant_percent: participantPercent,
      provider: 'card',
      sale_booked: saleBooked,
    }),
    response_status: 200,
    risk_score: 10,
  }, requestId)

  return resourceOk({
    success: true,
    checkout_session: {
      id: checkoutPayment.id,
      mode: 'direct',
      provider: 'card',
      client_secret: checkoutPayment.client_secret,
      checkout_url: checkoutPayment.checkout_url,
      payment_id: checkoutPayment.id,
      payment_intent_id: checkoutPayment.id,
      status: checkoutPayment.status,
      requires_action: checkoutPayment.requires_action,
      amount,
      currency,
      expires_at: null,
      breakdown: {
        gross_amount: amount / 100,
        creator_amount: participantAmount / 100,
        platform_amount: platformAmount / 100,
        creator_percent: participantPercent,
      },
    },
  })
}
