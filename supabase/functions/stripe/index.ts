// Soledgic Edge Function: Stripe Management
// POST /stripe - Manage Stripe transactions for reconciliation
// MIGRATED TO createHandler

import { 
  createHandler,
  jsonResponse, 
  errorResponse,
  validateId,
  getClientIp,
  LedgerContext
} from '../_shared/utils.ts'

interface StripeRequest {
  action: 'list_transactions' | 'list_events' | 'match' | 'unmatch' | 'exclude' | 
          'mark_reviewed' | 'restore' | 'reprocess_event' | 'get_summary' | 
          'match_payouts_to_bank' | 'get_payout_reconciliation' | 'link_payout_to_bank'
  stripe_transaction_id?: string
  ledger_transaction_id?: string
  event_id?: string
  bank_transaction_id?: string
}

const VALID_ACTIONS = [
  'list_transactions', 'list_events', 'match', 'unmatch', 'exclude', 
  'mark_reviewed', 'restore', 'reprocess_event', 'get_summary', 
  'match_payouts_to_bank', 'get_payout_reconciliation', 'link_payout_to_bank'
]

const handler = createHandler(
  { endpoint: 'stripe', requireAuth: true, rateLimit: true },
  async (req, supabase, ledger: LedgerContext | null, body: StripeRequest, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    if (Deno.env.get('ENABLE_STRIPE_LEGACY') !== 'true') {
      return errorResponse('Stripe legacy endpoints are disabled', 410, req, requestId)
    }

    if (!body.action || !VALID_ACTIONS.includes(body.action)) {
      return errorResponse(`Invalid action: must be one of ${VALID_ACTIONS.join(', ')}`, 400, req, requestId)
    }

    switch (body.action) {
      case 'list_transactions': {
        const { data: transactions } = await supabase
          .from('stripe_transactions')
          .select(`id, stripe_id, stripe_type, amount, fee, net, currency, status, 
                   description, match_status, match_confidence, transaction_id, 
                   bank_transaction_id, bank_matched_at, created_at`)
          .eq('ledger_id', ledger.id)
          .order('created_at', { ascending: false })
          .limit(200)
        return jsonResponse({ success: true, data: transactions || [] }, 200, req, requestId)
      }

      case 'list_events': {
        const { data: events } = await supabase
          .from('stripe_events')
          .select(`id, stripe_event_id, event_type, livemode, status, 
                   processed_at, transaction_id, error_message, created_at`)
          .eq('ledger_id', ledger.id)
          .order('created_at', { ascending: false })
          .limit(100)
        return jsonResponse({ success: true, data: events || [] }, 200, req, requestId)
      }

      case 'get_summary': {
        const { data: stripeSummary } = await supabase
          .from('stripe_transactions')
          .select('match_status, stripe_type')
          .eq('ledger_id', ledger.id)
        
        return jsonResponse({
          success: true, 
          data: {
            total: stripeSummary?.length || 0,
            matched: stripeSummary?.filter(t => t.match_status === 'matched' || t.match_status === 'auto_matched').length || 0,
            unmatched: stripeSummary?.filter(t => t.match_status === 'unmatched').length || 0,
            excluded: stripeSummary?.filter(t => t.match_status === 'excluded').length || 0,
            by_type: { 
              charge: stripeSummary?.filter(t => t.stripe_type === 'charge').length || 0, 
              payout: stripeSummary?.filter(t => t.stripe_type === 'payout').length || 0, 
              refund: stripeSummary?.filter(t => t.stripe_type === 'refund').length || 0 
            }
          }
        }, 200, req, requestId)
      }

      case 'match': {
        const stripeId = body.stripe_transaction_id ? validateId(body.stripe_transaction_id, 100) : null
        const ledgerTxId = body.ledger_transaction_id ? validateId(body.ledger_transaction_id, 100) : null
        if (!stripeId || !ledgerTxId) {
          return errorResponse('stripe_transaction_id and ledger_transaction_id required', 400, req, requestId)
        }

        await supabase
          .from('stripe_transactions')
          .update({ transaction_id: ledgerTxId, match_status: 'matched', match_confidence: 1.0 })
          .eq('id', stripeId)
          .eq('ledger_id', ledger.id)
        
        return jsonResponse({ success: true, message: 'Matched' }, 200, req, requestId)
      }

      case 'unmatch': {
        const stripeId = body.stripe_transaction_id ? validateId(body.stripe_transaction_id, 100) : null
        if (!stripeId) {
          return errorResponse('stripe_transaction_id required', 400, req, requestId)
        }
        
        await supabase
          .from('stripe_transactions')
          .update({ transaction_id: null, match_status: 'unmatched', match_confidence: null })
          .eq('id', stripeId)
          .eq('ledger_id', ledger.id)
        
        return jsonResponse({ success: true, message: 'Unmatched' }, 200, req, requestId)
      }

      case 'exclude': {
        const stripeId = body.stripe_transaction_id ? validateId(body.stripe_transaction_id, 100) : null
        if (!stripeId) {
          return errorResponse('stripe_transaction_id required', 400, req, requestId)
        }
        
        await supabase
          .from('stripe_transactions')
          .update({ match_status: 'excluded' })
          .eq('id', stripeId)
          .eq('ledger_id', ledger.id)
        
        return jsonResponse({ success: true, message: 'Excluded' }, 200, req, requestId)
      }

      case 'mark_reviewed': {
        const stripeId = body.stripe_transaction_id ? validateId(body.stripe_transaction_id, 100) : null
        if (!stripeId) {
          return errorResponse('stripe_transaction_id required', 400, req, requestId)
        }
        
        await supabase
          .from('stripe_transactions')
          .update({ match_status: 'reviewed' })
          .eq('id', stripeId)
          .eq('ledger_id', ledger.id)
        
        return jsonResponse({ success: true, message: 'Marked as reviewed' }, 200, req, requestId)
      }

      case 'restore': {
        const stripeId = body.stripe_transaction_id ? validateId(body.stripe_transaction_id, 100) : null
        if (!stripeId) {
          return errorResponse('stripe_transaction_id required', 400, req, requestId)
        }
        
        await supabase
          .from('stripe_transactions')
          .update({ match_status: 'unmatched', transaction_id: null, match_confidence: null })
          .eq('id', stripeId)
          .eq('ledger_id', ledger.id)
        
        return jsonResponse({ success: true, message: 'Restored to unmatched' }, 200, req, requestId)
      }

      case 'reprocess_event': {
        const eventId = body.event_id ? validateId(body.event_id, 100) : null
        if (!eventId) {
          return errorResponse('event_id required', 400, req, requestId)
        }

        const { data: evt } = await supabase
          .from('stripe_events')
          .select('*')
          .eq('id', eventId)
          .eq('ledger_id', ledger.id)
          .single()
        
        if (!evt) {
          return errorResponse('Event not found', 404, req, requestId)
        }

        await supabase
          .from('stripe_events')
          .update({ status: 'pending', processed_at: null, error_message: null })
          .eq('id', evt.id)
        
        return jsonResponse({ success: true, message: 'Event queued for reprocessing' }, 200, req, requestId)
      }

      case 'match_payouts_to_bank': {
        const { data: result, error } = await supabase.rpc('match_stripe_payouts_to_bank', { 
          p_ledger_id: ledger.id 
        })
        
        if (error) {
          return errorResponse('Matching failed', 500, req, requestId)
        }
        
        return jsonResponse({ 
          success: true, 
          data: result?.[0] || { matched: 0, unmatched_payouts: 0, unmatched_deposits: 0 } 
        }, 200, req, requestId)
      }

      case 'get_payout_reconciliation': {
        const { data: payouts } = await supabase
          .from('stripe_transactions')
          .select(`id, stripe_id, amount, status, raw_data, bank_transaction_id, 
                   bank_matched_at, created_at`)
          .eq('ledger_id', ledger.id)
          .eq('stripe_type', 'payout')
          .order('created_at', { ascending: false })
          .limit(50)

        const enriched = await Promise.all((payouts || []).map(async (payout) => {
          let bankTxn = null
          if (payout.bank_transaction_id) {
            const { data } = await supabase
              .from('plaid_transactions')
              .select('id, amount, date, description, name')
              .eq('id', payout.bank_transaction_id)
              .single()
            bankTxn = data
          }
          return { 
            ...payout, 
            arrival_date: (payout.raw_data as any)?.arrival_date, 
            bank_transaction: bankTxn, 
            reconciliation_status: payout.bank_transaction_id ? 'matched' : 'unmatched' 
          }
        }))

        const { data: unmatchedDeposits } = await supabase
          .from('plaid_transactions')
          .select('id, amount, date, description, name')
          .eq('ledger_id', ledger.id)
          .gt('amount', 0)
          .is('stripe_payout_id', null)
          .or('description.ilike.%STRIPE%,name.ilike.%STRIPE%')
          .order('date', { ascending: false })
          .limit(20)

        return jsonResponse({ 
          success: true, 
          data: { payouts: enriched, unmatched_deposits: unmatchedDeposits || [] } 
        }, 200, req, requestId)
      }

      case 'link_payout_to_bank': {
        const stripeId = body.stripe_transaction_id ? validateId(body.stripe_transaction_id, 100) : null
        const bankId = body.bank_transaction_id ? validateId(body.bank_transaction_id, 100) : null
        
        if (!stripeId || !bankId) {
          return errorResponse('stripe_transaction_id and bank_transaction_id required', 400, req, requestId)
        }

        const { data: stripeTxn } = await supabase
          .from('stripe_transactions')
          .select('id, stripe_id, transaction_id')
          .eq('id', stripeId)
          .eq('ledger_id', ledger.id)
          .eq('stripe_type', 'payout')
          .single()
        
        if (!stripeTxn) {
          return errorResponse('Stripe payout not found', 404, req, requestId)
        }

        await supabase
          .from('stripe_transactions')
          .update({ bank_transaction_id: bankId, bank_matched_at: new Date().toISOString() })
          .eq('id', stripeId)
        
        await supabase
          .from('plaid_transactions')
          .update({ 
            stripe_payout_id: stripeTxn.stripe_id, 
            is_stripe_payout: true, 
            match_status: 'matched', 
            matched_transaction_id: stripeTxn.transaction_id, 
            match_confidence: 1.0 
          })
          .eq('id', bankId)
          .eq('ledger_id', ledger.id)

        return jsonResponse({ success: true, message: 'Payout linked to bank deposit' }, 200, req, requestId)
      }

      default:
        return errorResponse(`Unknown action: ${body.action}`, 400, req, requestId)
    }
  }
)

Deno.serve(handler)
