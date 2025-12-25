// Soledgic Edge Function: Record Internal Transfer
// POST /record-transfer
// Move money between accounts (tax reserve, owner draw, etc.)
// SECURITY HARDENED VERSION

import { 
  getCorsHeaders,
  getSupabaseClient,
  validateApiKey,
  jsonResponse,
  errorResponse,
  validateId,
  validateAmount,
  validateString,
  getClientIp
} from '../_shared/utils.ts'

interface RecordTransferRequest {
  from_account_type: string
  to_account_type: string
  amount: number
  transfer_type: 'tax_reserve' | 'payout_reserve' | 'owner_draw' | 
                 'owner_contribution' | 'operating' | 'savings' | 'investment' | 'other'
  description?: string
  reference_id?: string
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

    const body: RecordTransferRequest = await req.json()

    // Validate inputs
    const fromAccountType = validateId(body.from_account_type, 50)
    const toAccountType = validateId(body.to_account_type, 50)
    const amount = validateAmount(body.amount)
    const transferType = validateId(body.transfer_type, 30)

    if (!fromAccountType || !toAccountType) {
      return errorResponse('Invalid account types', 400, req)
    }
    if (amount === null || amount <= 0) {
      return errorResponse('Invalid amount: must be positive integer (cents)', 400, req)
    }
    if (!transferType) {
      return errorResponse('Invalid transfer_type', 400, req)
    }

    const description = body.description ? validateString(body.description, 500) : null
    const referenceId = body.reference_id ? validateId(body.reference_id, 255) : `xfer_${Date.now()}`

    // Get from account
    const { data: fromAccount, error: fromError } = await supabase
      .from('accounts')
      .select('id, name, balance')
      .eq('ledger_id', ledger.id)
      .eq('account_type', fromAccountType)
      .is('entity_id', null)
      .single()

    if (fromError || !fromAccount) {
      return errorResponse(`From account not found: ${fromAccountType}`, 400, req)
    }

    // Get or create to account
    let toAccount
    const { data: existingTo } = await supabase
      .from('accounts')
      .select('id, name')
      .eq('ledger_id', ledger.id)
      .eq('account_type', toAccountType)
      .is('entity_id', null)
      .single()

    if (existingTo) {
      toAccount = existingTo
    } else {
      const accountNames: Record<string, string> = {
        'tax_reserve': 'Tax Reserve',
        'owner_draw': 'Owner\'s Draws',
        'owner_equity': 'Owner\'s Equity',
        'payout_reserve': 'Payout Reserve',
        'savings': 'Savings',
        'investment': 'Investment Account'
      }

      const { data: newAccount, error: createError } = await supabase
        .from('accounts')
        .insert({
          ledger_id: ledger.id,
          account_type: toAccountType,
          entity_type: 'platform',
          name: accountNames[toAccountType] || toAccountType,
          balance: 0,
          currency: 'USD'
        })
        .select('id, name')
        .single()

      if (createError) {
        console.error('Failed to create account:', createError)
        return errorResponse('Failed to create destination account', 500, req)
      }
      toAccount = newAccount
    }

    const transferAmount = amount / 100

    // Create transfer transaction
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        ledger_id: ledger.id,
        transaction_type: 'transfer',
        reference_id: referenceId,
        reference_type: 'internal_transfer',
        description: description || `${transferType}: ${fromAccount.name} → ${toAccount.name}`,
        amount: transferAmount,
        currency: 'USD',
        status: 'completed',
        metadata: {
          transfer_type: transferType,
          from_account: fromAccountType,
          to_account: toAccountType
        }
      })
      .select('id')
      .single()

    if (txError) {
      console.error('Failed to create transaction:', txError)
      return errorResponse('Failed to create transfer transaction', 500, req)
    }

    // Create entries
    const entries = [
      { transaction_id: transaction.id, account_id: toAccount.id, entry_type: 'debit', amount: transferAmount },
      { transaction_id: transaction.id, account_id: fromAccount.id, entry_type: 'credit', amount: transferAmount }
    ]

    await supabase.from('entries').insert(entries)

    // Create transfer record
    const { data: transfer } = await supabase
      .from('internal_transfers')
      .insert({
        ledger_id: ledger.id,
        transaction_id: transaction.id,
        from_account_id: fromAccount.id,
        to_account_id: toAccount.id,
        amount: transferAmount,
        currency: 'USD',
        transfer_type: transferType,
        description: description,
        executed_at: new Date().toISOString()
      })
      .select('id')
      .single()

    // Audit log
    supabase.from('audit_log').insert({
      ledger_id: ledger.id,
      action: 'record_transfer',
      entity_type: 'internal_transfer',
      entity_id: transfer?.id,
      actor_type: 'api',
      ip_address: getClientIp(req),
      user_agent: req.headers.get('user-agent'),
      request_body: { 
        amount: transferAmount, 
        type: transferType,
        from: fromAccountType,
        to: toAccountType
      }
    }).then(() => {}).catch(() => {})

    return jsonResponse({
      success: true,
      transfer_id: transfer?.id,
      transaction_id: transaction.id,
      amount: transferAmount,
      from_account: fromAccount.name,
      to_account: toAccount.name
    }, 200, req)

  } catch (error: any) {
    console.error('Error recording transfer:', error)
    return errorResponse('Internal server error', 500, req)
  }
})
