// Soledgic Edge Function: Create Checkout
// POST /create-checkout
// Creates a provider-backed checkout payment (processor-first).
// This is the ENTRY POINT for payment flows.
// SECURITY HARDENED VERSION

import {
  createHandler,
  jsonResponse,
  errorResponse,
  validateAmount,
  validateId,
  validateString,
  validateEmail,
  LedgerContext,
  createAuditLogAsync,
  sanitizeForAudit
} from '../_shared/utils.ts'
import {
  getStripeSecretKey,
  getPaymentProvider,
  normalizePaymentProviderName,
  type PaymentProviderName,
} from '../_shared/payment-provider.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ============================================================================
// TYPES
// ============================================================================

interface CreateCheckoutRequest {
  // Required
  amount: number              // In cents
  creator_id: string          // Creator receiving the revenue share
  
  // Optional
  currency?: string           // Default: USD
  product_id?: string         // For tracking
  product_name?: string       // Human-readable descriptor
  customer_email?: string     // Customer email for provider receipt metadata
  customer_id?: string        // Your platform's customer ID
  
  // Advanced
  capture_method?: 'automatic' | 'manual'  // Default: automatic
  setup_future_usage?: 'off_session' | 'on_session'  // For saving cards
  payment_provider?: PaymentProviderName
  payment_method_id?: string
  source_id?: string
  merchant_id?: string
  
  // Pass-through
  metadata?: Record<string, string>  // Additional metadata
}

interface CreateCheckoutResponse {
  success: boolean
  provider: PaymentProviderName
  payment_id: string
  // Backward-compat alias retained for existing clients.
  payment_intent_id: string
  client_secret?: string | null
  checkout_url?: string | null
  status?: string | null
  requires_action?: boolean
  amount: number
  currency: string
  
  // For reference
  breakdown?: {
    gross_amount: number
    creator_amount: number
    platform_amount: number
    creator_percent: number
  }
}

interface OrganizationSettings {
  finix?: {
    merchant_id?: string | null
    source_id?: string | null
  } | null
  charge_provider?: string | null
  payment_provider?: string | null
  payments?: {
    charge_provider?: string | null
    default_provider?: string | null
  } | null
}

interface ResolvedChargeProvider {
  provider: PaymentProviderName
  source: string
  error?: string
}

// ============================================================================
// SPLIT CALCULATION
// ============================================================================

async function getCreatorSplit(
  supabase: SupabaseClient,
  ledger: LedgerContext,
  creatorId: string,
  productId?: string | null
): Promise<number> {
  // 1. Check for product-specific split
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
  
  // 2. Check for creator-specific split
  const { data: creatorAccount } = await supabase
    .from('accounts')
    .select('metadata')
    .eq('ledger_id', ledger.id)
    .eq('account_type', 'creator_balance')
    .eq('entity_id', creatorId)
    .single()
  
  if (creatorAccount?.metadata?.custom_split_percent !== undefined) {
    return creatorAccount.metadata.custom_split_percent
  }
  
  // 3. Check for tier-based split
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
  
  // 4. Fall back to ledger default
  const settings = ledger.settings as Record<string, any>
  
  // Handle both naming conventions
  if (settings?.default_split_percent !== undefined) {
    return settings.default_split_percent
  }
  
  // If platform fee is stored instead (e.g., 20% platform = 80% creator)
  if (settings?.default_platform_fee_percent !== undefined) {
    return 100 - settings.default_platform_fee_percent
  }
  
  // Ultimate fallback: 80% to creator
  return 80
}

async function getOrganizationSettings(
  supabase: SupabaseClient,
  organizationId?: string
): Promise<OrganizationSettings | null> {
  if (!organizationId) return null

  const { data, error } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', organizationId)
    .maybeSingle()

  if (error || !data?.settings) return null
  return data.settings as OrganizationSettings
}

