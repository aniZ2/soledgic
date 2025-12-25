// Soledgic Edge Function: Manage Bank Accounts
// POST /manage-bank-accounts - Create bank account
// GET /manage-bank-accounts - List bank accounts
// SECURITY HARDENED VERSION

import { 
  getCorsHeaders,
  getSupabaseClient,
  validateApiKey,
  jsonResponse,
  errorResponse,
  validateString,
  validateId,
  getClientIp
} from '../_shared/utils.ts'

interface CreateBankAccountRequest {
  bank_name: string
  account_name: string
  account_type: 'checking' | 'savings' | 'credit_card' | 'paypal' | 'other'
  account_last_four?: string
}

const VALID_ACCOUNT_TYPES = ['checking', 'savings', 'credit_card', 'paypal', 'other']

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

    if (req.method === 'GET') {
      const { data: accounts, error } = await supabase
        .from('bank_accounts')
        .select('id, bank_name, account_name, account_type, account_last_four, is_active, created_at')
        .eq('ledger_id', ledger.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching bank accounts:', error)
        return errorResponse('Failed to fetch bank accounts', 500, req)
      }

      return jsonResponse({ success: true, bank_accounts: accounts }, 200, req)
    }

    if (req.method === 'POST') {
      const body: CreateBankAccountRequest = await req.json()

      const bankName = validateString(body.bank_name, 200)
      const accountName = validateString(body.account_name, 200)

      if (!bankName) return errorResponse('Invalid or missing bank_name', 400, req)
      if (!accountName) return errorResponse('Invalid or missing account_name', 400, req)

      if (!body.account_type || !VALID_ACCOUNT_TYPES.includes(body.account_type)) {
        return errorResponse(`account_type must be one of: ${VALID_ACCOUNT_TYPES.join(', ')}`, 400, req)
      }

      // Validate last four (if provided)
      const lastFour = body.account_last_four ? validateId(body.account_last_four, 4) : null

      const { data: bankAccount, error: createError } = await supabase
        .from('bank_accounts')
        .insert({
          ledger_id: ledger.id,
          bank_name: bankName,
          account_name: accountName,
          account_type: body.account_type,
          account_last_four: lastFour,
          is_active: true
        })
        .select('id, bank_name, account_name, account_type, account_last_four, is_active, created_at')
        .single()

      if (createError) {
        console.error('Failed to create bank account:', createError)
        return errorResponse('Failed to create bank account', 500, req)
      }

      // If credit card, create a corresponding ledger account
      if (body.account_type === 'credit_card') {
        supabase.from('accounts').insert({
          ledger_id: ledger.id,
          account_type: 'credit_card',
          entity_type: 'platform',
          entity_id: bankAccount.id,
          name: `${accountName} (${bankName})`,
          balance: 0,
          currency: 'USD'
        }).then(() => {}).catch(() => {})
      }

      // Audit log
      supabase.from('audit_log').insert({
        ledger_id: ledger.id,
        action: 'create_bank_account',
        entity_type: 'bank_account',
        entity_id: bankAccount.id,
        actor_type: 'api',
        ip_address: getClientIp(req),
        user_agent: req.headers.get('user-agent'),
        request_body: { bank_name: bankName, account_type: body.account_type }
      }).then(() => {}).catch(() => {})

      return jsonResponse({ success: true, bank_account: bankAccount }, 201, req)
    }

    return errorResponse('Method not allowed', 405, req)

  } catch (error: any) {
    console.error('Error managing bank accounts:', error)
    return errorResponse('Internal server error', 500, req)
  }
})
