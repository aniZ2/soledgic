// Soledgic Edge Function: Process Payout
// POST /process-payout
// Records a payout to a creator/contractor
// SECURITY HARDENED VERSION

import { 
  createHandler, 
  jsonResponse, 
  errorResponse,
  validateId,
  validateAmount,
  validateString,
  LedgerContext,
  getClientIp
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface PayoutRequest {
  creator_id: string
  amount: number
  reference_id: string
  reference_type?: string
  description?: string
  payout_method?: string
  fees?: number
  fees_paid_by?: 'platform' | 'creator'
  metadata?: Record<string, any>
}

const handler = createHandler(
  { endpoint: 'process-payout', requireAuth: true, rateLimit: true },
  async (req: Request, supabase: SupabaseClient, ledger: LedgerContext | null, body: PayoutRequest) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req)
    }

    // Validate required fields
    const creatorId = validateId(body.creator_id, 100)
    const referenceId = validateId(body.reference_id, 255)
    const amount = validateAmount(body.amount)

    if (!creatorId) {
      return errorResponse('Invalid creator_id: must be 1-100 alphanumeric characters', 400, req)
    }
    if (!referenceId) {
      return errorResponse('Invalid reference_id: must be 1-255 alphanumeric characters', 400, req)
    }
    if (amount === null || amount <= 0) {
      return errorResponse('Invalid amount: must be a positive integer (cents)', 400, req)
    }

    // Validate optional fields
    const fees = body.fees !== undefined ? validateAmount(body.fees) : 0
    if (fees === null) {
      return errorResponse('Invalid fees: must be a non-negative integer', 400, req)
    }

    const description = body.description ? validateString(body.description, 500) : null
    const payoutMethod = body.payout_method ? validateId(body.payout_method, 50) : null
    
    // Validate fees_paid_by
    if (body.fees_paid_by && !['platform', 'creator'].includes(body.fees_paid_by)) {
      return errorResponse('Invalid fees_paid_by: must be platform or creator', 400, req)
    }

    // Check duplicate
    const { data: existingTx } = await supabase
      .from('transactions')
      .select('id')
      .eq('ledger_id', ledger.id)
      .eq('reference_id', referenceId)
      .single()

    if (existingTx) {
      return jsonResponse({ 
        success: false, 
        error: 'Duplicate reference_id', 
        transaction_id: existingTx.id 
      }, 409, req)
    }

    // Get creator account
    const { data: creatorAccounts } = await supabase
      .from('accounts')
      .select('id, name')
      .eq('ledger_id', ledger.id)
      .eq('account_type', 'creator_balance')
      .eq('entity_id', creatorId)
      .limit(1)

    const creatorAccount = creatorAccounts?.[0]
    if (!creatorAccount) {
      return errorResponse('Creator account not found', 404, req)
    }

    // Calculate balance - EXCLUDE voided/reversed transactions
    const { data: entries } = await supabase
      .from('entries')
      .select('entry_type, amount, transactions!inner(status)')
      .eq('account_id', creatorAccount.id)
      .not('transactions.status', 'in', '("voided","reversed")')

    let totalCredits = 0
    let totalDebits = 0
    for (const e of entries || []) {
      if (e.entry_type === 'credit') totalCredits += Number(e.amount)
      else totalDebits += Number(e.amount)
    }
    const ledgerBalance = totalCredits - totalDebits

    // Get held funds
    const { data: heldFunds } = await supabase
      .from('held_funds')
      .select('held_amount, released_amount')
      .eq('ledger_id', ledger.id)
      .eq('creator_id', creatorId)
      .in('status', ['held', 'partial'])

    let totalHeld = 0
    for (const hf of heldFunds || []) {
      totalHeld += Number(hf.held_amount) - Number(hf.released_amount)
    }

    const availableBalance = ledgerBalance - totalHeld
    const payoutAmount = amount / 100
    const feesAmount = fees / 100

    // Check sufficient balance
    if (availableBalance < payoutAmount) {
      return jsonResponse({
        success: false,
        error: `Insufficient balance. Available: $${availableBalance.toFixed(2)}, Requested: $${payoutAmount.toFixed(2)}`,
        details: { 
          ledger_balance: ledgerBalance, 
          held_amount: totalHeld, 
          available: availableBalance 
        }
      }, 400, req)
    }

    // Calculate net amounts
    let netToCreator = payoutAmount
    let feesPaidByPlatform = 0
    if (feesAmount > 0 && body.fees_paid_by !== 'creator') {
      feesPaidByPlatform = feesAmount
    } else if (feesAmount > 0) {
      netToCreator = payoutAmount - feesAmount
    }

    // Get cash account
    const { data: cashAccounts } = await supabase
      .from('accounts')
      .select('id')
      .eq('ledger_id', ledger.id)
      .eq('account_type', 'cash')
      .limit(1)

    const cashAccount = cashAccounts?.[0]
    if (!cashAccount) {
      return errorResponse('Cash account not found - ledger not initialized', 500, req)
    }

    // Create transaction
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        ledger_id: ledger.id,
        transaction_type: 'payout',
        reference_id: referenceId,
        reference_type: body.reference_type || 'manual',
        description: description || `Payout to ${creatorId}`,
        amount: payoutAmount,
        currency: 'USD',
        status: 'completed',
        metadata: { 
          creator_id: creatorId, 
          payout_method: payoutMethod, 
          fees: feesAmount, 
          net_to_creator: netToCreator,
          // Don't blindly copy user metadata - be selective
          external_id: body.metadata?.external_id,
          notes: body.metadata?.notes ? validateString(body.metadata.notes, 500) : undefined,
        }
      })
      .select('id')
      .single()

    if (txError) {
      console.error('Failed to create payout transaction:', txError)
      return errorResponse('Failed to create payout transaction', 500, req)
    }

    // Create entries
    const entryList: any[] = [
      { 
        transaction_id: transaction.id, 
        account_id: creatorAccount.id, 
        entry_type: 'debit', 
        amount: payoutAmount 
      },
      { 
        transaction_id: transaction.id, 
        account_id: cashAccount.id, 
        entry_type: 'credit', 
        amount: payoutAmount + feesPaidByPlatform 
      },
    ]

    // Handle fees
    if (feesPaidByPlatform > 0) {
      const { data: feeAccounts } = await supabase
        .from('accounts')
        .select('id')
        .eq('ledger_id', ledger.id)
        .eq('account_type', 'processing_fees')
        .limit(1)

      let feeAccount = feeAccounts?.[0]
      if (!feeAccount) {
        const { data: newFee } = await supabase
          .from('accounts')
          .insert({ 
            ledger_id: ledger.id, 
            account_type: 'processing_fees', 
            entity_type: 'platform', 
            name: 'Payout Fees' 
          })
          .select('id')
          .single()
        feeAccount = newFee
      }
      if (feeAccount) {
        entryList.push({ 
          transaction_id: transaction.id, 
          account_id: feeAccount.id, 
          entry_type: 'debit', 
          amount: feesPaidByPlatform 
        })
      }
    }

    await supabase.from('entries').insert(entryList)

    const newBalance = availableBalance - payoutAmount

    // Audit log with IP
    await supabase.from('audit_log').insert({
      ledger_id: ledger.id,
      action: 'process_payout',
      entity_type: 'transaction',
      entity_id: transaction.id,
      actor_type: 'api',
      ip_address: getClientIp(req),
      request_body: { 
        creator_id: creatorId, 
        amount: payoutAmount, 
        previous_balance: availableBalance, 
        new_balance: newBalance 
      }
    })

    // Queue webhook
    supabase.rpc('queue_webhook', {
      p_ledger_id: ledger.id,
      p_event_type: 'payout.created',
      p_payload: {
        event: 'payout.created',
        data: {
          transaction_id: transaction.id,
          creator_id: creatorId,
          gross_payout: payoutAmount,
          fees: feesAmount,
          net_to_creator: netToCreator,
          previous_balance: availableBalance,
          new_balance: newBalance,
          created_at: new Date().toISOString(),
        }
      }
    }).catch(() => {})

    return jsonResponse({
      success: true,
      transaction_id: transaction.id,
      breakdown: { 
        gross_payout: payoutAmount, 
        fees: feesAmount, 
        net_to_creator: netToCreator 
      },
      previous_balance: availableBalance,
      new_balance: newBalance
    }, 200, req)
  }
)

Deno.serve(handler)
