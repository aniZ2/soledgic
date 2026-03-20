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
  buyer_id?: string
  customer_country?: string
  customer_state?: string
  customer_postal_code?: string
  customer_address?: {
    country?: string
    state?: string
    postal_code?: string
  }
  payment_method_id?: string
  source_id?: string
  success_url?: string
  cancel_url?: string
  idempotency_key?: string
  tax_category?: string
  collect_sales_tax?: boolean
  metadata?: Record<string, string>
}

const MARYLAND_DIGITAL_GOODS_TAX_RATE_BPS = 600

function pickFirstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed.length > 0) return trimmed
  }
  return null
}

function normalizeCountryCode(value: string | null): string | null {
  if (!value) return null
  const normalized = value.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null
}

function normalizeStateCode(value: string | null): string | null {
  if (!value) return null
  const normalized = value.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null
}

function normalizePostalCode(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim().toUpperCase()
  return trimmed.length > 20 ? trimmed.slice(0, 20) : trimmed
}

function normalizeTaxCategory(value: string | null): string | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (normalized === 'ebook' || normalized === 'e_book' || normalized === 'digital_book') {
    return 'digital_goods'
  }
  if (normalized === 'digital_goods' || normalized === 'service' || normalized === 'physical_goods' || normalized === 'exempt') {
    return normalized
  }
  return normalized
}

function isDigitalGoodsCategory(taxCategory: string | null): boolean {
  return taxCategory === 'digital_goods'
}

function shouldCollectMarylandDigitalGoodsTax(
  taxCategory: string | null,
  collectSalesTax: boolean,
  customerCountry: string | null,
  customerState: string | null,
): boolean {
  if (!collectSalesTax) return false
  if (!isDigitalGoodsCategory(taxCategory)) return false
  if ((customerCountry || 'US') !== 'US') return false
  return customerState === 'MD'
}

