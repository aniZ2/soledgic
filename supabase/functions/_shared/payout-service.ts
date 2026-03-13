import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  createAuditLogAsync,
  escapeHtml,
  LedgerContext,
  sanitizeForAudit,
  validateAmount,
  validateId,
  validateString,
  validateUUID,
} from './utils.ts'
import {
  ResourceResult,
  resourceError,
  resourceOk,
} from './treasury-resource.ts'

export interface PayoutRequest {
  wallet_id?: string
  participant_id: string
  amount: number
  reference_id: string
  reference_type?: string
  description?: string
  payout_method?: string
  fees?: number
  fees_paid_by?: 'platform' | 'creator'
  metadata?: Record<string, any>
}

const TRANSIENT_PAYOUT_RPC_CODES = new Set(['40001', '40P01', '55P03', '57014'])
const TRANSIENT_PAYOUT_RPC_MESSAGE_PATTERNS = [
  'could not serialize access',
  'deadlock detected',
  'lock timeout',
  'statement timeout',
]

function isTransientPayoutRpcError(error: { code?: string | null; message?: string | null; details?: string | null } | null | undefined): boolean {
  if (!error) {
    return false
  }

  if (error.code && TRANSIENT_PAYOUT_RPC_CODES.has(error.code)) {
    return true
  }

  const combinedMessage = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()
  return TRANSIENT_PAYOUT_RPC_MESSAGE_PATTERNS.some((pattern) => combinedMessage.includes(pattern))
}

async function callProcessPayoutRpcWithRetry(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  requestId: string,
): Promise<{ data: unknown; error: { code?: string | null; message?: string | null; details?: string | null } | null }> {
  let lastResult: { data: unknown; error: { code?: string | null; message?: string | null; details?: string | null } | null } = {
    data: null,
    error: null,
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await supabase.rpc('process_payout_atomic', args)
    lastResult = {
      data: result.data ?? null,
      error: result.error
        ? {
            code: result.error.code ?? null,
            message: result.error.message ?? null,
            details: (result.error as { details?: string | null }).details ?? null,
          }
        : null,
    }

    if (!lastResult.error) {
      return lastResult
    }

    if (!isTransientPayoutRpcError(lastResult.error) || attempt === 3) {
      return lastResult
    }

    console.warn(`[${requestId}] Transient payout RPC error on attempt ${attempt}; retrying`, {
      code: lastResult.error.code,
      message: lastResult.error.message,
    })
    await new Promise((resolve) => setTimeout(resolve, attempt * 100))
  }

  return lastResult
}

