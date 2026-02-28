import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createApiHandler } from '@/lib/api-handler'

export const GET = createApiHandler(
  async (request: Request, { user }) => {
    const { searchParams } = new URL(request.url)
    const ledgerId = searchParams.get('ledger_id')
    const referenceId = searchParams.get('reference_id')

    if (!ledgerId || !referenceId) {
      return NextResponse.json({ error: 'Missing ledger_id or reference_id' }, { status: 400 })
    }

    const supabase = await createClient()

    // Verify user has access to this ledger
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

    // Lookup the transaction
    const { data: transaction, error } = await supabase
      .from('transactions')
      .select('id, reference_id, transaction_type, amount, status, metadata')
      .eq('ledger_id', ledgerId)
      .eq('reference_id', referenceId)
      .single()

    if (error || !transaction) {
      return NextResponse.json({ transaction: null })
    }

    return NextResponse.json({ transaction })
  },
  {
    csrfProtection: false, // GET requests don't need CSRF
    routePath: '/api/transactions/lookup',
  }
)
