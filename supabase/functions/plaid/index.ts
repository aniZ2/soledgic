// Soledgic Edge Function: Plaid Integration
// POST /plaid
// Manage Plaid connections and sync bank transactions
// SECURITY HARDENED VERSION - Uses Vault for token storage

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { 
  createHandler, 
  jsonResponse, 
  errorResponse,
  validateUrl,
  LedgerContext,
  getClientIp
} from '../_shared/utils.ts'

interface PlaidRequest {
  action: 'create_link_token' | 'exchange_token' | 'list_connections' | 'sync' | 'disconnect' | 
          'list_transactions' | 'match' | 'unmatch' | 'exclude' | 'mark_reviewed' | 'restore' |
          'auto_match_all' | 'list_rules' | 'create_rule' | 'delete_rule'
  connection_id?: string
  public_token?: string
  plaid_transaction_id?: string
  ledger_transaction_id?: string
  rule?: {
    name: string
    conditions: Record<string, any>
    action: string
    action_config?: Record<string, any>
  }
  rule_id?: string
}

// Plaid API helper
async function plaidRequest(endpoint: string, body: any) {
  const clientId = Deno.env.get('PLAID_CLIENT_ID')
  const secret = Deno.env.get('PLAID_SECRET')
  const env = Deno.env.get('PLAID_ENV') || 'sandbox'
  
  const baseUrl = env === 'production' 
    ? 'https://production.plaid.com'
    : env === 'development'
    ? 'https://development.plaid.com'
    : 'https://sandbox.plaid.com'

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      secret: secret,
      ...body,
    }),
  })

  return response.json()
}

// SECURITY: Get access token from vault
async function getAccessToken(supabase: any, connectionId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_plaid_token_from_vault', {
    p_connection_id: connectionId
  })
  
  if (error) {
    console.error('Failed to get token from vault:', error)
    return null
  }
  
  return data
}

// SECURITY: Store access token in vault
async function storeAccessToken(supabase: any, connectionId: string, accessToken: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('store_plaid_token_in_vault', {
    p_connection_id: connectionId,
    p_access_token: accessToken
  })
  
  if (error) {
    console.error('Failed to store token in vault:', error)
    return false
  }
  
  return true
}

