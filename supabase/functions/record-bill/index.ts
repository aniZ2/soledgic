// Soledgic Edge Function: Record Bill
// POST /record-bill
// Records a bill (accounts payable) - works for any ledger mode
// SECURITY HARDENED VERSION

import { 
  getCorsHeaders,
  getSupabaseClient,
  validateApiKey,
  jsonResponse,
  errorResponse,
  validateId,
  validateString,
  validateAmount,
  getClientIp
} from '../_shared/utils.ts'

interface RecordBillRequest {
  amount: number
  description: string
  vendor_name: string
  vendor_id?: string
  reference_id?: string
  due_date?: string
  expense_category?: string
  paid?: boolean
  metadata?: Record<string, any>
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  try {
    const apiKey = req.headers.get('x-api-key')
    if (!apiKey) {
      return errorResponse('Missing API key', 401, req)
    }

    const supabase = getSupabaseClient()
    const ledger = await validateApiKey(supabase, apiKey)

    if (!ledger) {
      return errorResponse('Invalid API key', 401, req)
    }

    if (ledger.status !== 'active') {
      return errorResponse('Ledger is not active', 403, req)
    }

    const body: RecordBillRequest = await req.json()

    // Validate required fields
    const amount = validateAmount(body.amount)
    const description = validateString(body.description, 500)
    const vendorName = validateString(body.vendor_name, 200)

    if (amount === null || amount <= 0) {
      return errorResponse('Invalid amount: must be positive integer (cents)', 400, req)
    }
    if (!description) {
      return errorResponse('Invalid or missing description', 400, req)
    }
    if (!vendorName) {
      return errorResponse('Invalid or missing vendor_name', 400, req)
    }

    const amountInDollars = amount / 100
    const isPaid = body.paid === true

    // Get accounts
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, account_type')
      .eq('ledger_id', ledger.id)
      .in('account_type', ['cash', 'accounts_payable', 'expense'])

    let cashAccount = accounts?.find(a => a.account_type === 'cash')
    let apAccount = accounts?.find(a => a.account_type === 'accounts_payable')
    let expenseAccount = accounts?.find(a => a.account_type === 'expense')

    // Create missing accounts as needed
    if (!expenseAccount) {
      const { data: newExpense } = await supabase
        .from('accounts')
        .insert({
          ledger_id: ledger.id,
          account_type: 'expense',
          entity_type: 'business',
          name: 'Operating Expenses'
        })
        .select('id, account_type')
        .single()
      expenseAccount = newExpense
    }

    if (!apAccount && !isPaid) {
      const { data: newAP } = await supabase
        .from('accounts')
        .insert({
          ledger_id: ledger.id,
          account_type: 'accounts_payable',
          entity_type: 'business',
          name: 'Accounts Payable'
        })
        .select('id, account_type')
        .single()
      apAccount = newAP
    }

    if (!expenseAccount) {
      return errorResponse('Expense account not found', 500, req)
    }

    // Get expense category if provided
    let expenseCategoryId = null
    if (body.expense_category) {
      const categoryCode = validateId(body.expense_category, 50)
      if (categoryCode) {
        const { data: category } = await supabase
          .from('expense_categories')
          .select('id')
          .eq('ledger_id', ledger.id)
          .eq('code', categoryCode)
          .single()
        if (category) expenseCategoryId = category.id
      }
    }

    // Create transaction
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        ledger_id: ledger.id,
        transaction_type: isPaid ? 'expense' : 'bill',
        reference_id: body.reference_id ? validateId(body.reference_id, 255) : null,
        reference_type: 'vendor_bill',
        description: description,
        amount: amountInDollars,
        currency: (ledger.settings as any)?.currency || 'USD',
        status: 'completed',
        expense_category_id: expenseCategoryId,
        merchant_name: vendorName,
        metadata: {
          vendor_id: body.vendor_id ? validateId(body.vendor_id, 100) : null,
          vendor_name: vendorName,
          due_date: body.due_date,
          paid: isPaid
        }
      })
      .select('id')
      .single()

    if (txError) {
      console.error('Failed to create transaction:', txError)
      return errorResponse('Failed to create bill', 500, req)
    }

    // Create entries
    let entries = []
    if (isPaid) {
      if (!cashAccount) {
        return errorResponse('Cash account not found', 500, req)
      }
      entries = [
        { transaction_id: transaction.id, account_id: expenseAccount.id, entry_type: 'debit', amount: amountInDollars },
        { transaction_id: transaction.id, account_id: cashAccount.id, entry_type: 'credit', amount: amountInDollars }
      ]
    } else {
      if (!apAccount) {
        return errorResponse('Accounts Payable account not found', 500, req)
      }
      entries = [
        { transaction_id: transaction.id, account_id: expenseAccount.id, entry_type: 'debit', amount: amountInDollars },
        { transaction_id: transaction.id, account_id: apAccount.id, entry_type: 'credit', amount: amountInDollars }
      ]
    }

    await supabase.from('entries').insert(entries)

    // Audit log
    supabase.from('audit_log').insert({
      ledger_id: ledger.id,
      action: 'record_bill',
      entity_type: 'transaction',
      entity_id: transaction.id,
      actor_type: 'api',
      ip_address: getClientIp(req),
      user_agent: req.headers.get('user-agent'),
      request_body: { amount: amountInDollars, vendor: vendorName, paid: isPaid }
    }).then(() => {}).catch(() => {})

    return jsonResponse({
      success: true,
      transaction_id: transaction.id,
      amount: amountInDollars,
      status: isPaid ? 'paid' : 'pending'
    }, 200, req)

  } catch (error: any) {
    console.error('Error recording bill:', error)
    return errorResponse('Internal server error', 500, req)
  }
})
