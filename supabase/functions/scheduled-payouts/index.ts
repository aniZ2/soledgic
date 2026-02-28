// Soledgic Edge Function: Scheduled Payouts
// Runs on a cron schedule to automatically process payouts
// based on organization payout settings

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, timingSafeEqual } from '../_shared/utils.ts'

interface PayoutSettings {
  schedule: 'manual' | 'weekly' | 'biweekly' | 'monthly'
  day_of_week?: number  // 0-6 for weekly
  day_of_month?: number // 1-28 for monthly
  minimum_amount: number // cents
}

function parseBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null
  const trimmed = authHeader.trim()
  if (!trimmed.toLowerCase().startsWith('bearer ')) return null
  const token = trimmed.slice('bearer '.length).trim()
  return token.length > 0 ? token : null
}

function isAuthorizedCronRequest(req: Request, serviceRoleKey: string, cronSecret: string | null): boolean {
  const bearer = parseBearerToken(req.headers.get('authorization'))
  if (bearer && timingSafeEqual(bearer, serviceRoleKey)) {
    return true
  }

  const providedCronSecret = (req.headers.get('x-cron-secret') || '').trim()
  if (cronSecret && providedCronSecret && timingSafeEqual(providedCronSecret, cronSecret)) {
    return true
  }

  return false
}

function normalizeCents(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  return Math.floor(numeric)
}

function toCents(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.round(numeric * 100))
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req)

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  try {
    // Initialize admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase environment is not configured')
    }

    if (!isAuthorizedCronRequest(req, supabaseKey, Deno.env.get('CRON_SECRET'))) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const internalToken =
      Deno.env.get('SOLEDGIC_INTERNAL_FUNCTION_TOKEN') ||
      Deno.env.get('INTERNAL_FUNCTION_TOKEN')
    const supabase = createClient(supabaseUrl, supabaseKey)

    if (!internalToken) {
      throw new Error('SOLEDGIC_INTERNAL_FUNCTION_TOKEN is not configured')
    }

    const now = new Date()
    const dayOfWeek = now.getDay()
    const dayOfMonth = now.getDate()

    console.log(`Running scheduled payouts check at ${now.toISOString()}`)
    console.log(`Day of week: ${dayOfWeek}, Day of month: ${dayOfMonth}`)

    // Get all ledgers with auto-payout enabled
    const { data: ledgers, error: ledgersError } = await supabase
      .from('ledgers')
      .select(`
        id,
        business_name,
        organization_id,
        metadata
      `)
      .eq('status', 'active')
      .eq('livemode', true)

    if (ledgersError) {
      throw ledgersError
    }

    let processedCount = 0
    let errorCount = 0
    const results: any[] = []

    for (const ledger of ledgers || []) {
      const settings: PayoutSettings = ledger.metadata?.payout_settings || { schedule: 'manual', minimum_amount: 0 }
      const ledgerMinimumCents = normalizeCents(settings.minimum_amount)

      // Skip if manual
      if (settings.schedule === 'manual') continue

      // Check if today matches the schedule
      let shouldProcess = false

      if (settings.schedule === 'weekly') {
        // Weekly on specified day (default Sunday = 0)
        shouldProcess = dayOfWeek === (settings.day_of_week ?? 0)
      } else if (settings.schedule === 'biweekly') {
        // Biweekly (every other week on specified day)
        const weekNumber = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))
        shouldProcess = weekNumber % 2 === 0 && dayOfWeek === (settings.day_of_week ?? 0)
      } else if (settings.schedule === 'monthly') {
        // Monthly on specified day (default 1st)
        shouldProcess = dayOfMonth === (settings.day_of_month ?? 1)
      }

      if (!shouldProcess) continue

      console.log(`Processing scheduled payouts for ${ledger.business_name}`)

      // Get all creator accounts with balance above minimum
      const { data: creatorAccounts, error: accountsError } = await supabase
        .from('accounts')
        .select('id, entity_id, name, balance, metadata')
        .eq('ledger_id', ledger.id)
        .eq('account_type', 'creator_balance')
        .eq('is_active', true)
        .gte('balance', ledgerMinimumCents / 100)

      if (accountsError) {
        console.error(`Error fetching accounts for ${ledger.id}:`, accountsError)
        errorCount++
        continue
      }

      for (const account of creatorAccounts || []) {
        const balanceCents = toCents(account.balance)
        if (balanceCents <= 0) continue

        // Check if creator has payout enabled
        const payoutPrefs = account.metadata?.payout_preferences || {}
        if (payoutPrefs.schedule === 'manual') continue

        // Shared-merchant model: payouts are executed based on each creator's
        // configured payout_method stored on their balance account metadata.
        const payoutMethod = account.metadata?.payout_method || null
        if (!payoutMethod) {
          console.log(`Skipping ${account.entity_id}: no payout method configured`)
          continue
        }

        // Check minimum payout amount
        const minAmountCents = normalizeCents(payoutPrefs.minimum_amount ?? ledgerMinimumCents)
        if (balanceCents < minAmountCents) continue

        // Record payout (atomic) then execute it.
        // NOTE: reference_id must be stable and restricted to [a-zA-Z0-9_-].
        const dayStamp = now.toISOString().slice(0, 10).replace(/-/g, '')
        const referenceId = `sched_${dayStamp}_${ledger.id}_${account.entity_id}`

        try {
          const amountCents = balanceCents

          const recordResponse = await fetch(`${supabaseUrl}/functions/v1/process-payout`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-soledgic-internal-token': internalToken,
              'x-ledger-id': ledger.id,
            },
            body: JSON.stringify({
              creator_id: account.entity_id,
              amount: amountCents,
              reference_id: referenceId,
              reference_type: 'scheduled',
              description: `Scheduled payout (${settings.schedule})`,
              metadata: {
                scheduled: true,
                schedule: settings.schedule,
                run_at: now.toISOString(),
              },
            }),
          })

          const recordJson = await recordResponse.json().catch(() => ({}))
          if (!recordResponse.ok || recordJson?.success === false) {
            console.error(`Error recording payout for ${account.entity_id}:`, recordJson)
            errorCount++
            continue
          }

          const payoutTransactionId = recordJson?.transaction_id
          if (typeof payoutTransactionId !== 'string' || payoutTransactionId.length === 0) {
            console.error(`Unexpected payout response for ${account.entity_id}:`, recordJson)
            errorCount++
            continue
          }

          const executeResponse = await fetch(`${supabaseUrl}/functions/v1/execute-payout`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-soledgic-internal-token': internalToken,
              'x-ledger-id': ledger.id,
            },
            body: JSON.stringify({
              action: 'execute',
              payout_id: payoutTransactionId,
            }),
          })

          const executeJson = await executeResponse.json().catch(() => ({}))
          if (!executeResponse.ok || executeJson?.success === false) {
            console.error(`Error executing payout for ${account.entity_id}:`, executeJson)
            errorCount++
            continue
          }

          processedCount++
          results.push({
            ledger: ledger.business_name,
            creator: account.entity_id,
            amount: amountCents,
            payout_id: payoutTransactionId,
          })
        } catch (err) {
          console.error(`Exception processing payout for ${account.entity_id}:`, err)
          errorCount++
        }
      }
    }

    // Create notification for admins
    if (processedCount > 0) {
      console.log(`Scheduled payouts complete: ${processedCount} processed, ${errorCount} errors`)
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: processedCount,
        errors: errorCount,
        results
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error: any) {
    console.error('Scheduled payouts error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
