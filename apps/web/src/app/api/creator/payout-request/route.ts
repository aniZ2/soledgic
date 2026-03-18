import { NextResponse } from 'next/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'
import { createClient } from '@/lib/supabase/server'

export const POST = createApiHandler(
  async (request, { user }) => {
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { data: body, error: parseError } = await parseJsonBody<{
      connected_account_id: string
      amount_cents: number
    }>(request)

    if (parseError || !body) {
      return NextResponse.json({ error: parseError || 'Invalid body' }, { status: 400 })
    }

    const { connected_account_id, amount_cents } = body

    if (!connected_account_id || typeof amount_cents !== 'number' || amount_cents <= 0) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const supabase = await createClient()

    // Verify the connected account belongs to this user (via email match)
    const { data: account } = await supabase
      .from('connected_accounts')
      .select('id, ledger_id, entity_id, is_active')
      .eq('id', connected_account_id)
      .eq('email', user.email)
      .eq('is_active', true)
      .single()

    if (!account) {
      return NextResponse.json({ error: 'Account not found or not yours' }, { status: 404 })
    }

    // Server-side balance check
    const { data: balanceAccount } = await supabase
      .from('accounts')
      .select('id')
      .eq('ledger_id', account.ledger_id)
      .eq('account_type', 'creator_balance')
      .eq('entity_id', account.entity_id)
      .single()

    if (!balanceAccount) {
      return NextResponse.json({ error: 'Balance account not found' }, { status: 404 })
    }

    const { data: entries } = await supabase
      .from('entries')
      .select('entry_type, amount, transactions!inner(status)')
      .eq('account_id', balanceAccount.id)
      .eq('transactions.status', 'completed')

    let balance = 0
    for (const e of entries || []) {
      balance += (e as any).entry_type === 'credit' ? Number((e as any).amount) : -Number((e as any).amount)
    }
    const balanceCents = Math.round(balance * 100)

    if (amount_cents > balanceCents) {
      return NextResponse.json({
        error: 'Amount exceeds available balance',
        available_cents: balanceCents,
      }, { status: 400 })
    }

    // Insert payout request (server-side, validated)
    const { data: payoutReq, error: insertError } = await supabase
      .from('payout_requests')
      .insert({
        ledger_id: account.ledger_id,
        connected_account_id,
        recipient_entity_type: 'creator',
        recipient_entity_id: account.entity_id,
        requested_amount: amount_cents,
        status: 'pending',
        requested_by: user.id,
      })
      .select('id')
      .single()

    if (insertError) {
      return NextResponse.json({ error: 'Failed to create payout request' }, { status: 500 })
    }

    return NextResponse.json({ success: true, payout_request_id: payoutReq?.id })
  },
  { requireAuth: true, rateLimit: true, routePath: '/api/creator/payout-request' },
)
