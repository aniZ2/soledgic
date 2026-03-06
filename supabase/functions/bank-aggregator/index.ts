// Soledgic Edge Function: Bank Aggregator
// POST /bank-aggregator - Manage bank feed connections and syncing
// Provider: Teller (behind vendor-agnostic "bank_aggregator" abstraction)
// MIGRATED TO createHandler

import {
  createHandler,
  jsonResponse,
  errorResponse,
  validateId,
  getClientIp,
  LedgerContext,
  logSecurityEvent,
} from '../_shared/utils.ts'
import { getBankAggregatorProvider } from '../_shared/bank-aggregator-provider.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface BankAggregatorRequest {
  action: 'get_connect_config' | 'store_enrollment' | 'sync' | 'get_accounts' | 'disconnect' | 'list_connections'
  connection_id?: string
  // Teller Connect onSuccess fields
  access_token?: string
  enrollment_id?: string
  institution_name?: string
}

const VALID_ACTIONS = ['get_connect_config', 'store_enrollment', 'sync', 'get_accounts', 'disconnect', 'list_connections']

const handler = createHandler(
  { endpoint: 'bank-aggregator', requireAuth: true, rateLimit: true },
  async (req, supabase: SupabaseClient, ledger: LedgerContext | null, body: BankAggregatorRequest, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    if (!body.action || !VALID_ACTIONS.includes(body.action)) {
      return errorResponse(`Invalid action: must be one of ${VALID_ACTIONS.join(', ')}`, 400, req, requestId)
    }

    const provider = getBankAggregatorProvider()

    switch (body.action) {
      case 'get_connect_config': {
        // Return Teller application ID and environment for the frontend Connect widget
        const config = provider.getConnectConfig({ ledgerId: ledger.id })

        if (!config.success) {
          return errorResponse(config.error || 'Bank aggregator not configured', 500, req, requestId)
        }

        return jsonResponse({
          success: true,
          data: {
            application_id: config.applicationId,
            environment: config.environment,
          },
        }, 200, req, requestId)
      }

      case 'store_enrollment': {
        // Teller Connect gives the access token directly — no server-side exchange needed.
        // Frontend sends access_token + enrollment_id from onSuccess callback.
        if (!body.access_token || !body.enrollment_id) {
          return errorResponse('access_token and enrollment_id are required', 400, req, requestId)
        }

        const enrollment = provider.validateEnrollment({
          accessToken: body.access_token,
          enrollmentId: body.enrollment_id,
          institutionName: body.institution_name,
        })

        if (!enrollment.success) {
          return errorResponse(enrollment.error || 'Invalid enrollment', 400, req, requestId)
        }

        // Store access token in Vault (always encrypted, per security policy)
        let vaultId: string | null = null
        const { data: vaultResult } = await supabase.rpc(
          'store_bank_aggregator_token_in_vault_new',
          { p_token: enrollment.accessToken },
        )
        vaultId = vaultResult as string | null

        if (!vaultId) {
          // Fallback to generic vault function
          const { data: vaultResult2 } = await supabase.rpc(
            'store_token_in_vault',
            { p_secret: enrollment.accessToken, p_name: `bank_aggregator_${enrollment.enrollmentId}` },
          )
          vaultId = vaultResult2 as string | null
        }

        // Create connection record (item_id = enrollment_id for Teller)
        const { data: connection, error: connError } = await supabase
          .from('bank_aggregator_connections')
          .upsert({
            ledger_id: ledger.id,
            item_id: enrollment.enrollmentId,
            access_token: '[ENCRYPTED]', // Never store plaintext
            access_token_vault_id: vaultId,
            institution_name: body.institution_name || null,
            status: 'active',
          }, { onConflict: 'ledger_id,item_id' })
          .select('id')
          .single()

        if (connError) {
          return errorResponse('Failed to store connection', 500, req, requestId)
        }

        // Fetch initial accounts
        const accountsResult = await provider.getAccounts({
          accessToken: enrollment.accessToken,
        })

        if (accountsResult.success) {
          // Enrich accounts with balances
          for (const account of accountsResult.accounts) {
            const balances = await provider.getBalances(enrollment.accessToken, account.accountId)
            if (balances) {
              account.currentBalance = balances.current
              account.availableBalance = balances.available
            }
          }

          await supabase
            .from('bank_aggregator_connections')
            .update({ accounts: accountsResult.accounts })
            .eq('id', connection.id)
        }

        await logSecurityEvent(supabase, ledger.id, 'bank_aggregator_connected', {
          connection_id: connection.id,
          institution: body.institution_name,
          request_id: requestId,
          ip: getClientIp(req),
        }).catch(() => {})

        return jsonResponse({
          success: true,
          data: {
            connection_id: connection.id,
            institution_name: body.institution_name,
            accounts: accountsResult.success ? accountsResult.accounts : [],
          },
        }, 200, req, requestId)
      }

      case 'sync': {
        const connectionId = body.connection_id ? validateId(body.connection_id, 100) : null
        if (!connectionId) return errorResponse('Invalid connection_id', 400, req, requestId)

        // Fetch connection
        const { data: conn, error: connError } = await supabase
          .from('bank_aggregator_connections')
          .select('id, item_id, cursor, accounts, access_token_vault_id')
          .eq('id', connectionId)
          .eq('ledger_id', ledger.id)
          .single()

        if (connError || !conn) return errorResponse('Connection not found', 404, req, requestId)

        // Get access token from vault
        const { data: accessToken } = await supabase.rpc(
          'get_bank_aggregator_token_from_vault',
          { p_connection_id: conn.id },
        )

        if (!accessToken) {
          return errorResponse('Access token not available', 500, req, requestId)
        }

        // Get list of accounts for this connection
        const accounts = Array.isArray(conn.accounts) ? conn.accounts : []
        if (accounts.length === 0) {
          // Refresh accounts first
          const acctResult = await provider.getAccounts({ accessToken })
          if (acctResult.success) {
            accounts.push(...acctResult.accounts)
            await supabase
              .from('bank_aggregator_connections')
              .update({ accounts: acctResult.accounts })
              .eq('id', conn.id)
          }
        }

        // Parse cursor as JSON map of accountId → lastTransactionId
        let cursors: Record<string, string> = {}
        try {
          cursors = conn.cursor ? JSON.parse(conn.cursor) : {}
        } catch {
          cursors = {}
        }

        let totalAdded = 0

        // Sync each account
        for (const account of accounts) {
          const accountId = (account as { accountId?: string }).accountId
          if (!accountId) continue

          const lastSyncDate = conn.cursor
            ? undefined  // Use from_id pagination if we have cursors
            : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // Initial: last 90 days

          let fromId = cursors[accountId] || null
          let hasMore = true

          while (hasMore) {
            const syncResult = await provider.syncTransactions({
              accessToken,
              accountId,
              fromId,
              startDate: fromId ? null : lastSyncDate,
            })

            if (!syncResult.success) {
              await supabase
                .from('bank_aggregator_connections')
                .update({ status: 'error', error_message: syncResult.error })
                .eq('id', conn.id)

              return errorResponse(syncResult.error || 'Sync failed', 500, req, requestId)
            }

            // Upsert transactions
            for (const txn of syncResult.transactions) {
              await supabase
                .from('bank_aggregator_transactions')
                .upsert({
                  ledger_id: ledger.id,
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

        // Run auto-match on unmatched transactions
        const { data: unmatchedTxns } = await supabase
          .from('bank_aggregator_transactions')
          .select('id')
          .eq('connection_id', conn.id)
          .eq('match_status', 'unmatched')
          .limit(100)

        let matched = 0
        for (const txn of unmatchedTxns || []) {
          const { data: matchResult } = await supabase.rpc(
            'auto_match_bank_aggregator_transaction',
            { p_transaction_id: txn.id },
          )
          if (matchResult) matched++
        }

        // Update connection
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

        return jsonResponse({
          success: true,
          data: {
            connection_id: conn.id,
            added: totalAdded,
            auto_matched: matched,
          },
        }, 200, req, requestId)
      }

      case 'get_accounts': {
        const connectionId = body.connection_id ? validateId(body.connection_id, 100) : null
        if (!connectionId) return errorResponse('Invalid connection_id', 400, req, requestId)

        const { data: conn } = await supabase
          .from('bank_aggregator_connections')
          .select('id, access_token_vault_id')
          .eq('id', connectionId)
          .eq('ledger_id', ledger.id)
          .single()

        if (!conn) return errorResponse('Connection not found', 404, req, requestId)

        const { data: accessToken } = await supabase.rpc(
          'get_bank_aggregator_token_from_vault',
          { p_connection_id: conn.id },
        )

        if (!accessToken) return errorResponse('Access token not available', 500, req, requestId)

        const result = await provider.getAccounts({ accessToken })
        if (!result.success) {
          return errorResponse(result.error || 'Failed to get accounts', 500, req, requestId)
        }

        // Enrich with balances
        for (const account of result.accounts) {
          const balances = await provider.getBalances(accessToken, account.accountId)
          if (balances) {
            account.currentBalance = balances.current
            account.availableBalance = balances.available
          }
        }

        // Update stored accounts
        await supabase
          .from('bank_aggregator_connections')
          .update({ accounts: result.accounts })
          .eq('id', conn.id)

        return jsonResponse({
          success: true,
          data: { connection_id: conn.id, accounts: result.accounts },
        }, 200, req, requestId)
      }

      case 'disconnect': {
        const connectionId = body.connection_id ? validateId(body.connection_id, 100) : null
        if (!connectionId) return errorResponse('Invalid connection_id', 400, req, requestId)

        const { data: conn } = await supabase
          .from('bank_aggregator_connections')
          .select('id, access_token_vault_id')
          .eq('id', connectionId)
          .eq('ledger_id', ledger.id)
          .single()

        if (!conn) return errorResponse('Connection not found', 404, req, requestId)

        const { data: accessToken } = await supabase.rpc(
          'get_bank_aggregator_token_from_vault',
          { p_connection_id: conn.id },
        )

        if (accessToken) {
          await provider.removeItem({ accessToken })
        }

        await supabase
          .from('bank_aggregator_connections')
          .update({ status: 'disconnected' })
          .eq('id', conn.id)

        await logSecurityEvent(supabase, ledger.id, 'bank_aggregator_disconnected', {
          connection_id: conn.id,
          request_id: requestId,
          ip: getClientIp(req),
        }).catch(() => {})

        return jsonResponse({
          success: true,
          data: { connection_id: conn.id, status: 'disconnected' },
        }, 200, req, requestId)
      }

      case 'list_connections': {
        const { data: connections, error } = await supabase
          .from('bank_aggregator_connections')
          .select('id, institution_id, institution_name, status, last_sync_at, accounts, error_message, created_at')
          .eq('ledger_id', ledger.id)
          .order('created_at', { ascending: false })

        if (error) return errorResponse('Failed to list connections', 500, req, requestId)

        return jsonResponse({
          success: true,
          data: {
            connections: (connections || []).map((c) => ({
              ...c,
              account_count: Array.isArray(c.accounts) ? c.accounts.length : 0,
            })),
          },
        }, 200, req, requestId)
      }

      default:
        return errorResponse(`Unknown action: ${body.action}`, 400, req, requestId)
    }
  },
)

Deno.serve(handler)
