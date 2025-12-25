// Soledgic Edge Function: Generate Tax Summary
// POST /generate-tax-summary
// Generate year-end tax summaries for 1099 reporting
// NOTE: Returns amounts only - NO PII stored
// MIGRATED TO createHandler

import { 
  createHandler,
  jsonResponse, 
  errorResponse,
  validateId,
  getClientIp,
  LedgerContext
} from '../_shared/utils.ts'

interface TaxSummaryRequest {
  tax_year: number
  creator_id?: string
}

interface CreatorTaxSummary {
  creator_id: string
  gross_earnings: number
  refunds_issued: number
  net_earnings: number
  total_paid_out: number
  requires_1099: boolean
}

const handler = createHandler(
  { endpoint: 'generate-tax-summary', requireAuth: true, rateLimit: true },
  async (req, supabase, ledger: LedgerContext | null, body: TaxSummaryRequest, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    if (!body.tax_year || typeof body.tax_year !== 'number' || body.tax_year < 2020 || body.tax_year > 2100) {
      return errorResponse('Invalid tax_year: must be between 2020-2100', 400, req, requestId)
    }

    const creatorId = body.creator_id ? validateId(body.creator_id, 100) : null

    // Get all creator accounts
    let accountsQuery = supabase
      .from('accounts')
      .select('id, entity_id')
      .eq('ledger_id', ledger.id)
      .eq('account_type', 'creator_balance')
      .not('entity_id', 'is', null)

    if (creatorId) {
      accountsQuery = accountsQuery.eq('entity_id', creatorId)
    }

    const { data: accounts, error: accountsError } = await accountsQuery

    if (accountsError) {
      console.error('Failed to fetch accounts:', accountsError)
      return errorResponse('Failed to fetch accounts', 500, req, requestId)
    }

    const summaries: CreatorTaxSummary[] = []
    let totalGross = 0, totalRefunds = 0, totalNet = 0, totalPaid = 0
    let creatorsRequiring1099 = 0

    for (const account of accounts || []) {
      // Get sales (credits to creator balance)
      const { data: salesEntries } = await supabase
        .from('entries')
        .select(`amount, transaction:transactions!inner(created_at, transaction_type, status)`)
        .eq('account_id', account.id)
        .eq('entry_type', 'credit')

      const grossEarnings = salesEntries
        ?.filter((e: any) => {
          const txYear = new Date(e.transaction.created_at).getFullYear()
          return txYear === body.tax_year && 
                 e.transaction.transaction_type === 'sale' && 
                 e.transaction.status === 'completed'
        })
        .reduce((sum, e: any) => sum + Number(e.amount), 0) || 0

      // Get refunds and payouts (debits from creator balance)
      const { data: debitEntries } = await supabase
        .from('entries')
        .select(`amount, transaction:transactions!inner(created_at, transaction_type, status)`)
        .eq('account_id', account.id)
        .eq('entry_type', 'debit')

      const refundsIssued = debitEntries
        ?.filter((e: any) => {
          const txYear = new Date(e.transaction.created_at).getFullYear()
          return txYear === body.tax_year && 
                 e.transaction.transaction_type === 'refund' && 
                 e.transaction.status === 'completed'
        })
        .reduce((sum, e: any) => sum + Number(e.amount), 0) || 0

      const payoutsTotal = debitEntries
        ?.filter((e: any) => {
          const txYear = new Date(e.transaction.created_at).getFullYear()
          return txYear === body.tax_year && 
                 e.transaction.transaction_type === 'payout' && 
                 e.transaction.status === 'completed'
        })
        .reduce((sum, e: any) => sum + Number(e.amount), 0) || 0

      const netEarnings = grossEarnings - refundsIssued
      const requires1099 = netEarnings >= 600 // $600 threshold

      // Upsert summary record (amounts only - no PII)
      await supabase.from('tax_year_summaries').upsert({
        ledger_id: ledger.id,
        entity_id: account.entity_id,
        tax_year: body.tax_year,
        gross_earnings: grossEarnings,
        refunds_issued: refundsIssued,
        net_earnings: netEarnings,
        total_paid_out: payoutsTotal,
        requires_1099: requires1099,
        updated_at: new Date().toISOString()
      }, { onConflict: 'ledger_id,entity_id,tax_year,is_corrected' })

      // Only include creators with activity
      if (grossEarnings > 0 || payoutsTotal > 0) {
        summaries.push({
          creator_id: account.entity_id!,
          gross_earnings: grossEarnings,
          refunds_issued: refundsIssued,
          net_earnings: netEarnings,
          total_paid_out: payoutsTotal,
          requires_1099: requires1099
        })

        totalGross += grossEarnings
        totalRefunds += refundsIssued
        totalNet += netEarnings
        totalPaid += payoutsTotal
        if (requires1099) creatorsRequiring1099++
      }
    }

    // Audit log
    await supabase.from('audit_log').insert({
      ledger_id: ledger.id,
      action: 'generate_tax_summary',
      entity_type: 'tax_year_summaries',
      actor_type: 'api',
      ip_address: getClientIp(req),
      request_id: requestId,
      request_body: { tax_year: body.tax_year, creator_count: summaries.length }
    })

    return jsonResponse({
      success: true,
      tax_year: body.tax_year,
      note: 'Amounts only - merge with your recipient records for 1099 filing',
      summaries: summaries.sort((a, b) => b.net_earnings - a.net_earnings),
      totals: {
        total_gross: totalGross,
        total_refunds: totalRefunds,
        total_net: totalNet,
        total_paid: totalPaid,
        creators_requiring_1099: creatorsRequiring1099
      }
    }, 200, req, requestId)
  }
)

Deno.serve(handler)
