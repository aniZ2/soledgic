// Soledgic Edge Function: Connected Accounts
// Manages Stripe Custom connected accounts for creators/ventures
// This is where you become THE BANK - you control everything
// SECURITY HARDENED VERSION

import { 
  createHandler, 
  jsonResponse, 
  errorResponse,
  validateString,
  validateEmail,
  validateUUID,
  LedgerContext,
  createAuditLogAsync,
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ============================================================================
// TYPES
// ============================================================================

interface ConnectedAccountRequest {
  action: 'create' | 'get' | 'list' | 'update_status' | 'create_onboarding_link' | 'create_login_link'
  
  // For create
  entity_type?: 'creator' | 'venture' | 'merchant'
  entity_id?: string
  email?: string
  display_name?: string
  country?: string  // ISO country code, default 'US'
  
  // For get/update
  connected_account_id?: string
  stripe_account_id?: string
  
  // For list
  entity_type_filter?: string
  status_filter?: string
  limit?: number
  offset?: number
  
  // For onboarding link
  return_url?: string
  refresh_url?: string
}

// ============================================================================
// STRIPE API HELPERS
// ============================================================================

async function stripeRequest(
  stripeKey: string,
  method: 'GET' | 'POST' | 'DELETE',
  endpoint: string,
  params?: Record<string, any>
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const url = `https://api.stripe.com/v1${endpoint}`
    const options: RequestInit = {
      method,
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': '2023-10-16',
      },
    }
    
    if (params && method === 'POST') {
      const body = new URLSearchParams()
      flattenParams(params, body)
      options.body = body.toString()
    }
    
    const response = await fetch(url, options)
    const data = await response.json()
    
    if (data.error) {
      return { success: false, error: data.error.message }
    }
    
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// Flatten nested objects for Stripe's form encoding
function flattenParams(obj: Record<string, any>, params: URLSearchParams, prefix = '') {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}[${key}]` : key
    
    if (value === null || value === undefined) continue
    
    if (typeof value === 'object' && !Array.isArray(value)) {
      flattenParams(value, params, fullKey)
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (typeof item === 'object') {
          flattenParams(item, params, `${fullKey}[${i}]`)
        } else {
          params.append(`${fullKey}[${i}]`, String(item))
        }
      })
    } else {
      params.append(fullKey, String(value))
    }
  }
}

// ============================================================================
// HANDLERS
// ============================================================================

async function createConnectedAccount(
  supabase: SupabaseClient,
  ledger: LedgerContext,
  stripeKey: string,
  params: {
    entity_type: string
    entity_id: string
    email?: string
    display_name?: string
    country?: string
  },
  requestId: string
): Promise<{ success: boolean; account?: any; error?: string }> {
  
  // Check if account already exists
  const { data: existing } = await supabase
    .from('connected_accounts')
    .select('*')
    .eq('ledger_id', ledger.id)
    .eq('entity_type', params.entity_type)
    .eq('entity_id', params.entity_id)
    .single()
  
  if (existing?.stripe_account_id) {
    return { 
      success: true, 
      account: existing 
    }
  }
  
  // Create Stripe Custom account
  // CRITICAL: type = 'custom' and payouts disabled
  const stripeResult = await stripeRequest(stripeKey, 'POST', '/accounts', {
    type: 'custom',
    country: params.country || 'US',
    email: params.email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_type: 'individual',  // or 'company' based on entity_type
    settings: {
      payouts: {
        schedule: {
          interval: 'manual',  // CRITICAL: You control payouts
        },
        debit_negative_balances: false,
      },
    },
    metadata: {
      ledger_id: ledger.id,
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      soledgic_request_id: requestId,
    },
  })
  
  if (!stripeResult.success) {
    return { success: false, error: stripeResult.error }
  }
  
  const stripeAccount = stripeResult.data
  
  // Store in our database
  const { data: account, error: dbError } = await supabase
    .rpc('register_connected_account', {
      p_ledger_id: ledger.id,
      p_entity_type: params.entity_type,
      p_entity_id: params.entity_id,
      p_stripe_account_id: stripeAccount.id,
      p_display_name: params.display_name,
      p_email: params.email,
    })
  
  if (dbError) {
    console.error('Failed to store connected account:', dbError)
    // Don't fail - we created it in Stripe
  }
  
  // Fetch the full record
  const { data: fullAccount } = await supabase
    .from('connected_accounts')
    .select('*')
    .eq('stripe_account_id', stripeAccount.id)
    .single()
  
  return { 
    success: true, 
    account: fullAccount || {
      stripe_account_id: stripeAccount.id,
      entity_type: params.entity_type,
      entity_id: params.entity_id,
    }
  }
}

async function createOnboardingLink(
  stripeKey: string,
  stripeAccountId: string,
  returnUrl: string,
  refreshUrl: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  
  const result = await stripeRequest(stripeKey, 'POST', '/account_links', {
    account: stripeAccountId,
    return_url: returnUrl,
    refresh_url: refreshUrl,
    type: 'account_onboarding',
    collect: 'eventually_due',  // Collect all required info
  })
  
  if (!result.success) {
    return { success: false, error: result.error }
  }
  
  return { success: true, url: result.data.url }
}

async function createLoginLink(
  stripeKey: string,
  stripeAccountId: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  
  const result = await stripeRequest(stripeKey, 'POST', `/accounts/${stripeAccountId}/login_links`, {})
  
  if (!result.success) {
    return { success: false, error: result.error }
  }
  
  return { success: true, url: result.data.url }
}

async function getAccount(
  supabase: SupabaseClient,
  ledger: LedgerContext,
  stripeKey: string,
  identifier: { id?: string; stripe_id?: string; entity_type?: string; entity_id?: string }
): Promise<{ success: boolean; account?: any; error?: string }> {
  
  let query = supabase
    .from('connected_accounts')
    .select('*')
    .eq('ledger_id', ledger.id)
  
  if (identifier.id) {
    query = query.eq('id', identifier.id)
  } else if (identifier.stripe_id) {
    query = query.eq('stripe_account_id', identifier.stripe_id)
  } else if (identifier.entity_type && identifier.entity_id) {
    query = query
      .eq('entity_type', identifier.entity_type)
      .eq('entity_id', identifier.entity_id)
  } else {
    return { success: false, error: 'Must provide id, stripe_id, or entity_type+entity_id' }
  }
  
  const { data: account, error } = await query.single()
  
  if (error || !account) {
    return { success: false, error: 'Account not found' }
  }
  
  // Optionally sync status from Stripe
  if (account.stripe_account_id) {
    const stripeResult = await stripeRequest(stripeKey, 'GET', `/accounts/${account.stripe_account_id}`, {})
    
    if (stripeResult.success) {
      const stripeAccount = stripeResult.data
      
      // Sync status to our DB
      await supabase.rpc('sync_connected_account_status', {
        p_stripe_account_id: account.stripe_account_id,
        p_charges_enabled: stripeAccount.charges_enabled,
        p_payouts_enabled: stripeAccount.payouts_enabled,
        p_details_submitted: stripeAccount.details_submitted,
        p_requirements_current: stripeAccount.requirements?.currently_due || [],
        p_requirements_past_due: stripeAccount.requirements?.past_due || [],
        p_requirements_pending: stripeAccount.requirements?.pending_verification || [],
      })
      
      // Refetch with updated status
      const { data: updatedAccount } = await query.single()
      return { success: true, account: updatedAccount || account }
    }
  }
  
  return { success: true, account }
}

async function listAccounts(
  supabase: SupabaseClient,
  ledger: LedgerContext,
  filters: {
    entity_type?: string
    status?: string
    limit?: number
    offset?: number
  }
): Promise<{ success: boolean; accounts: any[]; total: number }> {
  
  let query = supabase
    .from('connected_accounts')
    .select('*', { count: 'exact' })
    .eq('ledger_id', ledger.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
  
  if (filters.entity_type) {
    query = query.eq('entity_type', filters.entity_type)
  }
  
  if (filters.status) {
    query = query.eq('stripe_status', filters.status)
  }
  
  if (filters.limit) {
    query = query.limit(filters.limit)
  }
  
  if (filters.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 100) - 1)
  }
  
  const { data, error, count } = await query
  
  if (error) {
    return { success: false, accounts: [], total: 0 }
  }
  
  return { 
    success: true, 
    accounts: data || [], 
    total: count || 0 
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

const handler = createHandler(
  { endpoint: 'connected-accounts', requireAuth: true, rateLimit: true },
  async (req: Request, supabase: SupabaseClient, ledger: LedgerContext | null, body: ConnectedAccountRequest, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }
    
    // Get Stripe key
    const { data: stripeKey } = await supabase.rpc('get_stripe_secret_key_from_vault', {
      p_ledger_id: ledger.id
    })
    
    if (!stripeKey) {
      return errorResponse('Legacy provider not configured for this ledger', 400, req, requestId)
    }
    
    const action = body.action || 'list'
    
    switch (action) {
      case 'create': {
        const entityType = validateString(body.entity_type, 50)
        const entityId = validateString(body.entity_id, 100)
        
        if (!entityType || !entityId) {
          return errorResponse('entity_type and entity_id are required', 400, req, requestId)
        }
        
        if (!['creator', 'venture', 'merchant'].includes(entityType)) {
          return errorResponse('entity_type must be creator, venture, or merchant', 400, req, requestId)
        }
        
        const email = body.email ? validateEmail(body.email) : undefined
        const displayName = body.display_name ? validateString(body.display_name, 200) : undefined
        const country = body.country ? validateString(body.country, 2) : 'US'
        
        const result = await createConnectedAccount(supabase, ledger, stripeKey, {
          entity_type: entityType,
          entity_id: entityId,
          email: email || undefined,
          display_name: displayName || undefined,
          country: country || 'US',
        }, requestId)
        
        createAuditLogAsync(supabase, req, {
          ledger_id: ledger.id,
          action: 'connected_account_created',
          entity_type: 'connected_account',
          entity_id: result.account?.stripe_account_id,
          request_body: { entity_type: entityType, entity_id: entityId },
          response_status: result.success ? 200 : 400,
          risk_score: 50,
        }, requestId)
        
        if (!result.success) {
          return errorResponse(result.error || 'Failed to create account', 400, req, requestId)
        }
        
        return jsonResponse({
          success: true,
          account: result.account,
        }, 200, req, requestId)
      }
      
      case 'get': {
        const result = await getAccount(supabase, ledger, stripeKey, {
          id: body.connected_account_id ? validateUUID(body.connected_account_id) : undefined,
          stripe_id: body.stripe_account_id,
          entity_type: body.entity_type,
          entity_id: body.entity_id,
        })
        
        if (!result.success) {
          return errorResponse(result.error || 'Account not found', 404, req, requestId)
        }
        
        return jsonResponse({
          success: true,
          account: result.account,
        }, 200, req, requestId)
      }
      
      case 'list': {
        const result = await listAccounts(supabase, ledger, {
          entity_type: body.entity_type_filter,
          status: body.status_filter,
          limit: body.limit || 100,
          offset: body.offset || 0,
        })
        
        return jsonResponse({
          success: true,
          accounts: result.accounts,
          total: result.total,
        }, 200, req, requestId)
      }
      
      case 'create_onboarding_link': {
        const stripeAccountId = body.stripe_account_id
        if (!stripeAccountId) {
          return errorResponse('stripe_account_id is required', 400, req, requestId)
        }
        
        // Verify account belongs to this ledger
        const { data: account } = await supabase
          .from('connected_accounts')
          .select('id')
          .eq('ledger_id', ledger.id)
          .eq('stripe_account_id', stripeAccountId)
          .single()
        
        if (!account) {
          return errorResponse('Account not found', 404, req, requestId)
        }
        
        const returnUrl = body.return_url || `https://app.soledgic.com/onboarding/complete`
        const refreshUrl = body.refresh_url || `https://app.soledgic.com/onboarding/refresh`
        
        const result = await createOnboardingLink(stripeKey, stripeAccountId, returnUrl, refreshUrl)
        
        if (!result.success) {
          return errorResponse(result.error || 'Failed to create onboarding link', 400, req, requestId)
        }
        
        return jsonResponse({
          success: true,
          onboarding_url: result.url,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),  // ~24 hours
        }, 200, req, requestId)
      }
      
      case 'create_login_link': {
        const stripeAccountId = body.stripe_account_id
        if (!stripeAccountId) {
          return errorResponse('stripe_account_id is required', 400, req, requestId)
        }
        
        // Verify account belongs to this ledger
        const { data: account } = await supabase
          .from('connected_accounts')
          .select('id, stripe_status')
          .eq('ledger_id', ledger.id)
          .eq('stripe_account_id', stripeAccountId)
          .single()
        
        if (!account) {
          return errorResponse('Account not found', 404, req, requestId)
        }
        
        if (account.stripe_status !== 'enabled') {
          return errorResponse('Account must complete onboarding before accessing dashboard', 400, req, requestId)
        }
        
        const result = await createLoginLink(stripeKey, stripeAccountId)
        
        if (!result.success) {
          return errorResponse(result.error || 'Failed to create login link', 400, req, requestId)
        }
        
        return jsonResponse({
          success: true,
          login_url: result.url,
        }, 200, req, requestId)
      }
      
      default:
        return errorResponse(`Unknown action: ${action}`, 400, req, requestId)
    }
  }
)

Deno.serve(handler)
