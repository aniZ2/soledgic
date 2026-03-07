// Soledgic Edge Function: Sync Bank Feeds (Cron)
// POST /sync-bank-feeds - Incremental sync for all active bank connections
// Called by cron with x-cron-secret header (same pattern as health-check)

import {
  getCorsHeaders,
  getSupabaseClient,
  jsonResponse,
  errorResponse,
  timingSafeEqual,
  logSecurityEvent,
} from '../_shared/utils.ts'
import { getBankAggregatorProvider } from '../_shared/bank-aggregator-provider.ts'
import { captureException } from '../_shared/error-tracking.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405, req)

  try {
    // Verify cron secret
    const cronSecret = req.headers.get('x-cron-secret')
    const expectedSecret = Deno.env.get('CRON_SECRET')

    if (!cronSecret || !expectedSecret) {
      return errorResponse('Unauthorized', 401, req)
    }

    if (!timingSafeEqual(cronSecret, expectedSecret)) {
      return errorResponse('Unauthorized', 401, req)
    }

    const supabase = getSupabaseClient()
    const provider = getBankAggregatorProvider()

    // Get all active connections
    const { data: connections, error: connError } = await supabase
      .from('bank_aggregator_connections')
      .select('id, ledger_id, cursor, accounts, access_token_vault_id, institution_name')
      .eq('status', 'active')

    if (connError) {
      return errorResponse('Failed to fetch connections', 500, req)
    }

    if (!connections || connections.length === 0) {
      return jsonResponse({ success: true, data: { synced: 0, message: 'No active connections' } }, 200, req)
    }

    let synced = 0, failed = 0
    const results: Array<{ connection_id: string; status: string; added?: number }> = []

    for (const conn of connections) {
      try {
        // Get access token from vault
        const { data: accessToken } = await supabase.rpc(
          'get_bank_aggregator_token_from_vault',
          { p_connection_id: conn.id },
        )

        if (!accessToken) {
          results.push({ connection_id: conn.id, status: 'no_token' })
          failed++
          continue
        }

        // Get accounts list
        let accounts = Array.isArray(conn.accounts) ? conn.accounts : []
        if (accounts.length === 0) {
          const acctResult = await provider.getAccounts({ accessToken })
          if (acctResult.success) {
            accounts = acctResult.accounts
            await supabase
              .from('bank_aggregator_connections')
              .update({ accounts: acctResult.accounts })
              .eq('id', conn.id)
          }
        }

        // Parse cursor map
        let cursors: Record<string, string> = {}
        try {
          cursors = conn.cursor ? JSON.parse(conn.cursor) : {}
        } catch {
          cursors = {}
        }

        let totalAdded = 0
        let hasError = false

        // Sync each account
        for (const account of accounts) {
          const accountId = (account as { accountId?: string }).accountId
          if (!accountId) continue

          let fromId = cursors[accountId] || null
          let hasMore = true

          while (hasMore) {
            const syncResult = await provider.syncTransactions({
              accessToken,
              accountId,
              fromId,
              startDate: fromId ? null : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            })

            if (!syncResult.success) {
              await supabase
                .from('bank_aggregator_connections')
                .update({ status: 'error', error_message: syncResult.error })
                .eq('id', conn.id)

              hasError = true
              hasMore = false
              continue
            }

            // Upsert transactions
            for (const txn of syncResult.transactions) {
              await supabase
                .from('bank_aggregator_transactions')
                .upsert({
                  ledger_id: conn.ledger_id,
                  connection_id: conn.id,
                  bank_aggregator_transaction_id: txn.transactionId,
                  bank_aggregator_account_id: txn.accountId,
                  amount: txn.amount,
                  date: txn.date,
                  name: txn.name,
                  merchant_name: txn.merchantName,
                  category: txn.category,
                  pending: txn.pending,
                  raw_data: txn.raw,
                }, { onConflict: 'ledger_id,bank_aggregator_transaction_id' })
            }

            totalAdded += syncResult.transactions.length

            if (syncResult.lastId) {
              cursors[accountId] = syncResult.lastId
              fromId = syncResult.lastId
            }
            hasMore = syncResult.hasMore
          }
        }

        // Run auto-match on new unmatched transactions
        const { data: unmatchedTxns } = await supabase
          .from('bank_aggregator_transactions')
          .select('id')
          .eq('connection_id', conn.id)
          .eq('match_status', 'unmatched')
          .limit(100)

        for (const txn of unmatchedTxns || []) {
          await supabase.rpc(
            'auto_match_bank_aggregator_transaction',
            { p_transaction_id: txn.id },
          ).catch(() => {})
        }

        // Update connection
        if (!hasError) {
          await supabase
            .from('bank_aggregator_connections')
            .update({
              cursor: JSON.stringify(cursors),
              last_sync_at: new Date().toISOString(),
              status: 'active',
              error_code: null,
              error_message: null,
            })
            .eq('id', conn.id)

          results.push({ connection_id: conn.id, status: 'synced', added: totalAdded })
          synced++
        } else {
          // Still save cursor progress for accounts that succeeded
          await supabase
            .from('bank_aggregator_connections')
            .update({
              cursor: JSON.stringify(cursors),
              last_sync_at: new Date().toISOString(),
            })
            .eq('id', conn.id)

          results.push({ connection_id: conn.id, status: 'partial_error', added: totalAdded })
          failed++
        }
      } catch (error: unknown) {
        captureException(error instanceof Error ? error : new Error(String(error)), {
          endpoint: 'sync-bank-feeds',
          ledgerId: conn.ledger_id,
        })
        results.push({ connection_id: conn.id, status: 'exception' })
        failed++
      }
    }

    // Audit log
    await logSecurityEvent(supabase, null, 'bank_feed_cron_sync', {
      total_connections: connections.length,
      synced,
      failed,
    }).catch(() => {})

    return jsonResponse({
      success: true,
      data: { total: connections.length, synced, failed, results },
    }, 200, req)
  } catch (error: unknown) {
    console.error('sync-bank-feeds error:', error)
    captureException(error instanceof Error ? error : new Error(String(error)), {
      endpoint: 'sync-bank-feeds',
    })
    return errorResponse('Internal server error', 500, req)
  }
})
