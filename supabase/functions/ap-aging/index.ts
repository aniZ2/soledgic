// Soledgic Edge Function: Accounts Payable Aging Report
// GET /ap-aging
// Shows outstanding bills grouped by age (current, 1-30, 31-60, 61-90, 90+ days)
// SECURITY HARDENED VERSION

import { 
  createHandler,
  jsonResponse, 
  errorResponse,
  getClientIp,
  LedgerContext
} from '../_shared/utils.ts'

interface BillDetail {
  transaction_id: string
  bill_number: string | null
  vendor_name: string | null
  vendor_id: string | null
  bill_date: string
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
  bills: BillDetail[]
  total_amount: number
  bill_count: number
}

interface APAgingResponse {
  success: boolean
  as_of_date: string
  summary: {
    total_payables: number
    total_current: number
    total_overdue: number
    total_bills: number
    average_days_outstanding: number
    oldest_bill_days: number
    cash_needed_30_days: number
  }
  aging_buckets: AgingBucket[]
  top_vendors: Array<{
    vendor_name: string
    vendor_id: string | null
    total_owed: number
    bill_count: number
    oldest_days: number
    next_due_date: string | null
  }>
  upcoming_due: Array<{
    transaction_id: string
    vendor_name: string | null
    amount: number
    due_date: string
    days_until_due: number
  }>
}

