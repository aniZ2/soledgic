// Soledgic Edge Function: Export Report
// POST /export-report
// Generate CSV/JSON exports for accounting and audit purposes
// SECURITY HARDENED VERSION

import { 
  createHandler,
  getCorsHeaders,
  jsonResponse,
  errorResponse,
  validateId,
  getClientIp,
  LedgerContext
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface ExportRequest {
  report_type: 'transaction_detail' | 'creator_earnings' | 'platform_revenue' | 
               'payout_summary' | 'reconciliation' | 'audit_log'
  format: 'csv' | 'json'
  start_date?: string
  end_date?: string
  creator_id?: string
}

const VALID_REPORT_TYPES = ['transaction_detail', 'creator_earnings', 'platform_revenue', 
                           'payout_summary', 'reconciliation', 'audit_log']

const handler = createHandler(
  { endpoint: 'export-report', requireAuth: true, rateLimit: true },
  async (req: Request, supabase: SupabaseClient, ledger: LedgerContext | null, body: ExportRequest) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req)
    }

    if (!body.report_type || !VALID_REPORT_TYPES.includes(body.report_type)) {
      return errorResponse(`Invalid report_type: must be one of ${VALID_REPORT_TYPES.join(', ')}`, 400, req)
    }

    if (!body.format || !['csv', 'json'].includes(body.format)) {
      return errorResponse('Invalid format: must be csv or json', 400, req)
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    const startDate = body.start_date && dateRegex.test(body.start_date) ? body.start_date : null
    const endDate = body.end_date && dateRegex.test(body.end_date) ? body.end_date : null

    let data: any[] = []
    let columns: string[] = []

    switch (body.report_type) {
      case 'transaction_detail': {
        let query = supabase
          .from('transactions')
          .select(`id, transaction_type, reference_id, reference_type, description, amount, currency, status, created_at, entries(id, account_id, entry_type, amount, accounts(name, entity_id))`)
          .eq('ledger_id', ledger.id)
          .order('created_at', { ascending: false })

        if (startDate) query = query.gte('created_at', startDate)
        if (endDate) query = query.lte('created_at', endDate)

        const { data: transactions } = await query

        data = transactions?.flatMap(tx => 
          tx.entries.map((entry: any) => ({
            transaction_id: tx.id,
            date: tx.created_at,
            type: tx.transaction_type,
            reference_id: tx.reference_id,
            description: tx.description,
            account_name: entry.accounts?.name,
            entity_id: entry.accounts?.entity_id,
            entry_type: entry.entry_type,
            amount: entry.amount,
            currency: tx.currency,
            status: tx.status
          }))
        ) || []

        columns = ['transaction_id', 'date', 'type', 'reference_id', 'description', 
                   'account_name', 'entity_id', 'entry_type', 'amount', 'currency', 'status']
        break
      }

      case 'creator_earnings': {
        const { data: accounts } = await supabase
          .from('accounts')
          .select('entity_id, balance, currency')
          .eq('ledger_id', ledger.id)
          .eq('account_type', 'creator_balance')
          .not('entity_id', 'is', null)

        data = accounts?.map(acc => ({
          creator_id: acc.entity_id,
          current_balance: Math.abs(Number(acc.balance)),
          currency: acc.currency
        })) || []

        columns = ['creator_id', 'current_balance', 'currency']
        break
      }

      case 'platform_revenue': {
        let query = supabase
          .from('transactions')
          .select('id, created_at, amount, reference_id, metadata')
          .eq('ledger_id', ledger.id)
          .eq('transaction_type', 'sale')
          .eq('status', 'completed')
          .order('created_at', { ascending: false })

        if (startDate) query = query.gte('created_at', startDate)
        if (endDate) query = query.lte('created_at', endDate)

        const { data: sales } = await query

        data = sales?.map(sale => ({
          date: sale.created_at,
          reference_id: sale.reference_id,
          total_amount: sale.amount,
          platform_amount: (sale.metadata as any)?.breakdown?.platform_amount || 0,
          creator_amount: (sale.metadata as any)?.breakdown?.creator_amount || 0,
          platform_fee_percent: (sale.metadata as any)?.platform_fee_percent || 20
        })) || []

        columns = ['date', 'reference_id', 'total_amount', 'platform_amount', 'creator_amount', 'platform_fee_percent']
        break
      }

      case 'payout_summary': {
        let query = supabase
          .from('payouts')
          .select(`id, amount, currency, payment_method, payment_reference, status, initiated_at, completed_at, accounts(entity_id)`)
          .eq('ledger_id', ledger.id)
          .order('initiated_at', { ascending: false })

        if (startDate) query = query.gte('initiated_at', startDate)
        if (endDate) query = query.lte('initiated_at', endDate)

        const { data: payouts } = await query

        data = payouts?.map((p: any) => ({
          payout_id: p.id,
          creator_id: p.accounts?.entity_id,
          amount: p.amount,
          currency: p.currency,
          payment_method: p.payment_method,
          payment_reference: p.payment_reference,
          status: p.status,
          initiated_at: p.initiated_at,
          completed_at: p.completed_at
        })) || []

        columns = ['payout_id', 'creator_id', 'amount', 'currency', 'payment_method', 'payment_reference', 'status', 'initiated_at', 'completed_at']
        break
      }

      case 'reconciliation': {
        const { data: records } = await supabase
          .from('reconciliation_records')
          .select('*')
          .eq('ledger_id', ledger.id)
          .order('period_start', { ascending: false })

        data = records?.map(r => ({
          period_start: r.period_start,
          period_end: r.period_end,
          expected_revenue: r.expected_revenue,
          actual_deposits: r.actual_deposits,
          revenue_difference: r.revenue_difference,
          expected_payouts: r.expected_payouts,
          actual_payouts: r.actual_payouts,
          payout_difference: r.payout_difference,
          status: r.status,
          discrepancy_notes: r.discrepancy_notes
        })) || []

        columns = ['period_start', 'period_end', 'expected_revenue', 'actual_deposits', 'revenue_difference', 'expected_payouts', 'actual_payouts', 'payout_difference', 'status', 'discrepancy_notes']
        break
      }

      case 'audit_log': {
        let query = supabase
          .from('audit_log')
          .select('id, action, entity_type, entity_id, actor_type, actor_id, ip_address, created_at')
          .eq('ledger_id', ledger.id)
          .order('created_at', { ascending: false })
          .limit(10000)

        if (startDate) query = query.gte('created_at', startDate)
        if (endDate) query = query.lte('created_at', endDate)

        const { data: logs } = await query
        data = logs || []
        columns = ['id', 'action', 'entity_type', 'entity_id', 'actor_type', 'actor_id', 'ip_address', 'created_at']
        break
      }
    }

    // Record the export
    supabase.from('report_exports').insert({
      ledger_id: ledger.id,
      report_type: body.report_type,
      parameters: body,
      period_start: startDate,
      period_end: endDate,
      format: body.format,
      row_count: data.length,
      status: 'completed',
      completed_at: new Date().toISOString()
    }).then(() => {}).catch(() => {})

    // Audit log
    supabase.from('audit_log').insert({
      ledger_id: ledger.id,
      action: 'export_report',
      entity_type: 'report_exports',
      actor_type: 'api',
      ip_address: getClientIp(req),
      user_agent: req.headers.get('user-agent'),
      request_body: { report_type: body.report_type, format: body.format, row_count: data.length }
    }).then(() => {}).catch(() => {})

    // Format response
    if (body.format === 'csv') {
      const csvHeader = columns.join(',')
      const csvRows = data.map(row => 
        columns.map(col => {
          const val = row[col]
          if (val === null || val === undefined) return ''
          if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
            return `"${val.replace(/"/g, '""')}"`
          }
          return val
        }).join(',')
      )
      const csv = [csvHeader, ...csvRows].join('\n')

      return new Response(csv, {
        status: 200,
        headers: {
          ...getCorsHeaders(req),
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${body.report_type}_${new Date().toISOString().split('T')[0]}.csv"`
        }
      })
    } else {
      return jsonResponse({
        success: true,
        report_type: body.report_type,
        generated_at: new Date().toISOString(),
        row_count: data.length,
        data
      }, 200, req)
    }
  }
)

Deno.serve(handler)