function resolveChargeProvider(
  requestedProvider: PaymentProviderName | null,
  ledgerSettings: Record<string, any>,
  organizationSettings: OrganizationSettings | null
): ResolvedChargeProvider {
  const allowStripeCharges = Deno.env.get('ENABLE_STRIPE_CHARGE_PROVIDER') === 'true'

  if (requestedProvider === 'stripe' && !allowStripeCharges) {
    return {
      provider: 'card',
      source: 'request',
      error: 'Legacy checkout provider is disabled. Use the default processor for charge flows.',
    }
  }
  if (requestedProvider) {
    return { provider: requestedProvider, source: 'request' }
  }

  const candidates: Array<{ value: unknown; source: string }> = [
    { value: ledgerSettings?.charge_provider, source: 'ledger.settings.charge_provider' },
    { value: ledgerSettings?.payment_provider, source: 'ledger.settings.payment_provider' },
    { value: ledgerSettings?.checkout_provider, source: 'ledger.settings.checkout_provider' },
    { value: organizationSettings?.payments?.charge_provider, source: 'organization.settings.payments.charge_provider' },
    { value: organizationSettings?.payments?.default_provider, source: 'organization.settings.payments.default_provider' },
    { value: organizationSettings?.charge_provider, source: 'organization.settings.charge_provider' },
    { value: organizationSettings?.payment_provider, source: 'organization.settings.payment_provider' },
    { value: Deno.env.get('DEFAULT_CHARGE_PROVIDER'), source: 'env.DEFAULT_CHARGE_PROVIDER' },
  ]

  for (const candidate of candidates) {
    const provider = normalizePaymentProviderName(candidate.value)
    if (!provider) continue
    if (provider === 'stripe' && !allowStripeCharges) continue
    return { provider, source: candidate.source }
  }

  return { provider: 'card', source: 'default.card' }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

const handler = createHandler(
  { endpoint: 'create-checkout', requireAuth: true, rateLimit: true },
  async (req: Request, supabase: SupabaseClient, ledger: LedgerContext | null, body: CreateCheckoutRequest, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }
    
    // ========================================================================
    // VALIDATION
    // ========================================================================
    
    // Amount (required, in cents)
    const amount = validateAmount(body.amount)
    if (amount === null || amount <= 0) {
      return errorResponse('Invalid amount: must be a positive integer (cents)', 400, req, requestId)
    }
    
    // Processor minimum for this flow is 50 cents.
    if (amount < 50) {
      return errorResponse('Amount must be at least 50 cents', 400, req, requestId)
    }
    
    // Creator ID (required)
    const creatorId = validateId(body.creator_id, 100)
    if (!creatorId) {
      return errorResponse('Invalid creator_id: must be 1-100 alphanumeric characters', 400, req, requestId)
    }
    
    // Currency (optional, default USD)
    const currency = body.currency?.toUpperCase() || 'USD'
    const validCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'NGN']
    if (!validCurrencies.includes(currency)) {
      return errorResponse(`Invalid currency: must be one of ${validCurrencies.join(', ')}`, 400, req, requestId)
    }
    
    // Optional fields
    const productId = body.product_id ? validateId(body.product_id, 100) : null
    const productName = body.product_name ? validateString(body.product_name, 200) : null
    const customerEmail = body.customer_email ? validateEmail(body.customer_email) : null
    const customerId = body.customer_id ? validateId(body.customer_id, 100) : null
    const paymentMethodId = body.payment_method_id ? validateString(body.payment_method_id, 200) : null
    const sourceIdRaw = body.source_id || null
    const merchantIdRaw = body.merchant_id || null
    const sourceId = sourceIdRaw ? validateString(sourceIdRaw, 200) : null
    const merchantId = merchantIdRaw ? validateString(merchantIdRaw, 200) : null

    const requestedProvider =
      body.payment_provider !== undefined
        ? normalizePaymentProviderName(body.payment_provider)
        : null

    if (body.payment_provider !== undefined && !requestedProvider) {
      return errorResponse('Invalid payment_provider: must be card', 400, req, requestId)
    }

    // Validate capture_method if provided
    if (body.capture_method && !['automatic', 'manual'].includes(body.capture_method)) {
      return errorResponse('Invalid capture_method: must be automatic or manual', 400, req, requestId)
    }
    
    // Validate setup_future_usage if provided
    if (body.setup_future_usage && !['off_session', 'on_session'].includes(body.setup_future_usage)) {
      return errorResponse('Invalid setup_future_usage', 400, req, requestId)
    }
    
    // ========================================================================
    // RESOLVE PROVIDER (processor-first)
    // ========================================================================

    const ledgerSettings = (ledger.settings || {}) as Record<string, any>
    const organizationSettings = await getOrganizationSettings(supabase, ledger.organization_id)
    const resolvedProvider = resolveChargeProvider(requestedProvider, ledgerSettings, organizationSettings)

    if (resolvedProvider.error) {
      return errorResponse(resolvedProvider.error, 400, req, requestId)
    }

    let provider!: ReturnType<typeof getPaymentProvider>
    if (resolvedProvider.provider === 'stripe') {
      const stripeKey = await getStripeSecretKey(supabase, ledger.id)
      if (!stripeKey) {
        return errorResponse('Legacy provider is selected but not configured', 500, req, requestId)
      }
      provider = getPaymentProvider('stripe', stripeKey)
    } else {
      provider = getPaymentProvider('card', {
        finix: {
          sourceId: sourceId || organizationSettings?.finix?.source_id || null,
          merchantId: merchantId || organizationSettings?.finix?.merchant_id || null,
        },
      })
    }
    
    // ========================================================================
    // CALCULATE SPLIT (for breakdown in response)
    // ========================================================================
    
    const creatorPercent = await getCreatorSplit(supabase, ledger, creatorId, productId)
    const creatorAmount = Math.floor(amount * (creatorPercent / 100))
    const platformAmount = amount - creatorAmount
    
    // ========================================================================
    // CREATE PAYMENT
    // ========================================================================
    
    // Build description
    const description = productName 
      ? `${productName}` 
      : `Purchase from ${(ledger.settings as any)?.platform_name || ledger.business_name}`
    
    // Build metadata used by provider-side records and downstream webhooks.
    const checkoutMetadata: Record<string, string> = {
      ledger_id: ledger.id,
      creator_id: creatorId,
      soledgic_request_id: requestId,
      checkout_provider: resolvedProvider.provider,
      provider_resolved_from: resolvedProvider.source,
    }
    
    if (productId) checkoutMetadata.product_id = productId
    if (productName) checkoutMetadata.product_name = productName
    if (customerId) checkoutMetadata.customer_id = customerId
    if (sourceId) checkoutMetadata.source_id = sourceId
    if (merchantId) checkoutMetadata.merchant_id = merchantId
    
    // Pass through any additional metadata (sanitized)
    if (body.metadata) {
      for (const [key, value] of Object.entries(body.metadata)) {
        const safeKey = validateId(key, 40)
        const safeValue = typeof value === 'string' ? value.substring(0, 500) : String(value).substring(0, 500)
        if (safeKey && safeValue) {
          checkoutMetadata[safeKey] = safeValue
        }
      }
    }
    
    const checkoutResult = await provider.createPaymentIntent({
      amount,
      currency,
      metadata: checkoutMetadata,
      description,
      receipt_email: customerEmail || undefined,
      capture_method: body.capture_method,
      setup_future_usage: body.setup_future_usage,
      payment_method_id: paymentMethodId || sourceId || organizationSettings?.finix?.source_id || undefined,
      merchant_id: merchantId || organizationSettings?.finix?.merchant_id || undefined,
    })

    if (!checkoutResult.success || !checkoutResult.id) {
      console.error(`[${requestId}] Checkout creation failed:`, {
        provider: resolvedProvider.provider,
        resolvedFrom: resolvedProvider.source,
        error: checkoutResult.error,
      })

      const isProviderConfigError =
        (checkoutResult.error || '').toLowerCase().includes('no payment method') ||
        (checkoutResult.error || '').toLowerCase().includes('no destination') ||
        (checkoutResult.error || '').toLowerCase().includes('configured') ||
        (checkoutResult.error || '').toLowerCase().includes('disabled')

      return errorResponse(
        checkoutResult.error || 'Failed to create payment',
        isProviderConfigError ? 400 : 500,
        req,
        requestId
      )
    }

    const checkoutPayment = {
      id: checkoutResult.id,
      client_secret: checkoutResult.client_secret || null,
      checkout_url: checkoutResult.redirect_url || null,
      status: checkoutResult.status || null,
      requires_action: Boolean(checkoutResult.requires_action),
    }
    
    // ========================================================================
    // AUDIT LOG
    // ========================================================================
    
    createAuditLogAsync(supabase, req, {
      ledger_id: ledger.id,
      action: 'checkout_created',
      entity_type: resolvedProvider.provider === 'stripe' ? 'payment_intent' : 'payment_transfer',
      entity_id: checkoutPayment.id,
      actor_type: 'api',
      request_body: sanitizeForAudit({
        amount,
        currency,
        creator_id: creatorId,
        product_id: productId,
        creator_percent: creatorPercent,
        provider: resolvedProvider.provider,
        provider_source: resolvedProvider.source,
      }),
      response_status: 200,
      risk_score: 10,
    }, requestId)
    
    // ========================================================================
    // RESPONSE
    // ========================================================================
    
    const response: CreateCheckoutResponse = {
      success: true,
      provider: resolvedProvider.provider,
      payment_id: checkoutPayment.id,
      payment_intent_id: checkoutPayment.id,
      client_secret: checkoutPayment.client_secret,
      checkout_url: checkoutPayment.checkout_url,
      status: checkoutPayment.status,
      requires_action: checkoutPayment.requires_action,
      amount: amount,
      currency: currency,
      breakdown: {
        gross_amount: amount / 100,
        creator_amount: creatorAmount / 100,
        platform_amount: platformAmount / 100,
        creator_percent: creatorPercent,
      }
    }
    
    return jsonResponse(response, 200, req, requestId)
  }
)

// Export for Deno
Deno.serve(handler)
