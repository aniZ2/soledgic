// Soledgic Edge Function: Check Payout Eligibility
// GET /check-payout-eligibility?creator_id=xxx
// Verify creator can receive payout (holds, minimum balance)
// NOTE: Tax info is tracked externally by the platform - we only track amounts
// MIGRATED TO createHandler

import { 
  createHandler,
  jsonResponse, 
  errorResponse,
  validateId,
  LedgerContext
} from '../_shared/utils.ts'

const handler = createHandler(
  { endpoint: 'check-payout-eligibility', requireAuth: true, rateLimit: true },
  async (req, supabase, ledger: LedgerContext | null, _body, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    // Only allow GET
    if (req.method !== 'GET' && req.method !== 'POST') {
      return errorResponse('Method not allowed', 405, req, requestId)
    }

    const url = new URL(req.url)
    const creatorIdParam = url.searchParams.get('creator_id')
    const creatorId = creatorIdParam ? validateId(creatorIdParam, 100) : null

    if (!creatorId) {
      return errorResponse('Invalid or missing creator_id', 400, req, requestId)
    }

    // Get creator account
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id, balance, currency')
      .eq('ledger_id', ledger.id)
      .eq('account_type', 'creator_balance')
      .eq('entity_id', creatorId)
      .single()

    if (accountError || !account) {
      return errorResponse('Creator not found', 404, req, requestId)
    }

    const settings = ledger.settings as any
    const minPayoutAmount = settings?.min_payout_amount || 10

    // SECURITY: Validate balance is a valid finite number and not negative
    // Using Math.abs() could mask data integrity issues - instead, explicitly validate
    const rawBalance = Number(account.balance)
    if (!Number.isFinite(rawBalance)) {
      return errorResponse('Invalid account balance state', 500, req, requestId)
    }

    // If balance is negative, it indicates a debt - payouts should not be allowed
    if (rawBalance < 0) {
      return jsonResponse({
        success: true,
        creator_id: creatorId,
        eligible: false,
        available_balance: 0,
        issues: ['Account has negative balance - contact support'],
        requirements: {
          balance_error: true,
          note: 'Account balance is in deficit state'
        }
      }, 200, req, requestId)
    }

    const availableBalance = rawBalance

    const issues: string[] = []

    // Check 1: Get YTD earnings to determine if 1099 threshold reached
    const currentYear = new Date().getFullYear()
    const { data: ytdSummary } = await supabase
      .from('tax_year_summaries')
      .select('net_earnings')
      .eq('ledger_id', ledger.id)
      .eq('entity_id', creatorId)
      .eq('tax_year', currentYear)
      .single()

    const ytdEarnings = ytdSummary?.net_earnings || 0
    const reachesThreshold = ytdEarnings >= 600 || availableBalance >= 600

    // Check 2: Active holds
    const { data: activeHolds } = await supabase
      .from('payout_holds')
      .select('hold_type, reason')
      .eq('account_id', account.id)
      .eq('status', 'active')

    const holdReasons = activeHolds?.map(h => h.reason) || []
    if (activeHolds && activeHolds.length > 0) {
      issues.push(...holdReasons)
    }

    // Check 3: Minimum balance
    const meetsMinimum = availableBalance >= minPayoutAmount
    if (!meetsMinimum) {
      issues.push(`Balance ($${availableBalance.toFixed(2)}) below minimum payout amount ($${minPayoutAmount.toFixed(2)})`)
    }

    // Check 4: Pending payouts
    const { data: pendingPayouts } = await supabase
      .from('payouts')
      .select('amount')
      .eq('account_id', account.id)
      .in('status', ['pending', 'processing'])

    const pendingAmount = pendingPayouts?.reduce((sum, p) => sum + Number(p.amount), 0) || 0
    if (pendingAmount > 0) {
      issues.push(`Payout of $${pendingAmount.toFixed(2)} already in progress`)
    }

    const eligible = issues.length === 0

    return jsonResponse({
      success: true,
      creator_id: creatorId,
      eligible,
      available_balance: availableBalance - pendingAmount,
      issues: issues.length > 0 ? issues : undefined,
      requirements: {
        ytd_earnings: ytdEarnings,
        reaches_1099_threshold: reachesThreshold,
        has_active_holds: (activeHolds?.length || 0) > 0,
        hold_reasons: holdReasons,
        meets_minimum: meetsMinimum,
        minimum_amount: minPayoutAmount,
        note: reachesThreshold ? 'Platform should verify tax info before payout' : undefined
      }
    }, 200, req, requestId)
  }
)

Deno.serve(handler)
