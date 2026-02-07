// Soledgic Edge Function: Scheduled Payouts
// Runs on a cron schedule to automatically process payouts
// based on organization payout settings

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PayoutSettings {
  schedule: 'manual' | 'weekly' | 'biweekly' | 'monthly'
  day_of_week?: number  // 0-6 for weekly
  day_of_month?: number // 1-28 for monthly
  minimum_amount: number // cents
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Initialize admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

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
        api_key,
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
        .gte('balance', settings.minimum_amount || 0)

      if (accountsError) {
        console.error(`Error fetching accounts for ${ledger.id}:`, accountsError)
        errorCount++
        continue
      }

      for (const account of creatorAccounts || []) {
        if (Number(account.balance) <= 0) continue

        // Check if creator has payout enabled
        const payoutPrefs = account.metadata?.payout_preferences || {}
        if (payoutPrefs.schedule === 'manual') continue

        // Check minimum payout amount
        const minAmount = payoutPrefs.minimum_amount || settings.minimum_amount || 0
        if (Number(account.balance) < minAmount) continue

        // Check if creator has a connected account with payouts enabled
        const { data: connectedAccount } = await supabase
          .from('connected_accounts')
          .select('id, stripe_account_id, payouts_enabled')
          .eq('ledger_id', ledger.id)
          .eq('entity_type', 'creator')
          .eq('entity_id', account.entity_id)
          .eq('is_active', true)
          .single()

        if (!connectedAccount?.payouts_enabled) {
          console.log(`Skipping ${account.entity_id}: payouts not enabled`)
          continue
        }

        // Create payout request
        try {
          const { error: payoutError } = await supabase
            .from('payout_requests')
            .insert({
              ledger_id: ledger.id,
              connected_account_id: connectedAccount.id,
              recipient_entity_type: 'creator',
              recipient_entity_id: account.entity_id,
              requested_amount: Math.floor(Number(account.balance)),
              approved_amount: Math.floor(Number(account.balance)),
              status: 'approved', // Auto-approve scheduled payouts
              requested_at: now.toISOString()
            })

          if (payoutError) {
            console.error(`Error creating payout for ${account.entity_id}:`, payoutError)
            errorCount++
          } else {
            processedCount++
            results.push({
              ledger: ledger.business_name,
              creator: account.entity_id,
              amount: account.balance
            })

            // Call process-payout to actually execute the payout
            const processResponse = await fetch(`${supabaseUrl}/functions/v1/process-payout`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': ledger.api_key
              },
              body: JSON.stringify({
                creator_id: account.entity_id,
                amount: Math.floor(Number(account.balance))
              })
            })

            if (!processResponse.ok) {
              const error = await processResponse.json()
              console.error(`Error processing payout for ${account.entity_id}:`, error)
              errorCount++
            }
          }
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
