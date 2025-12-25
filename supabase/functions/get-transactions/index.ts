// Soledgic Edge Function: Get Transactions
// GET /get-transactions
// Returns transaction history with filtering and pagination
// SECURITY HARDENED VERSION v2 - Uses createHandler

import { 
  createHandler,
  jsonResponse,
  errorResponse,
  validateId,
  LedgerContext,
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface TransactionWithEntries {
  id: string
  transaction_type: string
  reference_id: string | null
  reference_type: string | null
  description: string | null
  amount: number
  currency: string
  status: string
  metadata: Record<string, any>
  created_at: string
  entries: Array<{
    id: string
    account_id: string
    entry_type: 'debit' | 'credit'
    amount: number
    account?: {
      account_type: string
      entity_id: string | null
      name: string
    }
  }>
}

const handler = createHandler(
  { endpoint: 'get-transactions', requireAuth: true, rateLimit: true },
  async (req: Request, supabase: SupabaseClient, ledger: LedgerContext | null, _body: any) => {
    // Only allow GET
    if (req.method !== 'GET') {
      return errorResponse('Method not allowed', 405, req)
    }

    if (!ledger) {
      return errorResponse('Ledger not found', 401, req)
    }

    // Parse and validate query params
    const url = new URL(req.url)
    const rawCreatorId = url.searchParams.get('creator_id')
    const rawTransactionType = url.searchParams.get('type')
    const rawStatus = url.searchParams.get('status')
    const rawStartDate = url.searchParams.get('start_date')
    const rawEndDate = url.searchParams.get('end_date')
    const rawPage = url.searchParams.get('page')
    const rawPerPage = url.searchParams.get('per_page')
    const includeEntries = url.searchParams.get('include_entries') !== 'false'

    // Validate inputs
    const creatorId = rawCreatorId ? validateId(rawCreatorId, 100) : null
    const transactionType = rawTransactionType ? validateId(rawTransactionType, 50) : null
    const status = rawStatus ? validateId(rawStatus, 20) : null
    
    // Validate dates (basic ISO date format)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    const startDate = rawStartDate && dateRegex.test(rawStartDate) ? rawStartDate : null
    const endDate = rawEndDate && dateRegex.test(rawEndDate) ? rawEndDate : null

    // SECURITY: Validate pagination with proper NaN handling
    const parsedPage = parseInt(rawPage || '1', 10)
    const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1

    const parsedPerPage = parseInt(rawPerPage || '50', 10)
    const perPage = Number.isInteger(parsedPerPage) && parsedPerPage > 0
      ? Math.min(100, parsedPerPage)
      : 50

    // Build query
    let query = supabase
      .from('transactions')
      .select(`
        id,
        transaction_type,
        reference_id,
        reference_type,
        description,
        amount,
        currency,
        status,
        metadata,
        created_at
        ${includeEntries ? `,entries(id, account_id, entry_type, amount, accounts(account_type, entity_id, name))` : ''}
      `, { count: 'exact' })
      .eq('ledger_id', ledger.id)
      .order('created_at', { ascending: false })

    // Apply filters
    if (transactionType) {
      query = query.eq('transaction_type', transactionType)
    }
    if (status) {
      query = query.eq('status', status)
    }
    if (startDate) {
      query = query.gte('created_at', startDate)
    }
    if (endDate) {
      query = query.lte('created_at', endDate + 'T23:59:59Z')
    }
    if (creatorId) {
      query = query.contains('metadata', { creator_id: creatorId })
    }

    // Pagination
    const from = (page - 1) * perPage
    const to = from + perPage - 1
    query = query.range(from, to)

    const { data: transactions, error, count } = await query

    if (error) {
      console.error('Failed to fetch transactions:', error)
      return errorResponse('Failed to fetch transactions', 500, req)
    }

    // Format response
    const formattedTransactions = (transactions || []).map((tx: any) => {
      const formatted: TransactionWithEntries = {
        id: tx.id,
        transaction_type: tx.transaction_type,
        reference_id: tx.reference_id,
        reference_type: tx.reference_type,
        description: tx.description,
        amount: Number(tx.amount),
        currency: tx.currency,
        status: tx.status,
        metadata: tx.metadata || {},
        created_at: tx.created_at,
        entries: []
      }

      if (includeEntries && tx.entries) {
        formatted.entries = tx.entries.map((e: any) => ({
          id: e.id,
          account_id: e.account_id,
          entry_type: e.entry_type,
          amount: Number(e.amount),
          account: e.accounts ? {
            account_type: e.accounts.account_type,
            entity_id: e.accounts.entity_id,
            name: e.accounts.name
          } : undefined
        }))
      }

      return formatted
    })

    const totalPages = Math.ceil((count || 0) / perPage)

    return jsonResponse({
      success: true,
      transactions: formattedTransactions,
      pagination: {
        total: count || 0,
        page,
        per_page: perPage,
        total_pages: totalPages
      }
    }, 200, req)
  }
)

Deno.serve(handler)
