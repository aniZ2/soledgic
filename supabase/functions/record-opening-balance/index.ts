// Soledgic Edge Function: Record Opening Balances
// POST /record-opening-balance
// Set initial balances when starting a ledger mid-year
// SECURITY HARDENED VERSION

import { 
  getCorsHeaders,
  getSupabaseClient,
  validateApiKey,
  jsonResponse,
  errorResponse,
  validateId,
  validateString,
  getClientIp
} from '../_shared/utils.ts'

interface OpeningBalanceEntry {
  account_type: string
  entity_id?: string
  balance: number
}

interface RecordOpeningBalanceRequest {
  as_of_date: string
  source: 'manual' | 'imported' | 'migrated' | 'year_start'
  source_description?: string
  balances: OpeningBalanceEntry[]
}

const VALID_SOURCES = ['manual', 'imported', 'migrated', 'year_start']

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

    const body: RecordOpeningBalanceRequest = await req.json()

    // Validate required fields
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!body.as_of_date || !dateRegex.test(body.as_of_date)) {
      return errorResponse('Invalid as_of_date: must be YYYY-MM-DD format', 400, req)
    }

    if (!body.source || !VALID_SOURCES.includes(body.source)) {
      return errorResponse(`Invalid source: must be one of ${VALID_SOURCES.join(', ')}`, 400, req)
    }

    if (!body.balances || !Array.isArray(body.balances) || body.balances.length === 0) {
      return errorResponse('balances must be a non-empty array', 400, req)
    }

    // Check if opening balances already exist
    const { data: existing } = await supabase
      .from('opening_balances')
      .select('id')
      .eq('ledger_id', ledger.id)
      .single()

    if (existing) {
      return jsonResponse({ success: false, error: 'Opening balances already recorded for this ledger' }, 409, req)
    }

    // Calculate totals
    let totalAssets = 0
    let totalLiabilities = 0
    let totalEquity = 0

    const assetTypes = ['cash', 'tax_reserve']
    const liabilityTypes = ['creator_balance', 'creator_pool', 'accounts_payable', 'credit_card']
    const equityTypes = ['owner_equity', 'platform_revenue']

    for (const bal of body.balances) {
      if (typeof bal.balance !== 'number') {
        return errorResponse('Each balance must be a number (cents)', 400, req)
      }
      const accountType = validateId(bal.account_type, 50)
      if (!accountType) {
        return errorResponse(`Invalid account_type: ${bal.account_type}`, 400, req)
      }

      const amount = bal.balance / 100
      if (assetTypes.includes(accountType)) {
        totalAssets += amount
      } else if (liabilityTypes.includes(accountType)) {
        totalLiabilities += Math.abs(amount)
      } else if (equityTypes.includes(accountType)) {
        totalEquity += Math.abs(amount)
      }
    }

    // Verify accounting equation
    const difference = Math.abs(totalAssets - (totalLiabilities + totalEquity))
    if (difference > 0.01) {
      return jsonResponse({ 
        success: false, 
        error: `Opening balances don't balance`,
        details: { totalAssets, totalLiabilities, totalEquity, difference }
      }, 400, req)
    }

    // Create transaction
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        ledger_id: ledger.id,
        transaction_type: 'opening_balance',
        reference_id: `opening_${body.as_of_date}`,
        reference_type: 'opening_balance',
        description: `Opening balances as of ${body.as_of_date}`,
        amount: totalAssets,
        currency: 'USD',
        status: 'completed',
        metadata: {
          source: body.source,
          source_description: body.source_description ? validateString(body.source_description, 500) : null,
          as_of_date: body.as_of_date
        }
      })
      .select('id')
      .single()

    if (txError) {
      console.error('Failed to create transaction:', txError)
      return errorResponse('Failed to create opening balance transaction', 500, req)
    }

    // Create entries
    const entries = []
    for (const bal of body.balances) {
      const accountType = validateId(bal.account_type, 50)!
      let accountQuery = supabase
        .from('accounts')
        .select('id')
        .eq('ledger_id', ledger.id)
        .eq('account_type', accountType)

      if (bal.entity_id) {
        const entityId = validateId(bal.entity_id, 100)
        if (!entityId) {
          return errorResponse(`Invalid entity_id: ${bal.entity_id}`, 400, req)
        }
        accountQuery = accountQuery.eq('entity_id', entityId)
      } else {
        accountQuery = accountQuery.is('entity_id', null)
      }

      let { data: account } = await accountQuery.single()

      if (!account && bal.entity_id) {
        const { data: newAccount } = await supabase
          .from('accounts')
          .insert({
            ledger_id: ledger.id,
            account_type: accountType,
            entity_type: 'creator',
            entity_id: validateId(bal.entity_id, 100),
            name: `Creator ${bal.entity_id}`,
            balance: 0,
            currency: 'USD'
          })
          .select('id')
          .single()
        account = newAccount
      }

      if (!account) {
        return errorResponse(`Account not found: ${accountType}`, 400, req)
      }

      const amount = Math.abs(bal.balance / 100)
      entries.push({
        transaction_id: transaction.id,
        account_id: account.id,
        entry_type: bal.balance > 0 ? 'debit' : 'credit',
        amount: amount
      })
    }

    await supabase.from('entries').insert(entries)

    // Record opening balance metadata
    const { data: opening } = await supabase
      .from('opening_balances')
      .insert({
        ledger_id: ledger.id,
        transaction_id: transaction.id,
        as_of_date: body.as_of_date,
        source: body.source,
        source_description: body.source_description ? validateString(body.source_description, 500) : null,
        total_assets: totalAssets,
        total_liabilities: totalLiabilities,
        total_equity: totalEquity
      })
      .select('id')
      .single()

    // Audit log
    supabase.from('audit_log').insert({
      ledger_id: ledger.id,
      action: 'record_opening_balance',
      entity_type: 'opening_balance',
      entity_id: opening?.id,
      actor_type: 'api',
      ip_address: getClientIp(req),
      user_agent: req.headers.get('user-agent'),
      request_body: { as_of_date: body.as_of_date, source: body.source, accounts: body.balances.length }
    }).then(() => {}).catch(() => {})

    return jsonResponse({
      success: true,
      opening_balance_id: opening?.id,
      transaction_id: transaction.id,
      summary: {
        as_of_date: body.as_of_date,
        total_assets: totalAssets,
        total_liabilities: totalLiabilities,
        total_equity: totalEquity,
        accounts_set: body.balances.length
      }
    }, 200, req)

  } catch (error: any) {
    console.error('Error recording opening balances:', error)
    return errorResponse('Internal server error', 500, req)
  }
})
