// Soledgic Edge Function: Stripe Reconciliation
// POST /stripe-reconciliation
// Cron job: sync balance transactions, auto-match, drift check
// Auth: CRON_SECRET header or API key

import {
  createHandler,
  jsonResponse,
  errorResponse,
  getSupabaseClient,
  getCorsHeaders,
  getClientIp,
  LedgerContext,
  timingSafeEqual,
} from '../_shared/utils.ts'
import { getStripeSecretKey } from '../_shared/payment-provider.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ============================================================================
// TYPES
// ============================================================================

interface ReconciliationRequest {
  action: 'sync_balance_transactions' | 'auto_match' | 'check_drift' | 'run_daily'
  ledger_id?: string
  since?: string        // ISO date for sync window start
  limit?: number        // Max transactions to sync per page
}

// ============================================================================
// STRIPE HELPERS
// ============================================================================

async function stripeGet(
  apiKey: string,
  path: string,
  params?: Record<string, string>
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const url = new URL(`https://api.stripe.com${path}`)
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value)
      }
    }

    const response = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })
    const data = await response.json()

    if (data.error) {
      return { success: false, error: data.error.message || 'Stripe API error' }
    }
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: `Stripe request failed: ${err.message}` }
  }
}

// ============================================================================
// ACTION: sync_balance_transactions
// ============================================================================

async function syncBalanceTransactions(
  supabase: SupabaseClient,
  ledgerId: string,
  stripeKey: string,
  since?: string
): Promise<{ synced: number; errors: number }> {
  // Default: last 24 hours
  const sinceTimestamp = since
    ? Math.floor(new Date(since).getTime() / 1000)
    : Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000)

  let synced = 0
  let errors = 0
  let hasMore = true
  let startingAfter: string | undefined

  while (hasMore) {
    const params: Record<string, string> = {
      'created[gte]': sinceTimestamp.toString(),
      'limit': '100',
    }
    if (startingAfter) {
      params['starting_after'] = startingAfter
    }

    const result = await stripeGet(stripeKey, '/v1/balance_transactions', params)

    if (!result.success || !result.data) {
      console.error(`Stripe balance_transactions fetch failed:`, result.error)
      errors++
      break
    }

    const transactions = result.data.data || []
    hasMore = result.data.has_more === true

    for (const bt of transactions) {
      startingAfter = bt.id

      // Upsert into stripe_transactions, preserving existing match_status
      const { error: upsertError } = await supabase
        .from('stripe_transactions')
        .upsert(
          {
            ledger_id: ledgerId,
            stripe_id: bt.id,
            stripe_type: bt.type,
            amount: bt.amount / 100,
            fee: (bt.fee || 0) / 100,
            net: (bt.net || 0) / 100,
            currency: (bt.currency || 'usd').toUpperCase(),
            status: bt.status || 'available',
            description: bt.description?.substring(0, 500) || bt.type,
            raw_data: bt,
          },
          {
            onConflict: 'ledger_id,stripe_id,stripe_type',
            ignoreDuplicates: false,
          }
        )

      if (upsertError) {
        console.error(`Upsert failed for ${bt.id}:`, upsertError.message)
        errors++
      } else {
        synced++
      }
    }
  }

  return { synced, errors }
}

// ============================================================================
// ACTION: auto_match
// ============================================================================

