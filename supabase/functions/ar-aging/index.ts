// Soledgic Edge Function: Accounts Receivable Aging Report
// GET /ar-aging
// Shows outstanding invoices grouped by age (current, 1-30, 31-60, 61-90, 90+ days)
// SECURITY HARDENED VERSION

import { 
  createHandler,
  jsonResponse, 
  errorResponse,
  getClientIp,
  LedgerContext
} from '../_shared/utils.ts'

interface InvoiceDetail {
  transaction_id: string
  invoice_number: string | null
  customer_name: string | null
  customer_id: string | null
  invoice_date: string
  due_date: string | null
  original_amount: number
  paid_amount: number
  balance_due: number
  days_outstanding: number
  status: 'current' | 'overdue'
}

interface AgingBucket {
  label: string
  min_days: number
  max_days: number | null
  invoices: InvoiceDetail[]
  total_amount: number
  invoice_count: number
}

interface ARAgingResponse {
  success: boolean
  as_of_date: string
  summary: {
    total_receivables: number
    total_current: number
    total_overdue: number
    total_invoices: number
    average_days_outstanding: number
    oldest_invoice_days: number
  }
  aging_buckets: AgingBucket[]
  top_customers: Array<{
    customer_name: string
    customer_id: string | null
    total_owed: number
    invoice_count: number
    oldest_days: number
  }>
}

