// Soledgic Edge Function: Record Internal Transfer
// POST /record-transfer
// Move money between accounts (tax reserve, owner draw, etc.)
// SECURITY HARDENED VERSION

import {
  createHandler,
  jsonResponse,
  errorResponse,
  LedgerContext,
  validateId,
  validateAmount,
  validateString,
  getClientIp
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface RecordTransferRequest {
  from_account_type: string
  to_account_type: string
  amount: number
  transfer_type: 'tax_reserve' | 'payout_reserve' | 'owner_draw' |
                 'owner_contribution' | 'operating' | 'savings' | 'investment' | 'other'
  description?: string
  reference_id?: string
}

const handler = createHandler(
  { endpoint: 'record-transfer', requireAuth: true, rateLimit: true },
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

    if (ledger.status !== 'active') {
      return errorResponse('Ledger is not active', 403, req, requestId)
    }

    // Validate inputs
    const fromAccountType = validateId(body.from_account_type, 50)
    const toAccountType = validateId(body.to_account_type, 50)
    const amount = validateAmount(body.amount)
    const transferType = validateId(body.transfer_type, 30)

    if (!fromAccountType || !toAccountType) {
      return errorResponse('Invalid account types', 400, req, requestId)
    }
    if (amount === null || amount <= 0) {
      return errorResponse('Invalid amount: must be positive integer (cents)', 400, req, requestId)
    }
    if (!transferType) {
      return errorResponse('Invalid transfer_type', 400, req, requestId)
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
      return errorResponse(`From account not found: ${fromAccountType}`, 400, req, requestId)
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
        return errorResponse('Failed to create destination account', 500, req, requestId)
      }
      toAccount = newAccount
    }

    const transferAmount = amount / 100

    // Atomic: duplicate check + transaction insert + entries insert with account locking
    const { data: rpcResult, error: rpcError } = await supabase.rpc('record_transaction_atomic', {
      p_ledger_id: ledger.id,
      p_transaction_type: 'transfer',
      p_reference_id: referenceId,
      p_reference_type: 'internal_transfer',
      p_description: description || `${transferType}: ${fromAccount.name} → ${toAccount.name}`,
      p_amount: transferAmount,
      p_currency: 'USD',
      p_status: 'completed',
      p_entry_method: 'manual',
      p_metadata: {
        transfer_type: transferType,
        from_account: fromAccountType,
        to_account: toAccountType
      },
      p_entries: JSON.stringify([
        { account_id: toAccount.id, entry_type: 'debit', amount: transferAmount },
        { account_id: fromAccount.id, entry_type: 'credit', amount: transferAmount },
      ]),
      p_authorizing_instrument_id: null,
    })

    if (rpcError) {
      console.error('Failed to create transaction:', rpcError)
      return errorResponse('Failed to create transfer transaction', 500, req, requestId)
    }

    if (!rpcResult?.success) {
      if (rpcResult?.error === 'duplicate_reference_id') {
        return jsonResponse({ success: false, error: 'Duplicate reference_id', transaction_id: rpcResult.transaction_id }, 409, req)
      }
      return errorResponse(rpcResult?.error || 'Failed to create transfer', 500, req, requestId)
    }

    const transaction = { id: rpcResult.transaction_id }

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
    }, 200, req, requestId)
  }
)

Deno.serve(handler)