const handler = createHandler(
  { endpoint: 'ap-aging', requireAuth: true, rateLimit: true },
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

    // Get the AP account
    const { data: apAccount } = await supabase
      .from('accounts')
      .select('id')
      .eq('ledger_id', ledger.id)
      .eq('account_type', 'accounts_payable')
      .single()

    if (!apAccount) {
      // No AP account means no payables
      return jsonResponse({
        success: true,
        as_of_date: asOfDateStr,
        summary: {
          total_payables: 0,
          total_current: 0,
          total_overdue: 0,
          total_bills: 0,
          average_days_outstanding: 0,
          oldest_bill_days: 0,
          cash_needed_30_days: 0
        },
        aging_buckets: [],
        top_vendors: [],
        upcoming_due: []
      }, 200, req, requestId)
    }

    // Get all transactions that have credit entries to AP (bills created)
    // Credit to AP = bill created (liability increases)
    // Debit to AP = bill paid (liability decreases)
    // NOTE: We do NOT filter by reversed_by - entries from reversed transactions
    // are canceled out by their reversal entries naturally (consistent with balance sheet)
    const { data: billEntries, error: entriesError } = await supabase
      .from('entries')
      .select(`
        amount,
        entry_type,
        transaction:transactions!inner(
          id,
          reference_id,
          description,
          merchant_name,
          created_at,
          status,
          metadata,
          reversed_by
        )
      `)
      .eq('account_id', apAccount.id)
      .eq('transactions.ledger_id', ledger.id)
      .eq('transactions.status', 'completed')
      .lte('transactions.created_at', asOfDateStr + 'T23:59:59Z')

    if (entriesError) {
      console.error('Failed to fetch AP entries:', entriesError)
      return errorResponse('Failed to fetch payables', 500, req, requestId)
    }

    // Calculate TOTAL AP balance from entries (for consistency with balance sheet)
    // For AP: Credits increase liability, Debits decrease
    let totalAPFromEntries = 0
    for (const entry of billEntries || []) {
      if (entry.entry_type === 'credit') {
        totalAPFromEntries += Number(entry.amount)
      } else {
        totalAPFromEntries -= Number(entry.amount)
      }
    }

    // Calculate net balance per transaction
    // Credit = bill created (increases AP)
    // Debit = payment made (decreases AP)
    const transactionBalances: Record<string, {
      transaction: any
      debits: number
      credits: number
      balance: number
    }> = {}

    for (const entry of billEntries || []) {
      const txId = entry.transaction.id
      if (!transactionBalances[txId]) {
        transactionBalances[txId] = {
          transaction: entry.transaction,
          debits: 0,
          credits: 0,
          balance: 0
        }
      }

      if (entry.entry_type === 'debit') {
        transactionBalances[txId].debits += Number(entry.amount)
      } else {
        transactionBalances[txId].credits += Number(entry.amount)
      }
    }

    // Calculate balance and filter to only unpaid/partially paid
    const bills: BillDetail[] = []

    for (const txId in transactionBalances) {
      const data = transactionBalances[txId]
      // For AP: Credits increase liability, Debits decrease
      // So balance = credits - debits
      const balance = data.credits - data.debits

      // Skip fully paid bills
      if (balance <= 0.005) continue

      const billDate = new Date(data.transaction.created_at)
      const metadata = data.transaction.metadata || {}
      
      // Calculate due date (default: 30 days from bill date if not specified)
      let dueDate: Date
      if (metadata.due_date) {
        dueDate = new Date(metadata.due_date)
      } else {
        dueDate = new Date(billDate)
        dueDate.setDate(dueDate.getDate() + 30)
      }

      const daysOutstanding = Math.floor((asOfDate.getTime() - billDate.getTime()) / (1000 * 60 * 60 * 24))
      const isOverdue = asOfDate > dueDate

      bills.push({
        transaction_id: txId,
        bill_number: data.transaction.reference_id || null,
        vendor_name: data.transaction.merchant_name || metadata.vendor_name || null,
        vendor_id: metadata.vendor_id || null,
        bill_date: billDate.toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0],
        original_amount: Math.round(data.credits * 100) / 100,
        paid_amount: Math.round(data.debits * 100) / 100,
        balance_due: Math.round(balance * 100) / 100,
        days_outstanding: daysOutstanding,
        status: isOverdue ? 'overdue' : 'current'
      })
    }

    // Define aging buckets
    const buckets: AgingBucket[] = [
      { label: 'Current (0-30 days)', min_days: 0, max_days: 30, bills: [], total_amount: 0, bill_count: 0 },
      { label: '31-60 days', min_days: 31, max_days: 60, bills: [], total_amount: 0, bill_count: 0 },
      { label: '61-90 days', min_days: 61, max_days: 90, bills: [], total_amount: 0, bill_count: 0 },
      { label: 'Over 90 days', min_days: 91, max_days: null, bills: [], total_amount: 0, bill_count: 0 }
    ]

    // Sort bills into buckets
    for (const bill of bills) {
      for (const bucket of buckets) {
        const inBucket = bill.days_outstanding >= bucket.min_days && 
          (bucket.max_days === null || bill.days_outstanding <= bucket.max_days)
        
        if (inBucket) {
          bucket.bills.push(bill)
          bucket.total_amount += bill.balance_due
          bucket.bill_count++
          break
        }
      }
    }

    // Round bucket totals
    for (const bucket of buckets) {
      bucket.total_amount = Math.round(bucket.total_amount * 100) / 100
      // Sort bills by days outstanding (oldest first)
      bucket.bills.sort((a, b) => b.days_outstanding - a.days_outstanding)
    }

    // Calculate summary - use totalAPFromEntries for consistency with balance sheet
    // This ensures AP aging total matches balance sheet AP exactly
    const totalPayables = Math.round(totalAPFromEntries * 100) / 100
    const totalCurrent = buckets[0].total_amount
    const totalOverdue = Math.max(0, totalPayables - totalCurrent)
    const avgDaysOutstanding = bills.length > 0 
      ? Math.round(bills.reduce((sum, bill) => sum + bill.days_outstanding, 0) / bills.length)
      : 0
    const oldestDays = bills.length > 0
      ? Math.max(...bills.map(bill => bill.days_outstanding))
      : 0

    // Calculate cash needed in next 30 days
    const thirtyDaysFromNow = new Date(asOfDate)
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
    const cashNeeded30Days = bills
      .filter(bill => bill.due_date && new Date(bill.due_date) <= thirtyDaysFromNow)
      .reduce((sum, bill) => sum + bill.balance_due, 0)

    // Top vendors by amount owed
    const vendorTotals: Record<string, {
      vendor_name: string
      vendor_id: string | null
      total_owed: number
      bill_count: number
      oldest_days: number
      next_due_date: string | null
    }> = {}

    for (const bill of bills) {
      const key = bill.vendor_id || bill.vendor_name || 'Unknown'
      if (!vendorTotals[key]) {
        vendorTotals[key] = {
          vendor_name: bill.vendor_name || 'Unknown',
          vendor_id: bill.vendor_id,
          total_owed: 0,
          bill_count: 0,
          oldest_days: 0,
          next_due_date: null
        }
      }
      vendorTotals[key].total_owed += bill.balance_due
      vendorTotals[key].bill_count++
      vendorTotals[key].oldest_days = Math.max(vendorTotals[key].oldest_days, bill.days_outstanding)
      
      // Track earliest due date
      if (bill.due_date) {
        if (!vendorTotals[key].next_due_date || bill.due_date < vendorTotals[key].next_due_date) {
          vendorTotals[key].next_due_date = bill.due_date
        }
      }
    }

    const topVendors = Object.values(vendorTotals)
      .sort((a, b) => b.total_owed - a.total_owed)
      .slice(0, 10)
      .map(v => ({
        ...v,
        total_owed: Math.round(v.total_owed * 100) / 100
      }))

    // Upcoming due (next 14 days)
    const fourteenDaysFromNow = new Date(asOfDate)
    fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14)
    
    const upcomingDue = bills
      .filter(bill => {
        if (!bill.due_date) return false
        const dueDate = new Date(bill.due_date)
        return dueDate >= asOfDate && dueDate <= fourteenDaysFromNow
      })
      .map(bill => ({
        transaction_id: bill.transaction_id,
        vendor_name: bill.vendor_name,
        amount: bill.balance_due,
        due_date: bill.due_date!,
        days_until_due: Math.ceil((new Date(bill.due_date!).getTime() - asOfDate.getTime()) / (1000 * 60 * 60 * 24))
      }))
      .sort((a, b) => a.days_until_due - b.days_until_due)
      .slice(0, 20)

    // Audit log
    await supabase.from('audit_log').insert({
      ledger_id: ledger.id,
      action: 'ap_aging_report',
      entity_type: 'report',
      actor_type: 'api',
      ip_address: getClientIp(req),
      request_id: requestId,
      request_body: { as_of_date: asOfDateStr },
      response_status: 200
    })

    const response: APAgingResponse = {
      success: true,
      as_of_date: asOfDateStr,
      summary: {
        total_payables: Math.round(totalPayables * 100) / 100,
        total_current: Math.round(totalCurrent * 100) / 100,
        total_overdue: Math.round(totalOverdue * 100) / 100,
        total_bills: bills.length,
        average_days_outstanding: avgDaysOutstanding,
        oldest_bill_days: oldestDays,
        cash_needed_30_days: Math.round(cashNeeded30Days * 100) / 100
      },
      aging_buckets: buckets,
      top_vendors: topVendors,
      upcoming_due: upcomingDue
    }

    return jsonResponse(response, 200, req, requestId)
  }
)

Deno.serve(handler)
