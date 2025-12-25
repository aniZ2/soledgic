// Soledgic Edge Function: Close Accounting Period
// POST /close-period
// Lock a month/quarter so no transactions can be added to it
// MIGRATED TO createHandler

import { 
  createHandler,
  jsonResponse, 
  errorResponse,
  validateString,
  getClientIp,
  LedgerContext
} from '../_shared/utils.ts'

interface ClosePeriodRequest {
  year: number
  month?: number
  quarter?: number
  notes?: string
}

const handler = createHandler(
  { endpoint: 'close-period', requireAuth: true, rateLimit: true },
  async (req, supabase, ledger: LedgerContext | null, body: ClosePeriodRequest, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    if (!body.year || typeof body.year !== 'number' || body.year < 2000 || body.year > 2100) {
      return errorResponse('Invalid year: must be between 2000-2100', 400, req, requestId)
    }

    if (!body.month && !body.quarter) {
      return errorResponse('Either month or quarter is required', 400, req, requestId)
    }

    if (body.month && (body.month < 1 || body.month > 12)) {
      return errorResponse('Invalid month: must be 1-12', 400, req, requestId)
    }

    if (body.quarter && (body.quarter < 1 || body.quarter > 4)) {
      return errorResponse('Invalid quarter: must be 1-4', 400, req, requestId)
    }

    const notes = body.notes ? validateString(body.notes, 1000) : null

    let periodStart: string, periodEnd: string, periodType: string, periodNumber: number

    if (body.month) {
      const m = body.month
      periodStart = `${body.year}-${m.toString().padStart(2, '0')}-01`
      const lastDay = new Date(body.year, m, 0).getDate()
      periodEnd = `${body.year}-${m.toString().padStart(2, '0')}-${lastDay}`
      periodType = 'monthly'
      periodNumber = m
    } else {
      const q = body.quarter!
      const startMonth = (q - 1) * 3 + 1
      const endMonth = q * 3
      periodStart = `${body.year}-${startMonth.toString().padStart(2, '0')}-01`
      const lastDay = new Date(body.year, endMonth, 0).getDate()
      periodEnd = `${body.year}-${endMonth.toString().padStart(2, '0')}-${lastDay}`
      periodType = 'quarterly'
      periodNumber = q
    }

    // Check if period already exists
    const { data: existingPeriod } = await supabase
      .from('accounting_periods')
      .select('id, status')
      .eq('ledger_id', ledger.id)
      .eq('period_start', periodStart)
      .eq('period_end', periodEnd)
      .single()

    if (existingPeriod?.status === 'closed' || existingPeriod?.status === 'locked') {
      return jsonResponse({ 
        success: false, 
        error: `Period is already ${existingPeriod.status}`,
        period_id: existingPeriod.id
      }, 409, req, requestId)
    }

    // Verify ledger is balanced
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, account_type, entity_id, name, balance, currency')
      .eq('ledger_id', ledger.id)
      .eq('is_active', true)

    const totalDebits = accounts
      ?.filter((a: any) => Number(a.balance) > 0)
      .reduce((sum: number, a: any) => sum + Number(a.balance), 0) || 0
    
    const totalCredits = accounts
      ?.filter((a: any) => Number(a.balance) < 0)
      .reduce((sum: number, a: any) => sum + Math.abs(Number(a.balance)), 0) || 0

    const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01

    if (!isBalanced) {
      return jsonResponse({ 
        success: false, 
        error: `Ledger is not balanced`,
        details: { debits: totalDebits, credits: totalCredits, difference: totalDebits - totalCredits }
      }, 400, req, requestId)
    }

    // Create snapshot hash
    const snapshotData = JSON.stringify(accounts?.map(a => ({ id: a.id, balance: a.balance })))
    const snapshotHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(snapshotData))
      .then(hash => Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join(''))

    // Create snapshot
    const { data: snapshot, error: snapshotError } = await supabase
      .from('trial_balance_snapshots')
      .insert({
        ledger_id: ledger.id,
        snapshot_type: 'period_close',
        as_of_date: periodEnd,
        balances: accounts,
        total_debits: totalDebits,
        total_credits: totalCredits,
        balance_hash: snapshotHash
      })
      .select('id, total_debits, total_credits, is_balanced')
      .single()

    if (snapshotError) {
      console.error('Failed to create snapshot:', snapshotError)
      return errorResponse('Failed to create snapshot', 500, req, requestId)
    }

    // Create or update period
    let period
    if (existingPeriod) {
      const { data: updated, error: updateError } = await supabase
        .from('accounting_periods')
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
          closed_by: 'api',
          close_notes: notes,
          closing_trial_balance: accounts,
          closing_hash: snapshotHash,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingPeriod.id)
        .select()
        .single()
      
      if (updateError) {
        console.error('Failed to close period:', updateError)
        return errorResponse('Failed to close period', 500, req, requestId)
      }
      period = updated
    } else {
      const { data: created, error: createError } = await supabase
        .from('accounting_periods')
        .insert({
          ledger_id: ledger.id,
          period_type: periodType,
          period_start: periodStart,
          period_end: periodEnd,
          fiscal_year: body.year,
          period_number: periodNumber,
          status: 'closed',
          closed_at: new Date().toISOString(),
          closed_by: 'api',
          close_notes: notes,
          closing_trial_balance: accounts,
          closing_hash: snapshotHash
        })
        .select()
        .single()
      
      if (createError) {
        console.error('Failed to create period:', createError)
        return errorResponse('Failed to create period', 500, req, requestId)
      }
      period = created
    }

    // Audit log
    await supabase.from('audit_log').insert({
      ledger_id: ledger.id,
      action: 'close_period',
      entity_type: 'accounting_period',
      entity_id: period.id,
      actor_type: 'api',
      ip_address: getClientIp(req),
      request_id: requestId,
      request_body: { year: body.year, month: body.month, quarter: body.quarter }
    })

    return jsonResponse({
      success: true,
      period_id: period.id,
      period: {
        start_date: periodStart,
        end_date: periodEnd,
        status: 'closed'
      },
      snapshot: {
        snapshot_id: snapshot.id,
        total_debits: snapshot.total_debits,
        total_credits: snapshot.total_credits,
        is_balanced: snapshot.is_balanced
      }
    }, 200, req, requestId)
  }
)

Deno.serve(handler)