async function autoMatch(
  supabase: SupabaseClient,
  ledgerId: string
): Promise<{ matched: number; strategies: Record<string, number> }> {
  let matched = 0
  const strategies: Record<string, number> = {
    exact_id: 0,
    reference_id: 0,
    amount_date: 0,
  }

  // Get unmatched stripe_transactions for this ledger
  const { data: unmatched, error } = await supabase
    .from('stripe_transactions')
    .select('id, stripe_id, stripe_type, amount, created_at, raw_data')
    .eq('ledger_id', ledgerId)
    .eq('match_status', 'unmatched')
    .limit(500)

  if (error || !unmatched) {
    console.error('Failed to fetch unmatched transactions:', error?.message)
    return { matched, strategies }
  }

  for (const st of unmatched) {
    // Strategy 1: Exact ID match via metadata (confidence 1.0)
    // Check if any ledger transaction has this stripe_id in metadata
    const { data: exactMatch } = await supabase
      .from('transactions')
      .select('id')
      .eq('ledger_id', ledgerId)
      .or(
        `metadata->stripe_charge_id.eq.${st.stripe_id},` +
        `metadata->stripe_payment_intent_id.eq.${st.stripe_id},` +
        `metadata->stripe_payout_id.eq.${st.stripe_id},` +
        `metadata->stripe_dispute_id.eq.${st.stripe_id}`
      )
      .limit(1)
      .single()

    if (exactMatch) {
      await supabase
        .from('stripe_transactions')
        .update({
          transaction_id: exactMatch.id,
          match_status: 'auto_matched',
          match_confidence: 1.0,
        })
        .eq('id', st.id)
      matched++
      strategies.exact_id++
      continue
    }

    // Strategy 2: reference_id correlation (confidence 0.9)
    const refPatterns = [
      `stripe_${st.stripe_id}`,
      `stripe_pi_${st.stripe_id}`,
      `stripe_payout_${st.stripe_id}`,
      `stripe_dispute_${st.stripe_id}`,
      `stripe_refund_${st.stripe_id}`,
    ]

    const { data: refMatch } = await supabase
      .from('transactions')
      .select('id')
      .eq('ledger_id', ledgerId)
      .in('reference_id', refPatterns)
      .limit(1)
      .single()

    if (refMatch) {
      await supabase
        .from('stripe_transactions')
        .update({
          transaction_id: refMatch.id,
          match_status: 'auto_matched',
          match_confidence: 0.9,
        })
        .eq('id', st.id)
      matched++
      strategies.reference_id++
      continue
    }

    // Strategy 3: Amount + date ±1 day (confidence 0.7)
    const stAmount = Math.abs(Number(st.amount))
    if (stAmount > 0) {
      const stDate = new Date(st.created_at)
      const dayBefore = new Date(stDate.getTime() - 24 * 60 * 60 * 1000).toISOString()
      const dayAfter = new Date(stDate.getTime() + 24 * 60 * 60 * 1000).toISOString()

      const { data: amountMatch } = await supabase
        .from('transactions')
        .select('id')
        .eq('ledger_id', ledgerId)
        .eq('amount', stAmount)
        .gte('created_at', dayBefore)
        .lte('created_at', dayAfter)
        .is('reversed_by', null)
        .limit(1)
        .single()

      if (amountMatch) {
        // Verify this transaction isn't already matched to another stripe_transaction
        const { data: alreadyMatched } = await supabase
          .from('stripe_transactions')
          .select('id')
          .eq('transaction_id', amountMatch.id)
          .neq('id', st.id)
          .limit(1)
          .single()

        if (!alreadyMatched) {
          await supabase
            .from('stripe_transactions')
            .update({
              transaction_id: amountMatch.id,
              match_status: 'auto_matched',
              match_confidence: 0.7,
            })
            .eq('id', st.id)
          matched++
          strategies.amount_date++
        }
      }
    }
  }

  return { matched, strategies }
}

// ============================================================================
// ACTION: check_drift
// ============================================================================

