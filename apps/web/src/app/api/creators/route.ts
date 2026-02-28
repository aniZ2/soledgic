import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createApiHandler } from '@/lib/api-handler'

export const GET = createApiHandler(
  async (request: Request, { user }) => {
    const { searchParams } = new URL(request.url)
    const ledgerId = searchParams.get('ledger_id')

    const supabase = await createClient()

    // If ledger_id provided, verify access
    if (ledgerId) {
      const { data: ledger } = await supabase
        .from('ledgers')
        .select('id, organization_id')
        .eq('id', ledgerId)
        .single()

      if (!ledger) {
        return NextResponse.json({ error: 'Ledger not found' }, { status: 404 })
      }

      const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user!.id)
        .eq('organization_id', ledger.organization_id)
        .eq('status', 'active')
        .single()

      if (!membership) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }

      // Get creators for this ledger
      const { data: creators, error } = await supabase
        .from('accounts')
        .select('id, entity_id, name, metadata, created_at')
        .eq('ledger_id', ledgerId)
        .eq('account_type', 'creator_balance')
        .eq('is_active', true)
        .order('name')

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      // Get balances for each creator
      const creatorsWithBalances = await Promise.all(
        (creators || []).map(async (creator) => {
          const { data: entries } = await supabase
            .from('entries')
            .select('entry_type, amount, transactions!inner(status)')
            .eq('account_id', creator.id)
            .not('transactions.status', 'in', '("voided","reversed")')

          let balance = 0
          for (const e of entries || []) {
            balance += e.entry_type === 'credit' ? Number(e.amount) : -Number(e.amount)
          }

          return {
            ...creator,
            balance: Math.round(balance * 100) / 100,
          }
        })
      )

      return NextResponse.json({ creators: creatorsWithBalances })
    }

    // No ledger_id - get all creators across user's ledgers
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user!.id)
      .eq('status', 'active')
      .single()

    if (!membership) {
      return NextResponse.json({ creators: [] })
    }

    const { data: ledgers } = await supabase
      .from('ledgers')
      .select('id')
      .eq('organization_id', membership.organization_id)
      .eq('status', 'active')

    if (!ledgers || ledgers.length === 0) {
      return NextResponse.json({ creators: [] })
    }

    const { data: creators } = await supabase
      .from('accounts')
      .select('id, entity_id, name, ledger_id, metadata, created_at')
      .in('ledger_id', ledgers.map(l => l.id))
      .eq('account_type', 'creator_balance')
      .eq('is_active', true)
      .order('name')

    return NextResponse.json({ creators: creators || [] })
  },
  {
    csrfProtection: false, // GET requests don't need CSRF
    routePath: '/api/creators',
  }
)