const handler = createHandler(
  { endpoint: 'plaid', requireAuth: true, rateLimit: true },
  async (req: Request, supabase, ledger: LedgerContext | null, body: PlaidRequest) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req)
    }

    // Check if bank feed is configured
    const plaidClientId = Deno.env.get('PLAID_CLIENT_ID')
    if (!plaidClientId) {
      return errorResponse('Bank feed is not configured. Contact support.', 503, req)
    }

    switch (body.action) {
      case 'create_link_token': {
        const result = await plaidRequest('/link/token/create', {
          user: { client_user_id: ledger.id },
          client_name: 'Soledgic',
          products: ['transactions'],
          country_codes: ['US'],
          language: 'en',
        })

        if (result.error_code) {
          return errorResponse(result.error_message, 400, req)
        }

        return jsonResponse({
          success: true,
          data: { link_token: result.link_token, expiration: result.expiration }
        }, 200, req)
      }

      case 'exchange_token': {
        if (!body.public_token) {
          return errorResponse('public_token required', 400, req)
        }

        // Exchange public token for access token
        const exchangeResult = await plaidRequest('/item/public_token/exchange', {
          public_token: body.public_token,
        })

        if (exchangeResult.error_code) {
          return errorResponse(exchangeResult.error_message, 400, req)
        }

        // Get institution info
        const itemResult = await plaidRequest('/item/get', {
          access_token: exchangeResult.access_token,
        })

        // Get accounts
        const accountsResult = await plaidRequest('/accounts/get', {
          access_token: exchangeResult.access_token,
        })

        // Store connection (WITHOUT the access token - that goes to vault)
        const { data: connection, error } = await supabase
          .from('plaid_connections')
          .insert({
            ledger_id: ledger.id,
            item_id: exchangeResult.item_id,
            // SECURITY: Token goes to vault, not here
            access_token: '[PENDING_VAULT]',
            institution_id: itemResult.item?.institution_id,
            institution_name: itemResult.item?.institution_id || 'Connected',
            accounts: accountsResult.accounts || [],
            status: 'active',
          })
          .select()
          .single()

        if (error) {
          console.error('Failed to create connection:', error)
          return errorResponse('Failed to create connection', 500, req)
        }

        // SECURITY: Store token in vault
        const vaultStored = await storeAccessToken(supabase, connection.id, exchangeResult.access_token)
        if (!vaultStored) {
          // Rollback connection if vault storage failed
          await supabase.from('plaid_connections').delete().eq('id', connection.id)
          return errorResponse('Failed to secure connection credentials', 500, req)
        }

        // Audit log
        await supabase.from('audit_log').insert({
          ledger_id: ledger.id,
          action: 'plaid_connected',
          entity_type: 'plaid_connection',
          entity_id: connection.id,
          actor_type: 'api',
          ip_address: getClientIp(req),
          request_body: {
            institution_id: itemResult.item?.institution_id,
            accounts_count: accountsResult.accounts?.length || 0,
          },
        })

        return jsonResponse({
          success: true,
          data: {
            connection_id: connection.id,
            institution: connection.institution_name,
            accounts: accountsResult.accounts?.length || 0,
          }
        }, 201, req)
      }

      case 'list_connections': {
        const { data: connections } = await supabase
          .from('plaid_connections')
          .select('id, institution_name, status, accounts, last_sync_at, created_at')
          .eq('ledger_id', ledger.id)
          .order('created_at', { ascending: false })

        return jsonResponse({ success: true, data: connections || [] }, 200, req)
      }

      case 'sync': {
        let connections
        if (body.connection_id) {
          const { data } = await supabase
            .from('plaid_connections')
            .select('id, item_id, cursor, status')
            .eq('id', body.connection_id)
            .eq('ledger_id', ledger.id)
            .single()
          connections = data ? [data] : []
        } else {
          const { data } = await supabase
            .from('plaid_connections')
            .select('id, item_id, cursor, status')
            .eq('ledger_id', ledger.id)
            .eq('status', 'active')
          connections = data || []
        }

        let totalAdded = 0
        let totalModified = 0

        for (const conn of connections) {
          // SECURITY: Get token from vault
          const accessToken = await getAccessToken(supabase, conn.id)
          if (!accessToken) {
            console.error(`No access token found for connection ${conn.id}`)
            continue
          }

          const syncResult = await plaidRequest('/transactions/sync', {
            access_token: accessToken,
            cursor: conn.cursor || undefined,
          })

          if (syncResult.error_code) {
            await supabase
              .from('plaid_connections')
              .update({ 
                status: 'error', 
                error_code: syncResult.error_code,
                error_message: syncResult.error_message 
              })
              .eq('id', conn.id)
            continue
          }

          // Process added transactions
          for (const txn of syncResult.added || []) {
            await supabase
              .from('plaid_transactions')
              .upsert({
                ledger_id: ledger.id,
                connection_id: conn.id,
                plaid_transaction_id: txn.transaction_id,
                plaid_account_id: txn.account_id,
                amount: txn.amount,
                date: txn.date,
                name: txn.name,
                merchant_name: txn.merchant_name,
                category: txn.category,
                pending: txn.pending,
                raw_data: txn,
              }, { onConflict: 'ledger_id,plaid_transaction_id' })
            totalAdded++
          }

          // Process modified
          for (const txn of syncResult.modified || []) {
            await supabase
              .from('plaid_transactions')
              .update({
                amount: txn.amount,
                name: txn.name,
                merchant_name: txn.merchant_name,
                category: txn.category,
                pending: txn.pending,
                raw_data: txn,
              })
              .eq('ledger_id', ledger.id)
              .eq('plaid_transaction_id', txn.transaction_id)
            totalModified++
          }

          // Process removed
          for (const txn of syncResult.removed || []) {
            await supabase
              .from('plaid_transactions')
              .delete()
              .eq('ledger_id', ledger.id)
              .eq('plaid_transaction_id', txn.transaction_id)
          }

          // Update cursor
          await supabase
            .from('plaid_connections')
            .update({ 
              cursor: syncResult.next_cursor,
              last_sync_at: new Date().toISOString(),
              status: 'active',
              error_code: null,
              error_message: null,
            })
            .eq('id', conn.id)
        }

        return jsonResponse({
          success: true,
          data: {
            connections_synced: connections.length,
            transactions_added: totalAdded,
            transactions_modified: totalModified,
          }
        }, 200, req)
      }

      case 'disconnect': {
        if (!body.connection_id) {
          return errorResponse('connection_id required', 400, req)
        }

        // SECURITY: Get token from vault to remove from Plaid
        const accessToken = await getAccessToken(supabase, body.connection_id)
        
        if (accessToken && accessToken !== '[ENCRYPTED]' && accessToken !== '[PENDING_VAULT]') {
          await plaidRequest('/item/remove', { access_token: accessToken })
        }

        // Delete from database (cascade will remove vault entry via trigger if configured)
        await supabase
          .from('plaid_connections')
          .delete()
          .eq('id', body.connection_id)
          .eq('ledger_id', ledger.id)

        // Audit log
        await supabase.from('audit_log').insert({
          ledger_id: ledger.id,
          action: 'plaid_disconnected',
          entity_type: 'plaid_connection',
          entity_id: body.connection_id,
          actor_type: 'api',
          ip_address: getClientIp(req),
        })

        return jsonResponse({ success: true, message: 'Disconnected' }, 200, req)
      }

      case 'list_transactions': {
        const { data: transactions } = await supabase
          .from('plaid_transactions')
          .select(`
            id, plaid_transaction_id, amount, date, name, merchant_name, 
            category, pending, match_status, match_confidence,
            matched_transaction_id, created_at
          `)
          .eq('ledger_id', ledger.id)
          .order('date', { ascending: false })
          .limit(200)

        return jsonResponse({ success: true, data: transactions || [] }, 200, req)
      }

      case 'match': {
        if (!body.plaid_transaction_id || !body.ledger_transaction_id) {
          return errorResponse('plaid_transaction_id and ledger_transaction_id required', 400, req)
        }

        const { error } = await supabase
          .from('plaid_transactions')
          .update({
            matched_transaction_id: body.ledger_transaction_id,
            match_status: 'matched',
            match_confidence: 1.0,
          })
          .eq('id', body.plaid_transaction_id)
          .eq('ledger_id', ledger.id)

        if (error) {
          return errorResponse('Failed to match', 500, req)
        }

        return jsonResponse({ success: true, message: 'Matched' }, 200, req)
      }

      case 'unmatch': {
        if (!body.plaid_transaction_id) {
          return errorResponse('plaid_transaction_id required', 400, req)
        }

        await supabase
          .from('plaid_transactions')
          .update({
            matched_transaction_id: null,
            match_status: 'unmatched',
            match_confidence: null,
          })
          .eq('id', body.plaid_transaction_id)
          .eq('ledger_id', ledger.id)

        return jsonResponse({ success: true, message: 'Unmatched' }, 200, req)
      }

      case 'exclude': {
        if (!body.plaid_transaction_id) {
          return errorResponse('plaid_transaction_id required', 400, req)
        }

        await supabase
          .from('plaid_transactions')
          .update({ match_status: 'excluded' })
          .eq('id', body.plaid_transaction_id)
          .eq('ledger_id', ledger.id)

        return jsonResponse({ success: true, message: 'Excluded' }, 200, req)
      }

      case 'mark_reviewed': {
        if (!body.plaid_transaction_id) {
          return errorResponse('plaid_transaction_id required', 400, req)
        }

        await supabase
          .from('plaid_transactions')
          .update({ match_status: 'reviewed' })
          .eq('id', body.plaid_transaction_id)
          .eq('ledger_id', ledger.id)

        return jsonResponse({ success: true, message: 'Marked as reviewed' }, 200, req)
      }

      case 'restore': {
        if (!body.plaid_transaction_id) {
          return errorResponse('plaid_transaction_id required', 400, req)
        }

        await supabase
          .from('plaid_transactions')
          .update({ 
            match_status: 'unmatched',
            matched_transaction_id: null,
            match_confidence: null 
          })
          .eq('id', body.plaid_transaction_id)
          .eq('ledger_id', ledger.id)

        return jsonResponse({ success: true, message: 'Restored to unmatched' }, 200, req)
      }

      case 'auto_match_all': {
        const { data: unmatched } = await supabase
          .from('plaid_transactions')
          .select('id')
          .eq('ledger_id', ledger.id)
          .eq('match_status', 'unmatched')
          .limit(500)

        let matched = 0
        for (const txn of unmatched || []) {
          const { data: result } = await supabase.rpc('auto_match_plaid_transaction', {
            p_plaid_txn_id: txn.id
          })
          if (result?.[0]?.matched) matched++
        }

        return jsonResponse({
          success: true,
          data: { processed: unmatched?.length || 0, matched }
        }, 200, req)
      }

      case 'list_rules': {
        const { data: rules } = await supabase
          .from('auto_match_rules')
          .select('*')
          .eq('ledger_id', ledger.id)
          .order('priority')

        return jsonResponse({ success: true, data: rules || [] }, 200, req)
      }

      case 'create_rule': {
        if (!body.rule) {
          return errorResponse('rule required', 400, req)
        }

        const { data: rule, error } = await supabase
          .from('auto_match_rules')
          .insert({
            ledger_id: ledger.id,
            name: body.rule.name,
            conditions: body.rule.conditions,
            action: body.rule.action,
            action_config: body.rule.action_config || {},
          })
          .select()
          .single()

        if (error) {
          return errorResponse('Failed to create rule', 500, req)
        }

        return jsonResponse({ success: true, data: rule }, 201, req)
      }

      case 'delete_rule': {
        if (!body.rule_id) {
          return errorResponse('rule_id required', 400, req)
        }

        await supabase
          .from('auto_match_rules')
          .delete()
          .eq('id', body.rule_id)
          .eq('ledger_id', ledger.id)

        return jsonResponse({ success: true, message: 'Deleted' }, 200, req)
      }

      default:
        return errorResponse(`Unknown action: ${body.action}`, 400, req)
    }
  }
)

Deno.serve(handler)