async function checkDrift(
  supabase: SupabaseClient,
  ledgerId: string,
  stripeKey: string,
  runId: string
): Promise<{ drift_amount: number; drift_percent: number; severity: string }> {
  // Get Stripe balance
  const balanceResult = await stripeGet(stripeKey, '/v1/balance')
  if (!balanceResult.success || !balanceResult.data) {
    throw new Error(`Failed to fetch Stripe balance: ${balanceResult.error}`)
  }

  // Sum available balance across currencies (convert to dollars)
  const available = balanceResult.data.available || []
  const stripeBalance = available.reduce(
    (sum: number, b: any) => sum + (b.amount || 0) / 100,
    0
  )

  // Get internal cash account balance
  const { data: cashAccount } = await supabase
    .from('accounts')
    .select('id')
    .eq('ledger_id', ledgerId)
    .eq('account_type', 'cash')
    .single()

  let internalBalance = 0
  if (cashAccount) {
    // Sum debits - credits for cash account (cash is a debit-normal account)
    const { data: balanceData } = await supabase.rpc('get_account_balance', {
      p_account_id: cashAccount.id,
    })
    internalBalance = Number(balanceData) || 0
  }

  const driftAmount = Math.abs(stripeBalance - internalBalance)
  const driftPercent = internalBalance !== 0
    ? (driftAmount / Math.abs(internalBalance)) * 100
    : (stripeBalance !== 0 ? 100 : 0)

  // Determine severity
  let severity = 'info'
  if (driftPercent > 5 || driftAmount > 100) {
    severity = 'critical'
  } else if (driftPercent > 1 || driftAmount > 1) {
    severity = 'warning'
  }

  // Create drift alert if there's meaningful drift
  if (driftAmount > 1 || driftPercent > 1) {
    await supabase.from('drift_alerts').insert({
      ledger_id: ledgerId,
      run_id: runId,
      expected_balance: internalBalance,
      actual_balance: stripeBalance,
      drift_amount: driftAmount,
      drift_percent: driftPercent,
      severity,
    })
  }

  return { drift_amount: driftAmount, drift_percent: driftPercent, severity }
}

// ============================================================================
// ACTION: run_daily
// ============================================================================