async function recordSalesTaxThresholdProgress(
  supabase: SupabaseClient,
  ledgerId: string,
  stateCode: string | null,
  sourceType: string,
  sourceId: string,
  taxableSalesCents: number,
  taxAmountCents: number,
  metadata: Record<string, string | number | boolean | null>,
): Promise<void> {
  if (!stateCode || taxableSalesCents <= 0) return

  const now = new Date()
  const calendarYear = now.getUTCFullYear()
  const { error } = await supabase.rpc('record_sales_tax_threshold_event', {
    p_ledger_id: ledgerId,
    p_state_code: stateCode,
    p_source_type: sourceType,
    p_source_id: sourceId,
    p_taxable_sales_cents: taxableSalesCents,
    p_tax_amount_cents: taxAmountCents,
    p_calendar_year: calendarYear,
    p_metadata: metadata,
  })

  if (error) {
    console.error(`[sales-tax] Failed to record threshold progress for ${sourceType}:${sourceId}`, error.message)
  }
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
  const requestedAmount = validateAmount(body.amount)
  if (requestedAmount === null || requestedAmount <= 0) {
    return resourceError('Invalid amount: must be a positive integer (cents)', 400, {}, 'invalid_amount')
  }

  if (requestedAmount < 50) {
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
  const customerCountry = normalizeCountryCode(
    pickFirstString(
      body.customer_country,
      body.customer_address?.country,
      body.metadata?.customer_country,
      body.metadata?.country,
    )
  ) || 'US'
  const customerState = normalizeStateCode(
    pickFirstString(
      body.customer_state,
      body.customer_address?.state,
      body.metadata?.customer_state,
      body.metadata?.state,
    )
  )
  const customerPostalCode = normalizePostalCode(
    pickFirstString(
      body.customer_postal_code,
      body.customer_address?.postal_code,
      body.metadata?.customer_postal_code,
      body.metadata?.postal_code,
      body.metadata?.zip,
    )
  )
  const taxCategory = normalizeTaxCategory(
    pickFirstString(
      body.tax_category,
      body.metadata?.tax_category,
      body.metadata?.product_tax_category,
    )
  )
  const collectSalesTax = body.collect_sales_tax === true
  const paymentMethodIdRaw = body.payment_method_id || body.source_id || null
  const paymentMethodId = paymentMethodIdRaw ? validateString(paymentMethodIdRaw, 200) : null

  const idempotencyKey = body.idempotency_key ? validateId(body.idempotency_key, 120) : null
  if (body.idempotency_key && !idempotencyKey) {
    return resourceError('Invalid idempotency_key', 400, {}, 'invalid_idempotency_key')
  }

  if (collectSalesTax && isDigitalGoodsCategory(taxCategory) && !customerState) {
    return resourceError('customer_state is required when collect_sales_tax is true for digital goods', 400, {}, 'missing_customer_state')
  }

  const subtotalAmount = requestedAmount
  const salesTaxAmount = shouldCollectMarylandDigitalGoodsTax(taxCategory, collectSalesTax, customerCountry, customerState)
    ? Math.round(subtotalAmount * (MARYLAND_DIGITAL_GOODS_TAX_RATE_BPS / 10000))
    : 0
  const salesTaxRateBps = salesTaxAmount > 0 ? MARYLAND_DIGITAL_GOODS_TAX_RATE_BPS : null
  const salesTaxState = salesTaxAmount > 0 ? 'MD' : null
  const totalAmount = subtotalAmount + salesTaxAmount

  const participantPercent = await getParticipantSplit(supabase, ledger, participantId, productId)
  // Soledgic fee: 3.5% of taxable subtotal, off the top before split.
  const actualSoledgicFee = Math.floor(subtotalAmount * 0.035)
  const netAfterFee = subtotalAmount - actualSoledgicFee
  const participantAmount = Math.floor(netAfterFee * (participantPercent / 100))
  const platformAmount = netAfterFee - participantAmount

  if (!paymentMethodId) {
    const successUrl = body.success_url ? validateUrl(body.success_url) : null
    if (!successUrl) {
      return resourceError('success_url is required and must be a valid URL when payment_method_id is omitted', 400, {}, 'invalid_success_url')
    }
    const cancelUrl = body.cancel_url ? validateUrl(body.cancel_url) : null
    const sessionExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()

    // Idempotency: if key provided, check for existing session first
    if (idempotencyKey) {
      const { data: existing } = await supabase
        .from('checkout_sessions')
        .select('id, expires_at')
        .eq('ledger_id', ledger.id)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle()

      if (existing) {
        return resourceOk({
          checkout_session_id: existing.id,
          checkout_url: `${(Deno.env.get('APP_URL') || 'https://soledgic.com').replace(/\/+$/, '')}/checkout/${existing.id}`,
          expires_at: existing.expires_at,
          already_exists: true,
        })
      }
    }

    const { data: session, error: sessionError } = await supabase
      .from('checkout_sessions')
      .insert({
        ledger_id: ledger.id,
        amount: totalAmount,
        subtotal_amount: subtotalAmount,
        sales_tax_amount: salesTaxAmount,
        sales_tax_rate_bps: salesTaxRateBps,
        sales_tax_state: salesTaxState,
        customer_tax_country: customerCountry,
        customer_tax_state: customerState,
        customer_tax_postal_code: customerPostalCode,
        currency,
        creator_id: participantId,
        product_id: productId,
        product_name: productName,
        customer_email: customerEmail,
        customer_id: customerId,
        metadata: {
          ...(body.metadata || {}),
          ...(taxCategory ? { tax_category: taxCategory } : {}),
          collect_sales_tax: collectSalesTax,
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
        creator_percent: participantPercent,
        creator_amount: participantAmount,
        platform_amount: platformAmount,
        expires_at: sessionExpiresAt,
        ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
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
        subtotal_amount: subtotalAmount,
        total_amount: totalAmount,
        sales_tax_amount: salesTaxAmount,
        currency,
        participant_id: participantId,
        product_id: productId,
        participant_percent: participantPercent,
        customer_tax_state: customerState,
        collect_sales_tax: collectSalesTax,
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
        amount: totalAmount,
        currency,
        expires_at: session.expires_at,
        breakdown: {
          gross_amount: totalAmount / 100,
          subtotal_amount: subtotalAmount / 100,
          sales_tax_amount: salesTaxAmount / 100,
          sales_tax_state: salesTaxState,
          creator_amount: participantAmount / 100,
          platform_amount: platformAmount / 100,
          soledgic_fee: actualSoledgicFee / 100,
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
  if (customerState) checkoutMetadata.customer_tax_state = customerState
  if (customerPostalCode) checkoutMetadata.customer_tax_postal_code = customerPostalCode
  if (taxCategory) checkoutMetadata.tax_category = taxCategory
  if (salesTaxAmount > 0) {
    checkoutMetadata.sales_tax_amount_cents = String(salesTaxAmount)
    checkoutMetadata.sales_tax_state = salesTaxState || ''
  }
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
    amount: totalAmount,
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

  let fundingBooked = false
  let fundingTransactionId: string | null = null
  let saleBooked = false
  let saleTransactionId: string | null = null

  if (!isChargeFailed && !checkoutPayment.requires_action) {
    const fundingReferenceId = `funding_${checkoutPayment.id}`
    const saleReferenceId = `sale_${checkoutPayment.id}`
    const buyerId = body.customer_id || body.buyer_id || participantId

    // ── Step 1: FUNDING (Stripe → buyer wallet) ──────────────────
    // External money enters the system. No creator, no platform split.
    try {
      const { data: fundingResult, error: fundingError } = await supabase.rpc('record_funding_atomic', {
        p_ledger_id: ledger.id,
        p_reference_id: fundingReferenceId,
        p_buyer_id: buyerId,
        p_amount_cents: totalAmount,
        p_processing_fee_cents: 0, // Stripe fee tracked separately via webhook
        p_metadata: {
          checkout_provider: 'card',
          stripe_payment_id: checkoutPayment.id,
        },
      })

      if (fundingError) {
        if (fundingError.code === '23505' || String(fundingError.message || '').includes('duplicate')) {
          fundingBooked = true
        } else {
          console.error(`[${requestId}] Funding booking failed:`, fundingError.message)
        }
      } else {
        fundingBooked = true
        const row = Array.isArray(fundingResult) ? fundingResult[0] : fundingResult
        fundingTransactionId = row?.out_transaction_id || null
      }
    } catch (error) {
      console.error(`[${requestId}] Funding booking error:`, error)
    }

    // ── Step 2: SALE (wallet redistribution) ─────────────────────
    // Internal: buyer wallet → creator + platform + soledgic fee.
    // Only proceeds if funding succeeded.
    if (fundingBooked) {
      try {
        const { data: saleResult, error: saleError } = await supabase.rpc('record_sale_atomic', {
          p_ledger_id: ledger.id,
          p_reference_id: saleReferenceId,
          p_creator_id: participantId,
          p_gross_amount: totalAmount,
          p_creator_amount: participantAmount,
          p_platform_amount: platformAmount,
          p_processing_fee: 0,
          p_soledgic_fee: actualSoledgicFee,
          p_sales_tax: salesTaxAmount,
          p_product_id: productId || null,
          p_product_name: productName || null,
          p_metadata: {
            ...(body.metadata || {}),
            funding_transaction_id: fundingTransactionId,
            buyer_id: buyerId,
            checkout_provider: 'card',
            subtotal_amount_cents: subtotalAmount,
            sales_tax_amount_cents: salesTaxAmount,
            customer_tax_country: customerCountry,
            customer_tax_state: customerState,
            ...(taxCategory ? { tax_category: taxCategory } : {}),
          },
        })

        if (saleError) {
          if (saleError.code === '23505' || String(saleError.message || '').includes('duplicate')) {
            saleBooked = true
          } else {
            console.error(`[${requestId}] Sale booking failed:`, saleError.message)
          }
        } else {
          saleBooked = true
          const row = Array.isArray(saleResult) ? saleResult[0] : saleResult
          saleTransactionId = row?.out_transaction_id || null
        }
      } catch (error) {
        console.error(`[${requestId}] Sale booking error:`, error)
      }
    }

    if (saleBooked && saleTransactionId) {
      await recordSalesTaxThresholdProgress(
        supabase,
        ledger.id,
        isDigitalGoodsCategory(taxCategory) ? customerState : null,
        'direct_charge',
        checkoutPayment.id,
        isDigitalGoodsCategory(taxCategory) ? subtotalAmount : 0,
        salesTaxAmount,
        {
          source: 'checkout_service_direct',
          tax_category: taxCategory,
          collect_sales_tax: collectSalesTax,
          customer_tax_state: customerState,
        },
      )

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
            funding_transaction_id: fundingTransactionId,
            sale_transaction_id: saleTransactionId,
            amount: totalAmount / 100,
            subtotal_amount: subtotalAmount / 100,
            sales_tax_amount: salesTaxAmount / 100,
            sales_tax_state: salesTaxState,
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
      subtotal_amount: subtotalAmount,
      total_amount: totalAmount,
      sales_tax_amount: salesTaxAmount,
      currency,
      participant_id: participantId,
      product_id: productId,
      participant_percent: participantPercent,
      provider: 'card',
      sale_booked: saleBooked,
      customer_tax_state: customerState,
      collect_sales_tax: collectSalesTax,
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
      amount: totalAmount,
      currency,
      expires_at: null,
      breakdown: {
        gross_amount: totalAmount / 100,
        subtotal_amount: subtotalAmount / 100,
        sales_tax_amount: salesTaxAmount / 100,
        sales_tax_state: salesTaxState,
        creator_amount: participantAmount / 100,
        platform_amount: platformAmount / 100,
        soledgic_fee: actualSoledgicFee / 100,
        creator_percent: participantPercent,
      },
    },
  })
}