const handler = createHandler(
  { endpoint: 'ar-aging', requireAuth: true, rateLimit: true },
  async (req, supabase, ledger: LedgerContext | null, _body, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    if (req.method !== 'GET') {
      return errorResponse('Method not allowed', 405, req, requestId)
    }

    const url = new URL(req.url)
    const asOfDateParam = url.searchParams.get('as_of_date')
    const asOfDate = asOfDateParam ? new Date(asOfDateParam) : new Date()
    const asOfDateStr = asOfDate.toISOString().split('T')[0]

    // Validate date
    if (isNaN(asOfDate.getTime())) {
      return errorResponse('Invalid date format. Use YYYY-MM-DD', 400, req, requestId)
    }

    // Get all invoice transactions (income recorded but not yet paid)
    // In Soledgic, invoices are transactions with transaction_type = 'invoice' or 'income' 
    // that have corresponding entries in accounts_receivable
    
    // First, get the AR account
    const { data: arAccount } = await supabase
      .from('accounts')
      .select('id')
      .eq('ledger_id', ledger.id)
      .eq('account_type', 'accounts_receivable')
      .single()

    if (!arAccount) {
      // No AR account means no receivables
      return jsonResponse({
        success: true,
        as_of_date: asOfDateStr,
        summary: {
          total_receivables: 0,
          total_current: 0,
          total_overdue: 0,
          total_invoices: 0,
          average_days_outstanding: 0,
          oldest_invoice_days: 0
        },
        aging_buckets: [],
        top_customers: []
      }, 200, req, requestId)
    }

    // APPROACH: Use AR entries as source of truth (consistent with balance sheet)
    // This ensures AR aging matches the balance sheet AR balance exactly
    // NOTE: We do NOT filter by reversed_by - entries from reversed transactions
    // are canceled out by their reversal entries naturally
    const { data: arEntries, error: entriesError } = await supabase
      .from('entries')
      .select(`
        amount,
        entry_type,
        transaction:transactions!inner(
          id,
          reference_id,
          description,
          created_at,
          status,
          metadata,
          reversed_by
        )
      `)
      .eq('account_id', arAccount.id)
      .eq('transactions.ledger_id', ledger.id)
      .eq('transactions.status', 'completed')
      .lte('transactions.created_at', asOfDateStr + 'T23:59:59Z')

    if (entriesError) {
      console.error('Failed to fetch AR entries:', entriesError)
      return errorResponse('Failed to fetch receivables', 500, req, requestId)
    }

    // Calculate TOTAL AR balance (for consistency check with balance sheet)
    let totalARFromEntries = 0
    for (const entry of arEntries || []) {
      if (entry.entry_type === 'debit') {
        totalARFromEntries += Number(entry.amount)
      } else {
        totalARFromEntries -= Number(entry.amount)
      }
    }

    // Aggregate by invoice_id to properly match payments to invoices
    // - Debit entries (invoice creation) have invoice_id in metadata
    // - Credit entries (payments) have invoice_id in metadata
    const invoiceBalances: Record<string, {
      invoiceTransaction: any
      debits: number
      credits: number
    }> = {}

    for (const entry of arEntries || []) {
      const tx = entry.transaction
      const metadata = tx.metadata || {}
      // invoice_id could be in metadata for payments, or the transaction itself is the invoice
      // Note: receive-payment uses 'original_invoice_id' for the reference
      const invoiceId = metadata.invoice_id || metadata.original_invoice_id || tx.id

      if (!invoiceBalances[invoiceId]) {
        invoiceBalances[invoiceId] = {
          invoiceTransaction: tx,
          debits: 0,
          credits: 0
        }
      }

      // For the original invoice transaction, update with its details
      if (tx.id === invoiceId && entry.entry_type === 'debit') {
        invoiceBalances[invoiceId].invoiceTransaction = tx
      }

      if (entry.entry_type === 'debit') {
        invoiceBalances[invoiceId].debits += Number(entry.amount)
      } else {
        invoiceBalances[invoiceId].credits += Number(entry.amount)
      }
    }

    // Build invoices list from aggregated balances
    const invoices: InvoiceDetail[] = []

    for (const invoiceId in invoiceBalances) {
      const data = invoiceBalances[invoiceId]
      const balance = data.debits - data.credits

      // Skip fully paid (no outstanding balance)
      if (balance <= 0.005) continue

      const tx = data.invoiceTransaction
      const invoiceDate = new Date(tx.created_at)
      const metadata = tx.metadata || {}

      let dueDate: Date
      if (metadata.due_date) {
        dueDate = new Date(metadata.due_date)
      } else {
        dueDate = new Date(invoiceDate)
        dueDate.setDate(dueDate.getDate() + 30)
      }

      const daysOutstanding = Math.floor((asOfDate.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24))
      const isOverdue = asOfDate > dueDate

      invoices.push({
        transaction_id: invoiceId,
        invoice_number: tx.reference_id || null,
        customer_name: metadata.customer_name || null,
        customer_id: metadata.customer_id || null,
        invoice_date: invoiceDate.toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0],
        original_amount: Math.round(data.debits * 100) / 100,
        paid_amount: Math.round(data.credits * 100) / 100,
        balance_due: Math.round(balance * 100) / 100,
        days_outstanding: daysOutstanding,
        status: isOverdue ? 'overdue' : 'current'
      })
    }

    // Define aging buckets
    const buckets: AgingBucket[] = [
      { label: 'Current (0-30 days)', min_days: 0, max_days: 30, invoices: [], total_amount: 0, invoice_count: 0 },
      { label: '31-60 days', min_days: 31, max_days: 60, invoices: [], total_amount: 0, invoice_count: 0 },
      { label: '61-90 days', min_days: 61, max_days: 90, invoices: [], total_amount: 0, invoice_count: 0 },
      { label: 'Over 90 days', min_days: 91, max_days: null, invoices: [], total_amount: 0, invoice_count: 0 }
    ]

    // Sort invoices into buckets
    for (const invoice of invoices) {
      for (const bucket of buckets) {
        const inBucket = invoice.days_outstanding >= bucket.min_days && 
          (bucket.max_days === null || invoice.days_outstanding <= bucket.max_days)
        
        if (inBucket) {
          bucket.invoices.push(invoice)
          bucket.total_amount += invoice.balance_due
          bucket.invoice_count++
          break
        }
      }
    }

    // Round bucket totals
    for (const bucket of buckets) {
      bucket.total_amount = Math.round(bucket.total_amount * 100) / 100
      // Sort invoices by days outstanding (oldest first)
      bucket.invoices.sort((a, b) => b.days_outstanding - a.days_outstanding)
    }

    // Calculate summary - use totalARFromEntries for consistency with balance sheet
    // This ensures AR aging total matches balance sheet AR exactly
    const totalReceivables = Math.round(totalARFromEntries * 100) / 100
    const totalCurrent = buckets[0].total_amount
    const totalOverdue = Math.max(0, totalReceivables - totalCurrent)
    const avgDaysOutstanding = invoices.length > 0 
      ? Math.round(invoices.reduce((sum, inv) => sum + inv.days_outstanding, 0) / invoices.length)
      : 0
    const oldestDays = invoices.length > 0
      ? Math.max(...invoices.map(inv => inv.days_outstanding))
      : 0

    // Top customers by amount owed
    const customerTotals: Record<string, {
      customer_name: string
      customer_id: string | null
      total_owed: number
      invoice_count: number
      oldest_days: number
    }> = {}

    for (const invoice of invoices) {
      const key = invoice.customer_id || invoice.customer_name || 'Unknown'
      if (!customerTotals[key]) {
        customerTotals[key] = {
          customer_name: invoice.customer_name || 'Unknown',
          customer_id: invoice.customer_id,
          total_owed: 0,
          invoice_count: 0,
          oldest_days: 0
        }
      }
      customerTotals[key].total_owed += invoice.balance_due
      customerTotals[key].invoice_count++
      customerTotals[key].oldest_days = Math.max(customerTotals[key].oldest_days, invoice.days_outstanding)
    }

    const topCustomers = Object.values(customerTotals)
      .sort((a, b) => b.total_owed - a.total_owed)
      .slice(0, 10)
      .map(c => ({
        ...c,
        total_owed: Math.round(c.total_owed * 100) / 100
      }))

    // Audit log
    await supabase.from('audit_log').insert({
      ledger_id: ledger.id,
      action: 'ar_aging_report',
      entity_type: 'report',
      actor_type: 'api',
      ip_address: getClientIp(req),
      request_id: requestId,
      request_body: { as_of_date: asOfDateStr },
      response_status: 200
    })

    const response: ARAgingResponse = {
      success: true,
      as_of_date: asOfDateStr,
      summary: {
        total_receivables: Math.round(totalReceivables * 100) / 100,
        total_current: Math.round(totalCurrent * 100) / 100,
        total_overdue: Math.round(totalOverdue * 100) / 100,
        total_invoices: invoices.length,
        average_days_outstanding: avgDaysOutstanding,
        oldest_invoice_days: oldestDays
      },
      aging_buckets: buckets,
      top_customers: topCustomers
    }

    return jsonResponse(response, 200, req, requestId)
  }
)

Deno.serve(handler)
