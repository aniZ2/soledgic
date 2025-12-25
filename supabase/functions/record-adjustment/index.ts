// Soledgic Edge Function: Record Adjustment Journal
// POST /record-adjustment
// Create CPA-style adjusting entries
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

interface AdjustmentEntry {
  account_type: string
  entity_id?: string
  entry_type: 'debit' | 'credit'
  amount: number
}

interface RecordAdjustmentRequest {
  adjustment_type: string
  adjustment_date?: string
  entries: AdjustmentEntry[]
  reason: string
  original_transaction_id?: string
  supporting_documentation?: string
  prepared_by: string
}

const VALID_ADJUSTMENT_TYPES = ['correction', 'reclassification', 'accrual', 'deferral', 
  'depreciation', 'write_off', 'year_end', 'opening_balance', 'other']

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

    const body: RecordAdjustmentRequest = await req.json()

    // Validate required fields
    if (!body.adjustment_type || !VALID_ADJUSTMENT_TYPES.includes(body.adjustment_type)) {
      return errorResponse(`Invalid adjustment_type. Must be one of: ${VALID_ADJUSTMENT_TYPES.join(', ')}`, 400, req)
    }

    const reason = validateString(body.reason, 1000)
    const preparedBy = validateString(body.prepared_by, 200)

    if (!reason) {
      return errorResponse('Invalid or missing reason', 400, req)
    }
    if (!preparedBy) {
      return errorResponse('Invalid or missing prepared_by', 400, req)
    }

    if (!body.entries || !Array.isArray(body.entries) || body.entries.length < 2) {
      return errorResponse('Adjustment must have at least 2 entries (debit and credit)', 400, req)
    }

    // Validate entries balance
    let totalDebits = 0
    let totalCredits = 0
    for (const entry of body.entries) {
      const amount = validateAmount(entry.amount)
      if (amount === null || amount <= 0) {
        return errorResponse('Invalid entry amount', 400, req)
      }
      if (!['debit', 'credit'].includes(entry.entry_type)) {
        return errorResponse('Invalid entry_type: must be debit or credit', 400, req)
      }
      if (entry.entry_type === 'debit') {
        totalDebits += entry.amount
      } else {
        totalCredits += entry.amount
      }
    }

    if (Math.abs(totalDebits - totalCredits) > 1) {
      return jsonResponse({ 
        success: false, 
        error: `Entries must balance`,
        details: { debits: totalDebits, credits: totalCredits }
      }, 400, req)
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    const adjustmentDate = body.adjustment_date && dateRegex.test(body.adjustment_date) 
      ? body.adjustment_date 
      : new Date().toISOString().split('T')[0]
    const totalAmount = totalDebits / 100

    // Create adjustment transaction
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        ledger_id: ledger.id,
        transaction_type: 'adjustment',
        reference_id: `adj_${Date.now()}`,
        reference_type: 'adjustment_journal',
        description: `${body.adjustment_type}: ${reason}`,
        amount: totalAmount,
        currency: 'USD',
        status: 'completed',
        correction_type: body.adjustment_type === 'correction' ? 'adjustment' : null,
        correction_reason_detail: reason,
        reverses: body.original_transaction_id ? validateId(body.original_transaction_id, 100) : null,
        metadata: {
          adjustment_type: body.adjustment_type,
          prepared_by: preparedBy,
          adjustment_date: adjustmentDate
        }
      })
      .select('id')
      .single()

    if (txError) {
      console.error('Failed to create transaction:', txError)
      return errorResponse('Failed to create adjustment transaction', 500, req)
    }

    // Create entries
    const entryRecords = []
    for (const entry of body.entries) {
      const accountType = validateId(entry.account_type, 50)
      if (!accountType) {
        return errorResponse(`Invalid account_type: ${entry.account_type}`, 400, req)
      }

      let accountQuery = supabase
        .from('accounts')
        .select('id')
        .eq('ledger_id', ledger.id)
        .eq('account_type', accountType)

      if (entry.entity_id) {
        const entityId = validateId(entry.entity_id, 100)
        if (!entityId) {
          return errorResponse(`Invalid entity_id: ${entry.entity_id}`, 400, req)
        }
        accountQuery = accountQuery.eq('entity_id', entityId)
      } else {
        accountQuery = accountQuery.is('entity_id', null)
      }

      const { data: account } = await accountQuery.single()

      if (!account) {
        return errorResponse(`Account not found: ${accountType}${entry.entity_id ? ` (${entry.entity_id})` : ''}`, 400, req)
      }

      entryRecords.push({
        transaction_id: transaction.id,
        account_id: account.id,
        entry_type: entry.entry_type,
        amount: entry.amount / 100
      })
    }

    await supabase.from('entries').insert(entryRecords)

    // Create adjustment journal record
    const { data: adjustment } = await supabase
      .from('adjustment_journals')
      .insert({
        ledger_id: ledger.id,
        transaction_id: transaction.id,
        original_transaction_id: body.original_transaction_id ? validateId(body.original_transaction_id, 100) : null,
        adjustment_type: body.adjustment_type,
        reason: reason,
        supporting_documentation: body.supporting_documentation ? validateString(body.supporting_documentation, 2000) : null,
        prepared_by: preparedBy,
        adjustment_date: adjustmentDate
      })
      .select('id')
      .single()

    // Audit log
    supabase.from('audit_log').insert({
      ledger_id: ledger.id,
      action: 'record_adjustment',
      entity_type: 'adjustment_journal',
      entity_id: adjustment?.id,
      actor_type: 'api',
      ip_address: getClientIp(req),
      user_agent: req.headers.get('user-agent'),
      request_body: { 
        adjustment_type: body.adjustment_type, 
        amount: totalAmount,
        entries: body.entries.length 
      }
    }).then(() => {}).catch(() => {})

    return jsonResponse({
      success: true,
      transaction_id: transaction.id,
      adjustment_id: adjustment?.id,
      entries_created: entryRecords.length
    }, 200, req)

  } catch (error: any) {
    console.error('Error recording adjustment:', error)
    return errorResponse('Internal server error', 500, req)
  }
})
