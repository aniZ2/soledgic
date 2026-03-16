// SERVICE_ID: SVC_BANK_ACCOUNT_MANAGER
// Soledgic Edge Function: Manage Bank Accounts
// POST /manage-bank-accounts - Create bank account
// GET /manage-bank-accounts - List bank accounts
// SECURITY HARDENED VERSION

import {
  createHandler,
  jsonResponse,
  errorResponse,
  LedgerContext,
  validateString,
  validateId,
  getClientIp
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface CreateBankAccountRequest {
  bank_name: string
  account_name: string
  account_type: 'checking' | 'savings' | 'credit_card' | 'other'
  account_last_four?: string
}

const VALID_ACCOUNT_TYPES = ['checking', 'savings', 'credit_card', 'other']

const handler = createHandler(
  { endpoint: 'manage-bank-accounts', requireAuth: true, rateLimit: true },
  async (
    req: Request,
    supabase: SupabaseClient,
    ledger: LedgerContext | null,
    body: any,
    { requestId }: { requestId: string }
  ) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    if (req.method === 'GET') {
      const { data: accounts, error } = await supabase
        .from('bank_accounts')
        .select('id, bank_name, account_name, account_type, account_last_four, is_active, created_at')
        .eq('ledger_id', ledger.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching bank accounts:', error)
        return errorResponse('Failed to fetch bank accounts', 500, req, requestId)
      }

      return jsonResponse({ success: true, bank_accounts: accounts }, 200, req, requestId)
    }

    if (req.method === 'POST') {
      const bankName = validateString(body.bank_name, 200)
      const accountName = validateString(body.account_name, 200)

      if (!bankName) return errorResponse('Invalid or missing bank_name', 400, req, requestId)
      if (!accountName) return errorResponse('Invalid or missing account_name', 400, req, requestId)

      if (!body.account_type || !VALID_ACCOUNT_TYPES.includes(body.account_type)) {
        return errorResponse(`account_type must be one of: ${VALID_ACCOUNT_TYPES.join(', ')}`, 400, req, requestId)
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
        return errorResponse('Failed to create bank account', 500, req, requestId)
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
        }).then(() => {}).catch((err) => {
          console.error('Failed to create credit_card ledger account for bank account:', bankAccount.id, err)
        })
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

      return jsonResponse({ success: true, bank_account: bankAccount }, 201, req, requestId)
    }

    return errorResponse('Method not allowed', 405, req, requestId)
  }
)

Deno.serve(handler)
