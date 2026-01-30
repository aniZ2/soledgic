// Soledgic Edge Function: Create Checkout
// POST /create-checkout
// Creates a Stripe PaymentIntent and returns client_secret for frontend checkout
// This is the ENTRY POINT for payment flows - Booklyverse calls this, NOT Stripe directly
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
  product_name?: string       // Human-readable, appears on Stripe receipt
  customer_email?: string     // Pre-fill Stripe checkout
  customer_id?: string        // Your platform's customer ID
  
  // Advanced
  capture_method?: 'automatic' | 'manual'  // Default: automatic
  setup_future_usage?: 'off_session' | 'on_session'  // For saving cards
  
  // Pass-through
  metadata?: Record<string, string>  // Additional metadata (limited to strings by Stripe)
}

interface CreateCheckoutResponse {
  success: boolean
  client_secret: string
  payment_intent_id: string
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

// ============================================================================
// STRIPE API HELPERS
// ============================================================================

async function getStripeSecretKey(
  supabase: SupabaseClient,
  ledger: LedgerContext
): Promise<string | null> {
  // 1. Try to get from Vault (preferred, secure storage)
  try {
    const { data: vaultKey } = await supabase.rpc('get_stripe_secret_key_from_vault', {
      p_ledger_id: ledger.id
    })
    if (vaultKey) return vaultKey
  } catch {
    // Vault function might not exist yet, fall through
  }
  
  // 2. Try ledger settings (legacy, for backwards compatibility)
  const settings = ledger.settings as Record<string, any>
  if (settings?.stripe_secret_key) {
    return settings.stripe_secret_key
  }
  
  // 3. Fall back to environment variable (global key)
  return Deno.env.get('STRIPE_SECRET_KEY') || null
}

async function createStripePaymentIntent(
  stripeKey: string,
  params: {
    amount: number
    currency: string
    metadata: Record<string, string>
    description?: string
    receipt_email?: string
    capture_method?: 'automatic' | 'manual'
    setup_future_usage?: 'off_session' | 'on_session'
  }
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const body = new URLSearchParams()
    body.append('amount', params.amount.toString())
    body.append('currency', params.currency.toLowerCase())
    body.append('automatic_payment_methods[enabled]', 'true')
    
    if (params.capture_method) {
      body.append('capture_method', params.capture_method)
    }
    
    if (params.setup_future_usage) {
      body.append('setup_future_usage', params.setup_future_usage)
    }
    
    if (params.description) {
      body.append('description', params.description)
    }
    
    if (params.receipt_email) {
      body.append('receipt_email', params.receipt_email)
    }
    
    // Add metadata
    for (const [key, value] of Object.entries(params.metadata)) {
      if (value !== undefined && value !== null) {
        body.append(`metadata[${key}]`, String(value))
      }
    }
    
    const response = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': '2023-10-16',
      },
      body: body.toString(),
    })
    
    const data = await response.json()
    
    if (data.error) {
      return { 
        success: false, 
        error: data.error.message || 'Stripe API error' 
      }
    }
    
    return { success: true, data }
  } catch (err: any) {
    return { 
      success: false, 
      error: `Stripe request failed: ${err.message}` 
    }
  }
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
    
    // Stripe minimum is 50 cents for most currencies
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
    
    // Validate capture_method if provided
    if (body.capture_method && !['automatic', 'manual'].includes(body.capture_method)) {
      return errorResponse('Invalid capture_method: must be automatic or manual', 400, req, requestId)
    }
    
    // Validate setup_future_usage if provided
    if (body.setup_future_usage && !['off_session', 'on_session'].includes(body.setup_future_usage)) {
      return errorResponse('Invalid setup_future_usage', 400, req, requestId)
    }
    
    // ========================================================================
    // GET STRIPE KEY
    // ========================================================================
    
    const stripeKey = await getStripeSecretKey(supabase, ledger)
    if (!stripeKey) {
      return errorResponse('Stripe not configured for this ledger', 500, req, requestId)
    }
    
    // ========================================================================
    // CALCULATE SPLIT (for breakdown in response)
    // ========================================================================
    
    const creatorPercent = await getCreatorSplit(supabase, ledger, creatorId, productId)
    const creatorAmount = Math.floor(amount * (creatorPercent / 100))
    const platformAmount = amount - creatorAmount
    
    // ========================================================================
    // CREATE STRIPE PAYMENT INTENT
    // ========================================================================
    
    // Build description
    const description = productName 
      ? `${productName}` 
      : `Purchase from ${(ledger.settings as any)?.platform_name || ledger.business_name}`
    
    // Build metadata - this is CRITICAL for webhook processing
    // The stripe-webhook handler uses these to route the payment
    const stripeMetadata: Record<string, string> = {
      ledger_id: ledger.id,
      creator_id: creatorId,
      soledgic_request_id: requestId,
    }
    
    if (productId) stripeMetadata.product_id = productId
    if (productName) stripeMetadata.product_name = productName
    if (customerId) stripeMetadata.customer_id = customerId
    
    // Pass through any additional metadata (sanitized)
    if (body.metadata) {
      for (const [key, value] of Object.entries(body.metadata)) {
        // Stripe metadata keys must be <= 40 chars, values <= 500 chars
        const safeKey = validateId(key, 40)
        const safeValue = typeof value === 'string' ? value.substring(0, 500) : String(value).substring(0, 500)
        if (safeKey && safeValue) {
          stripeMetadata[safeKey] = safeValue
        }
      }
    }
    
    const stripeResult = await createStripePaymentIntent(stripeKey, {
      amount,
      currency,
      metadata: stripeMetadata,
      description,
      receipt_email: customerEmail || undefined,
      capture_method: body.capture_method,
      setup_future_usage: body.setup_future_usage,
    })
    
    if (!stripeResult.success || !stripeResult.data) {
      console.error(`[${requestId}] Stripe PaymentIntent creation failed:`, stripeResult.error)
      return errorResponse('Failed to create payment', 500, req, requestId)
    }
    
    const paymentIntent = stripeResult.data
    
    // ========================================================================
    // AUDIT LOG
    // ========================================================================
    
    createAuditLogAsync(supabase, req, {
      ledger_id: ledger.id,
      action: 'checkout_created',
      entity_type: 'payment_intent',
      entity_id: paymentIntent.id,
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
    
    // ========================================================================
    // RESPONSE
    // ========================================================================
    
    const response: CreateCheckoutResponse = {
      success: true,
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
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
