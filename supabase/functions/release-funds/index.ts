// Soledgic Edge Function: Release Funds
// POST /release-funds
// The BANKER'S control panel - release escrow funds to connected accounts
// This is where YOU decide when money moves
// SECURITY HARDENED VERSION

import { 
  createHandler, 
  jsonResponse, 
  errorResponse,
  validateUUID,
  LedgerContext,
  createAuditLogAsync,
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ============================================================================
// TYPES
// ============================================================================

interface ReleaseFundsRequest {
  action: 'release' | 'batch_release' | 'void' | 'get_held' | 'get_summary' | 'auto_release'
  
  // For single release
  entry_id?: string
  
  // For batch release
  entry_ids?: string[]
  
  // For void
  void_reason?: string
  
  // Filters for get_held
  venture_id?: string
  creator_id?: string
  ready_only?: boolean  // Only entries past hold_until
  
  // Pagination
  limit?: number
  offset?: number
}

// ============================================================================
// STRIPE TRANSFER
// ============================================================================

async function createStripeTransfer(
  stripeKey: string,
  params: {
    amount: number  // In cents
    currency: string
    destination: string  // Connected account ID (acct_xxx)
    transfer_group?: string
    description?: string
    metadata?: Record<string, string>
  }
): Promise<{ success: boolean; transfer_id?: string; error?: string; error_code?: string }> {
  try {
    const body = new URLSearchParams()
    body.append('amount', params.amount.toString())
    body.append('currency', params.currency.toLowerCase())
    body.append('destination', params.destination)
    
    if (params.transfer_group) {
      body.append('transfer_group', params.transfer_group)
    }
    
    if (params.description) {
      body.append('description', params.description)
    }
    
    if (params.metadata) {
      for (const [key, value] of Object.entries(params.metadata)) {
        body.append(`metadata[${key}]`, value)
      }
    }
    
    const response = await fetch('https://api.stripe.com/v1/transfers', {
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
        error: data.error.message,
        error_code: data.error.code
      }
    }
    
    return { success: true, transfer_id: data.id }
  } catch (err: any) {
    return { success: false, error: `Processor request failed: ${err.message}` }
  }
}

// ============================================================================
// RELEASE HANDLER
// ============================================================================

async function handleRelease(
  supabase: SupabaseClient,
  ledger: LedgerContext,
  stripeKey: string,
  entryId: string,
  adminId: string | null,
  requestId: string
): Promise<{ success: boolean; transfer_id?: string; error?: string }> {
  
  // 1. Request release (creates escrow_releases record, marks entry as pending_release)
  const { data: releaseId, error: queueError } = await supabase.rpc('request_fund_release', {
    p_entry_id: entryId,
    p_requested_by: adminId,
    p_release_type: 'manual'
  })
  
  if (queueError) {
    return { success: false, error: queueError.message }
  }
  
  // 2. Get release details
  const { data: release, error: fetchError } = await supabase
    .from('escrow_releases')
    .select(`
      *,
      connected_account:connected_accounts(*)
    `)
    .eq('id', releaseId)
    .single()
  
  if (fetchError || !release) {
    return { success: false, error: 'Failed to fetch release details' }
  }
  
  // 3. Validate recipient has a verified connected account
  if (!release.recipient_stripe_account) {
    await supabase.rpc('fail_fund_release', {
      p_release_id: releaseId,
      p_error_code: 'no_connected_account',
      p_error_message: 'Recipient has no connected account'
    })
    return { success: false, error: 'Recipient has no connected account' }
  }
  
  if (release.connected_account && !release.connected_account.can_receive_transfers) {
    await supabase.rpc('fail_fund_release', {
      p_release_id: releaseId,
      p_error_code: 'account_not_verified',
      p_error_message: 'Recipient account is not fully verified'
    })
    return { success: false, error: 'Recipient account must complete verification' }
  }
  
  // 4. Mark as processing
  await supabase
    .from('escrow_releases')
    .update({ status: 'processing' })
    .eq('id', releaseId)
  
  // 5. Execute Stripe Transfer
  const amountCents = Math.round(release.amount * 100)
  
  const transferResult = await createStripeTransfer(stripeKey, {
    amount: amountCents,
    currency: release.currency || 'USD',
    destination: release.recipient_stripe_account,
    transfer_group: `txn_${release.transaction_id}`,
    description: `Release for ${release.recipient_entity_type}:${release.recipient_entity_id}`,
    metadata: {
      ledger_id: ledger.id,
      entry_id: entryId,
      release_id: releaseId,
      request_id: requestId,
    }
  })
  
  if (!transferResult.success) {
    await supabase.rpc('fail_fund_release', {
      p_release_id: releaseId,
      p_error_code: transferResult.error_code || 'transfer_failed',
      p_error_message: transferResult.error || 'Unknown error'
    })
    return { success: false, error: transferResult.error }
  }
  
  // 6. Complete release
  await supabase.rpc('complete_fund_release', {
    p_release_id: releaseId,
    p_stripe_transfer_id: transferResult.transfer_id,
    p_approved_by: adminId
  })
  
  return { success: true, transfer_id: transferResult.transfer_id }
}

// ============================================================================
// BATCH RELEASE
// ============================================================================

async function handleBatchRelease(
  supabase: SupabaseClient,
  ledger: LedgerContext,
  stripeKey: string,
  entryIds: string[],
  adminId: string | null,
  requestId: string
): Promise<{ 
  success: boolean
  results: Array<{ entry_id: string; success: boolean; transfer_id?: string; error?: string }>
  total: number
  succeeded: number
  failed: number
}> {
  const results: Array<{ entry_id: string; success: boolean; transfer_id?: string; error?: string }> = []
  
  // Process sequentially to avoid rate limits
  for (const entryId of entryIds) {
    const result = await handleRelease(supabase, ledger, stripeKey, entryId, adminId, requestId)
    results.push({
      entry_id: entryId,
      ...result
    })
    
    // Small delay between transfers to be safe
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  const succeeded = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length
  
  return {
    success: failed === 0,
    results,
    total: entryIds.length,
    succeeded,
    failed
  }
}

// ============================================================================
// VOID HANDLER
// ============================================================================

async function handleVoid(
  supabase: SupabaseClient,
  ledger: LedgerContext,
  entryId: string,
  reason: string,
  adminId: string | null
): Promise<{ success: boolean; error?: string }> {
  
  // Verify entry exists, is held, and belongs to this ledger
  const { data: entry, error: fetchError } = await supabase
    .from('entries')
    .select(`
      id,
      release_status,
      account:accounts!inner(ledger_id)
    `)
    .eq('id', entryId)
    .single()
  
  if (fetchError || !entry) {
    return { success: false, error: 'Entry not found' }
  }
  
  if (entry.account.ledger_id !== ledger.id) {
    return { success: false, error: 'Entry does not belong to this ledger' }
  }
  
  if (entry.release_status !== 'held') {
    return { success: false, error: `Entry is not held (current status: ${entry.release_status})` }
  }
  
  // Void the entry
  const { error: updateError } = await supabase
    .from('entries')
    .update({
      release_status: 'voided',
      released_at: new Date().toISOString(),
      released_by: adminId,
      hold_reason: `VOIDED: ${reason}`
    })
    .eq('id', entryId)
  
  if (updateError) {
    return { success: false, error: 'Failed to void entry' }
  }
  
  return { success: true }
}

// ============================================================================
// AUTO-RELEASE HANDLER
// ============================================================================

async function handleAutoRelease(
  supabase: SupabaseClient,
  ledger: LedgerContext,
  stripeKey: string,
  requestId: string
): Promise<{ queued: number; released: number; failed: number; errors: string[] }> {
  
  // Queue all entries past their hold_until
  const { data: queuedCount } = await supabase.rpc('queue_auto_releases', {
    p_ledger_id: ledger.id
  })
  
  // Get all pending releases
  const { data: pendingReleases } = await supabase
    .from('escrow_releases')
    .select('id, entry_id')
    .eq('ledger_id', ledger.id)
    .eq('status', 'pending')
    .eq('release_type', 'auto')
    .limit(100)  // Process in batches
  
  let released = 0
  let failed = 0
  const errors: string[] = []
  
  for (const release of pendingReleases || []) {
    const result = await handleRelease(supabase, ledger, stripeKey, release.entry_id, null, requestId)
    
    if (result.success) {
      released++
    } else {
      failed++
      errors.push(`Entry ${release.entry_id}: ${result.error}`)
    }
    
    // Rate limit protection
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  return {
    queued: queuedCount || 0,
    released,
    failed,
    errors: errors.slice(0, 10)  // Limit error list
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

const handler = createHandler(
  { endpoint: 'release-funds', requireAuth: true, rateLimit: true },
  async (req: Request, supabase: SupabaseClient, ledger: LedgerContext | null, body: ReleaseFundsRequest, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }
    
    // Get Stripe key
    const { data: stripeKey } = await supabase.rpc('get_stripe_secret_key_from_vault', {
      p_ledger_id: ledger.id
    })
    
    const action = body.action || 'get_held'
    const adminId = req.headers.get('x-admin-id') || null
    
    switch (action) {
      case 'release': {
        if (!stripeKey) {
          return errorResponse('Legacy provider not configured', 400, req, requestId)
        }
        
        const entryId = body.entry_id ? validateUUID(body.entry_id) : null
        if (!entryId) {
          return errorResponse('Invalid entry_id', 400, req, requestId)
        }
        
        const result = await handleRelease(supabase, ledger, stripeKey, entryId, adminId, requestId)
        
        createAuditLogAsync(supabase, req, {
          ledger_id: ledger.id,
          action: 'funds_released',
          entity_type: 'entry',
          entity_id: entryId,
          actor_type: 'api',
          actor_id: adminId || undefined,
          request_body: { entry_id: entryId, success: result.success },
          response_status: result.success ? 200 : 400,
          risk_score: 70,  // Financial operation
        }, requestId)
        
        if (!result.success) {
          return errorResponse(result.error || 'Release failed', 400, req, requestId)
        }
        
        return jsonResponse({
          success: true,
          entry_id: entryId,
          transfer_id: result.transfer_id,
        }, 200, req, requestId)
      }
      
      case 'batch_release': {
        if (!stripeKey) {
          return errorResponse('Legacy provider not configured', 400, req, requestId)
        }
        
        const entryIds = body.entry_ids?.map(id => validateUUID(id)).filter(Boolean) as string[]
        if (!entryIds || entryIds.length === 0) {
          return errorResponse('Invalid or empty entry_ids', 400, req, requestId)
        }
        
        if (entryIds.length > 50) {
          return errorResponse('Maximum 50 entries per batch', 400, req, requestId)
        }
        
        const result = await handleBatchRelease(supabase, ledger, stripeKey, entryIds, adminId, requestId)
        
        createAuditLogAsync(supabase, req, {
          ledger_id: ledger.id,
          action: 'funds_batch_released',
          entity_type: 'entries',
          actor_type: 'api',
          actor_id: adminId || undefined,
          request_body: { count: entryIds.length, succeeded: result.succeeded, failed: result.failed },
          response_status: result.success ? 200 : 207,
          risk_score: 80,
        }, requestId)
        
        return jsonResponse(result, result.success ? 200 : 207, req, requestId)
      }
      
      case 'void': {
        const entryId = body.entry_id ? validateUUID(body.entry_id) : null
        if (!entryId) {
          return errorResponse('Invalid entry_id', 400, req, requestId)
        }
        
        const reason = body.void_reason || 'Manual void'
        const result = await handleVoid(supabase, ledger, entryId, reason, adminId)
        
        createAuditLogAsync(supabase, req, {
          ledger_id: ledger.id,
          action: 'funds_voided',
          entity_type: 'entry',
          entity_id: entryId,
          actor_type: 'api',
          actor_id: adminId || undefined,
          request_body: { entry_id: entryId, reason },
          response_status: result.success ? 200 : 400,
          risk_score: 80,
        }, requestId)
        
        if (!result.success) {
          return errorResponse(result.error || 'Void failed', 400, req, requestId)
        }
        
        return jsonResponse({ success: true, entry_id: entryId }, 200, req, requestId)
      }
      
      case 'auto_release': {
        if (!stripeKey) {
          return errorResponse('Legacy provider not configured', 400, req, requestId)
        }
        
        const result = await handleAutoRelease(supabase, ledger, stripeKey, requestId)
        
        createAuditLogAsync(supabase, req, {
          ledger_id: ledger.id,
          action: 'auto_release_triggered',
          entity_type: 'ledger',
          actor_type: 'api',
          request_body: result,
          response_status: 200,
          risk_score: 60,
        }, requestId)
        
        return jsonResponse({ success: true, ...result }, 200, req, requestId)
      }
      
      case 'get_held': {
        const { data: held } = await supabase.rpc('get_held_funds_dashboard', {
          p_ledger_id: ledger.id,
          p_venture_id: body.venture_id || null,
          p_ready_only: body.ready_only || false,
          p_limit: body.limit || 100
        })
        
        return jsonResponse({
          success: true,
          held_funds: held || [],
          count: held?.length || 0,
        }, 200, req, requestId)
      }
      
      case 'get_summary': {
        const { data: summary } = await supabase.rpc('get_escrow_summary', {
          p_ledger_id: ledger.id
        })
        
        const totals = (summary || []).reduce((acc: any, row: any) => ({
          total_held: (acc.total_held || 0) + Number(row.total_held || 0),
          total_ready: (acc.total_ready || 0) + Number(row.total_ready || 0),
          total_entries: (acc.total_entries || 0) + Number(row.entry_count || 0),
        }), {})
        
        return jsonResponse({
          success: true,
          by_venture: summary || [],
          totals,
        }, 200, req, requestId)
      }
      
      default:
        return errorResponse(`Unknown action: ${action}`, 400, req, requestId)
    }
  }
)

Deno.serve(handler)