export async function processPayoutResponse(
  req: Request,
  supabase: SupabaseClient,
  ledger: LedgerContext,
  body: PayoutRequest,
  requestId: string,
): Promise<ResourceResult> {
  let participantId = validateId(body.participant_id, 100)
  const referenceId = validateId(body.reference_id, 255)
  const amount = validateAmount(body.amount)

  if (body.wallet_id) {
    const walletId = validateUUID(body.wallet_id)
    if (!walletId) {
      return resourceError('wallet_id must be a UUID', 400, {}, 'invalid_wallet_id')
    }

    const { data: walletAccount } = await supabase
      .from('accounts')
      .select('id, account_type, entity_id')
      .eq('ledger_id', ledger.id)
      .eq('id', walletId)
      .maybeSingle()

    if (!walletAccount) {
      return resourceError('Wallet not found', 404, {}, 'wallet_not_found')
    }

    if (walletAccount.account_type !== 'creator_balance' || !walletAccount.entity_id) {
      return resourceError('Only creator_earnings wallets can be paid out', 400, {}, 'wallet_not_payout_eligible')
    }

    participantId = String(walletAccount.entity_id)
  }

  if (!participantId) {
    return resourceError('Invalid participant_id: must be 1-100 alphanumeric characters', 400, {}, 'invalid_participant_id')
  }
  if (!referenceId) {
    return resourceError('Invalid reference_id: must be 1-255 alphanumeric characters', 400, {}, 'invalid_reference_id')
  }
  if (amount === null || amount <= 0) {
    return resourceError('Invalid amount: must be a positive integer (cents)', 400, {}, 'invalid_amount')
  }

  const fees = body.fees !== undefined ? validateAmount(body.fees) : 0
  if (fees === null) {
    return resourceError('Invalid fees: must be a non-negative integer', 400, {}, 'invalid_fees')
  }

  const description = body.description ? validateString(body.description, 500) : null
  const payoutMethod = body.payout_method ? validateId(body.payout_method, 50) : null

  if (body.fees_paid_by && !['platform', 'creator'].includes(body.fees_paid_by)) {
    return resourceError('Invalid fees_paid_by: must be platform or creator', 400, {}, 'invalid_fees_paid_by')
  }

  const sanitizedMetadata: Record<string, any> = {}
  if (body.metadata?.external_id) {
    sanitizedMetadata.external_id = body.metadata.external_id
  }
  if (body.metadata?.notes) {
    sanitizedMetadata.notes = validateString(body.metadata.notes, 500)
  }

  const { data: rpcResult, error: rpcError } = await callProcessPayoutRpcWithRetry(supabase, {
    p_ledger_id: ledger.id,
    p_reference_id: referenceId,
    p_creator_id: participantId,
    p_amount: amount,
    p_fees: fees,
    p_fees_paid_by: body.fees_paid_by || 'platform',
    p_payout_method: payoutMethod,
    p_description: description,
    p_reference_type: body.reference_type || 'manual',
    p_metadata: sanitizedMetadata,
  }, requestId)

  if (rpcError) {
    console.error('Payout RPC error:', rpcError)
    return resourceError('Failed to process payout', 500, {}, 'payout_processing_failed')
  }

  const result = rpcResult as {
    status: string
    transaction_id?: string
    error?: string
    gross_payout?: number
    fees?: number
    net_to_creator?: number
    previous_balance?: number
    new_balance?: number
    ledger_balance?: number
    held_amount?: number
    available?: number
    requested?: number
  }

  if (result.status === 'error') {
    const errorMap: Record<string, { msg: string; code: number }> = {
      creator_not_found: { msg: 'Participant account not found', code: 404 },
      cash_account_not_found: { msg: 'Cash account not found - ledger not initialized', code: 500 },
      amount_must_be_positive: { msg: 'Amount must be positive', code: 400 },
    }
    const mapped = errorMap[result.error || ''] || { msg: result.error || 'Unknown error', code: 500 }
    return resourceError(mapped.msg, mapped.code, {}, result.error || 'payout_error')
  }

  if (result.status === 'insufficient_balance') {
    return resourceOk({
      success: false,
      error: `Insufficient balance. Available: $${Number(result.available).toFixed(2)}, Requested: $${Number(result.requested).toFixed(2)}`,
      error_code: 'insufficient_balance',
      details: {
        ledger_balance: result.ledger_balance,
        held_amount: result.held_amount,
        available: result.available,
      },
    }, 400)
  }

  if (result.status === 'duplicate') {
    Promise.resolve(
      supabase.from('race_condition_events').insert({
        ledger_id: ledger.id,
        event_type: 'payout_duplicate',
        endpoint: 'payouts',
        details: { reference_id: referenceId, participant_id: participantId, amount, transaction_id: result.transaction_id },
      }),
    ).then(({ error }: any) => {
      if (error) {
        console.error(`[${requestId}] Failed to log payout duplicate race event:`, error)
      }
    })

    return resourceOk({
      success: false,
      error: 'Duplicate reference_id',
      error_code: 'duplicate_reference_id',
      transaction_id: result.transaction_id,
    }, 409)
  }

  const transactionId = result.transaction_id!
  const payoutAmount = result.gross_payout!
  const feesAmount = result.fees!
  const netToParticipant = result.net_to_creator!
  const previousBalance = result.previous_balance!
  const newBalance = result.new_balance!

  createAuditLogAsync(supabase, req, {
    ledger_id: ledger.id,
    action: 'process_payout',
    entity_type: 'transaction',
    entity_id: transactionId,
    actor_type: 'api',
    request_body: sanitizeForAudit({
      participant_id: participantId,
      amount: payoutAmount,
      previous_balance: previousBalance,
      new_balance: newBalance,
    }),
    response_status: 200,
    risk_score: 20,
  }, requestId)

  Promise.resolve(
    supabase.rpc('queue_webhook', {
      p_ledger_id: ledger.id,
      p_event_type: 'payout.created',
      p_payload: {
        event: 'payout.created',
        data: {
          transaction_id: transactionId,
          participant_id: participantId,
          gross_payout: payoutAmount,
          fees: feesAmount,
          net_amount: netToParticipant,
          previous_balance: previousBalance,
          new_balance: newBalance,
          created_at: new Date().toISOString(),
        },
      },
    }),
  ).then(({ error }: any) => {
    if (error) {
      console.error(`[${requestId}] Failed to queue payout.created webhook:`, error)
    }
  })

  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (resendApiKey) {
    Promise.resolve(
      supabase
        .from('creator_accounts')
        .select('email, display_name')
        .eq('ledger_id', ledger.id)
        .eq('creator_id', participantId)
        .single(),
    ).then(async ({ data: creator }: any) => {
      if (creator?.email) {
        const formattedAmount = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
        }).format(netToParticipant / 100)

        const formattedFees = feesAmount > 0
          ? new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
            }).format(feesAmount / 100)
          : null

        const safeDisplayName = escapeHtml(creator.display_name) || 'there'
        const safePlatformName = escapeHtml((ledger as any).platform_name)

        const emailHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #10b981;">Payout Processed</h2>
            <p>Hi ${safeDisplayName},</p>
            <p>Great news! A payout has been processed for your account.</p>
            <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0;"><strong>Amount:</strong> ${formattedAmount}</p>
              ${formattedFees ? `<p style="margin: 0 0 10px 0;"><strong>Fees:</strong> ${formattedFees}</p>` : ''}
              <p style="margin: 0;"><strong>Transaction ID:</strong> ${escapeHtml(transactionId)}</p>
            </div>
            <p>The funds should arrive in your account according to your payout method's processing time.</p>
            <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
              — The ${safePlatformName} Team via Soledgic
            </p>
          </div>
        `

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: Deno.env.get('FROM_EMAIL') || 'Soledgic <noreply@soledgic.com>',
            to: [creator.email],
            subject: `Payout of ${formattedAmount} processed`,
            html: emailHtml,
          }),
        }).catch((error) => {
          console.error(`[${requestId}] Failed to send payout email to participant ${participantId}:`, error)
        })
      }
    }, (error: any) => {
      console.error(`[${requestId}] Failed to fetch participant for payout email:`, error)
    })
  }

  return resourceOk({
    success: true,
    payout: {
      id: transactionId,
      transaction_id: transactionId,
      gross_amount: payoutAmount,
      fees: feesAmount,
      net_amount: netToParticipant,
      previous_balance: previousBalance,
      new_balance: newBalance,
    },
  })
}