async function runDaily(
  supabase: SupabaseClient
): Promise<{ ledgers_processed: number; results: Record<string, any>[] }> {
  // Find all active ledgers with Stripe configured
  const { data: ledgers, error } = await supabase
    .from('ledgers')
    .select('id, settings')
    .eq('status', 'active')

  if (error || !ledgers) {
    throw new Error(`Failed to fetch ledgers: ${error?.message}`)
  }

  const results: Record<string, any>[] = []
  let processed = 0

  for (const ledger of ledgers) {
    const stripeKey = await getStripeSecretKey(supabase, ledger.id)
    if (!stripeKey) continue

    processed++
    const ledgerResult: Record<string, any> = { ledger_id: ledger.id }

    // Create a run record
    const { data: run } = await supabase
      .from('reconciliation_runs')
      .insert({
        ledger_id: ledger.id,
        run_type: 'daily',
        status: 'running',
      })
      .select('id')
      .single()

    const runId = run?.id

    try {
      // 1. Sync
      const syncResult = await syncBalanceTransactions(supabase, ledger.id, stripeKey)
      ledgerResult.sync = syncResult

      // 2. Auto-match
      const matchResult = await autoMatch(supabase, ledger.id)
      ledgerResult.match = matchResult

      // 3. Check drift
      const driftResult = await checkDrift(supabase, ledger.id, stripeKey, runId)
      ledgerResult.drift = driftResult

      // Update run record
      if (runId) {
        await supabase
          .from('reconciliation_runs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            stats: { sync: syncResult, match: matchResult, drift: driftResult },
            drift_amount: driftResult.drift_amount,
            drift_percent: driftResult.drift_percent,
          })
          .eq('id', runId)
      }
    } catch (err: any) {
      ledgerResult.error = err.message
      if (runId) {
        await supabase
          .from('reconciliation_runs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: err.message?.substring(0, 500),
          })
          .eq('id', runId)
      }
    }

    results.push(ledgerResult)
  }

  return { ledgers_processed: processed, results }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    })
  }

  if (Deno.env.get('ENABLE_STRIPE_LEGACY') !== 'true') {
    return new Response(JSON.stringify({ error: 'Stripe legacy endpoints are disabled' }), {
      status: 410,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    })
  }

  const supabase = getSupabaseClient()

  try {
    // Auth: CRON_SECRET or API key
    const cronSecret = req.headers.get('x-cron-secret')
    const apiKey = req.headers.get('x-api-key')
    const expectedCronSecret = Deno.env.get('CRON_SECRET')

    let authedLedgerId: string | null = null
    let isCronAuth = false

    if (cronSecret && expectedCronSecret && timingSafeEqual(cronSecret, expectedCronSecret)) {
      isCronAuth = true
    } else if (apiKey) {
      // Validate API key and get ledger
      const { hashApiKey, validateApiKey } = await import('../_shared/utils.ts')
      const ledger = await validateApiKey(supabase, apiKey)
      if (!ledger) {
        return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
          status: 401,
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        })
      }
      authedLedgerId = ledger.id
    } else {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    const body: ReconciliationRequest = await req.json()

    // run_daily requires CRON_SECRET (it operates across all ledgers)
    if (body.action === 'run_daily' && !isCronAuth) {
      return new Response(JSON.stringify({ error: 'run_daily requires CRON_SECRET auth' }), {
        status: 403,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    // For non-daily actions, determine the target ledger
    const targetLedgerId = body.ledger_id || authedLedgerId
    if (body.action !== 'run_daily' && !targetLedgerId) {
      return new Response(JSON.stringify({ error: 'ledger_id is required' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    // If API key auth, ensure they can only access their own ledger
    if (authedLedgerId && targetLedgerId && targetLedgerId !== authedLedgerId) {
      return new Response(JSON.stringify({ error: 'Access denied to this ledger' }), {
        status: 403,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    let result: any

    switch (body.action) {
      case 'sync_balance_transactions': {
        const stripeKey = await getStripeSecretKey(supabase, targetLedgerId!)
        if (!stripeKey) {
          return new Response(JSON.stringify({ error: 'Stripe not configured' }), {
            status: 400,
            headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
          })
        }

        const { data: run } = await supabase
          .from('reconciliation_runs')
          .insert({ ledger_id: targetLedgerId, run_type: 'sync', status: 'running' })
          .select('id')
          .single()

        const syncResult = await syncBalanceTransactions(
          supabase, targetLedgerId!, stripeKey, body.since
        )

        if (run) {
          await supabase
            .from('reconciliation_runs')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              stats: syncResult,
            })
            .eq('id', run.id)
        }

        result = { action: 'sync_balance_transactions', ...syncResult }
        break
      }

      case 'auto_match': {
        const { data: run } = await supabase
          .from('reconciliation_runs')
          .insert({ ledger_id: targetLedgerId, run_type: 'auto_match', status: 'running' })
          .select('id')
          .single()

        const matchResult = await autoMatch(supabase, targetLedgerId!)

        if (run) {
          await supabase
            .from('reconciliation_runs')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              stats: matchResult,
            })
            .eq('id', run.id)
        }

        result = { action: 'auto_match', ...matchResult }
        break
      }

      case 'check_drift': {
        const stripeKey = await getStripeSecretKey(supabase, targetLedgerId!)
        if (!stripeKey) {
          return new Response(JSON.stringify({ error: 'Stripe not configured' }), {
            status: 400,
            headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
          })
        }

        const { data: run } = await supabase
          .from('reconciliation_runs')
          .insert({ ledger_id: targetLedgerId, run_type: 'check_drift', status: 'running' })
          .select('id')
          .single()

        try {
          const driftResult = await checkDrift(
            supabase, targetLedgerId!, stripeKey, run?.id
          )

          if (run) {
            await supabase
              .from('reconciliation_runs')
              .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                stats: driftResult,
                drift_amount: driftResult.drift_amount,
                drift_percent: driftResult.drift_percent,
              })
              .eq('id', run.id)
          }

          result = { action: 'check_drift', ...driftResult }
        } catch (err: any) {
          if (run) {
            await supabase
              .from('reconciliation_runs')
              .update({
                status: 'failed',
                completed_at: new Date().toISOString(),
                error_message: err.message?.substring(0, 500),
              })
              .eq('id', run.id)
          }
          throw err
        }
        break
      }

      case 'run_daily': {
        result = await runDaily(supabase)
        break
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action. Must be: sync_balance_transactions, auto_match, check_drift, or run_daily' }),
          { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
        )
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      status: 200,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('Reconciliation error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    })
  }
})
