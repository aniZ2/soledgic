// Soledgic Edge Function: Import Bank Statement
// POST /import-bank-statement - Import CSV bank statement lines for reconciliation
// SECURITY HARDENED VERSION

import { 
  createHandler,
  jsonResponse, 
  errorResponse, 
  validateId, 
  validateString, 
  validateAmount, 
  getClientIp,
  LedgerContext
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface BankStatementLine { 
  transaction_date: string
  post_date?: string
  description: string
  amount: number
  reference_number?: string
  check_number?: string
  merchant_name?: string
  category_hint?: string 
}

interface ImportBankStatementRequest { 
  bank_account_id: string
  lines: BankStatementLine[]
  auto_match?: boolean 
}

const handler = createHandler(
  { endpoint: 'import-bank-statement', requireAuth: true, rateLimit: true },
  async (req: Request, supabase: SupabaseClient, ledger: LedgerContext | null, body: ImportBankStatementRequest) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req)
    }

    const bankAccountId = body.bank_account_id ? validateId(body.bank_account_id, 100) : null
    if (!bankAccountId) return errorResponse('Invalid bank_account_id', 400, req)
    if (!body.lines?.length) return errorResponse('No lines to import', 400, req)
    if (body.lines.length > 5000) return errorResponse('Maximum 5000 lines per import', 400, req)

    const { data: bankAccount } = await supabase
      .from('bank_accounts')
      .select('id, bank_name, account_name')
      .eq('id', bankAccountId)
      .eq('ledger_id', ledger.id)
      .single()
      
    if (!bankAccount) return errorResponse('Bank account not found', 404, req)

    const importBatchId = `import_${Date.now()}`
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/

    const lineRecords = body.lines.map(line => {
      const amount = validateAmount(line.amount)
      if (amount === null) throw new Error('Invalid amount in line')
      if (!line.transaction_date || !dateRegex.test(line.transaction_date)) throw new Error('Invalid transaction_date')

      return {
        ledger_id: ledger.id,
        bank_account_id: bankAccountId,
        transaction_date: line.transaction_date,
        post_date: line.post_date && dateRegex.test(line.post_date) ? line.post_date : null,
        description: validateString(line.description, 500) || 'Unknown',
        amount: amount / 100,
        reference_number: line.reference_number ? validateId(line.reference_number, 100) : null,
        check_number: line.check_number ? validateId(line.check_number, 50) : null,
        merchant_name: line.merchant_name ? validateString(line.merchant_name, 200) : null,
        category_hint: line.category_hint ? validateString(line.category_hint, 100) : null,
        match_status: 'unmatched',
        import_batch_id: importBatchId,
        raw_data: line
      }
    })

    const { error: insertError } = await supabase.from('bank_statement_lines').insert(lineRecords)
    if (insertError) return errorResponse('Failed to import lines', 500, req)

    let matchedCount = 0, unmatchedCount = body.lines.length

    if (body.auto_match) {
      for (const line of lineRecords) {
        const { data: matchingTx } = await supabase
          .from('transactions')
          .select('id')
          .eq('ledger_id', ledger.id)
          .eq('amount', Math.abs(line.amount))
          .gte('created_at', new Date(new Date(line.transaction_date).getTime() - 2*24*60*60*1000).toISOString())
          .lte('created_at', new Date(new Date(line.transaction_date).getTime() + 2*24*60*60*1000).toISOString())
          .limit(1)
          .single()

        if (matchingTx) {
          await supabase
            .from('bank_statement_lines')
            .update({ 
              match_status: 'matched', 
              matched_transaction_id: matchingTx.id, 
              matched_at: new Date().toISOString(), 
              matched_by: 'auto' 
            })
            .eq('ledger_id', ledger.id)
            .eq('import_batch_id', importBatchId)
            .eq('transaction_date', line.transaction_date)
            .eq('amount', line.amount)
          matchedCount++
          unmatchedCount--
        }
      }
    }

    const totalDeposits = lineRecords.filter(l => l.amount > 0).reduce((sum, l) => sum + l.amount, 0)
    const totalWithdrawals = lineRecords.filter(l => l.amount < 0).reduce((sum, l) => sum + Math.abs(l.amount), 0)

    supabase.from('audit_log').insert({ 
      ledger_id: ledger.id, 
      action: 'import_bank_statement', 
      entity_type: 'bank_statement_lines', 
      actor_type: 'api', 
      ip_address: getClientIp(req), 
      request_body: { 
        bank_account_id: bankAccountId, 
        line_count: body.lines.length, 
        auto_match: body.auto_match 
      } 
    }).then(() => {}).catch(() => {})

    return jsonResponse({
      success: true,
      import_batch_id: importBatchId,
      bank_account: `${bankAccount.bank_name} - ${bankAccount.account_name}`,
      summary: { 
        lines_imported: body.lines.length, 
        total_deposits: Math.round(totalDeposits * 100) / 100, 
        total_withdrawals: Math.round(totalWithdrawals * 100) / 100, 
        matched: matchedCount, 
        unmatched: unmatchedCount 
      }
    }, 200, req)
  }
)

Deno.serve(handler)
