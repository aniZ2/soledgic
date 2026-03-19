import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createApiHandler } from '@/lib/api-handler'
import { getLivemode, getActiveLedgerGroupId } from '@/lib/livemode-server'
import { pickActiveLedger } from '@/lib/active-ledger'

export const GET = createApiHandler(
  async (request: Request, { user }) => {
    const supabase = await createClient()
    const livemode = await getLivemode()
    const activeLedgerGroupId = await getActiveLedgerGroupId()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!membership) return NextResponse.json({ error: 'No org' }, { status: 404 })

    const { data: ledgers } = await supabase
      .from('ledgers')
      .select('id, business_name, ledger_group_id')
      .eq('organization_id', membership.organization_id)
      .eq('status', 'active')
      .eq('livemode', livemode)

    const ledger = pickActiveLedger(ledgers, activeLedgerGroupId)
    if (!ledger) return NextResponse.json({ error: 'No ledger' }, { status: 404 })

    // Counts by entry_method (exclude voided/reversed)
    const countsByMethod: Record<string, number> = {}
    for (const method of ['processor', 'manual', 'system', 'import']) {
      const { count } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('ledger_id', ledger.id)
        .eq('entry_method', method)
        .not('status', 'in', '("voided","reversed")')

      countsByMethod[method] = count || 0
    }

    // Also count NULLs (pre-migration transactions)
    const { count: nullCount } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('ledger_id', ledger.id)
      .is('entry_method', null)
      .not('status', 'in', '("voided","reversed")')

    countsByMethod['untagged'] = nullCount || 0

    // Manual transactions that are sales/income (the sensitive ones for book-cooking risk)
    const { data: manualRevenue } = await supabase
      .from('transactions')
      .select('id, transaction_type, reference_id, amount, description, status, created_at, metadata, entry_method')
      .eq('ledger_id', ledger.id)
      .eq('entry_method', 'manual')
      .in('transaction_type', ['sale', 'income'])
      .not('status', 'in', '("voided","reversed")')
      .order('created_at', { ascending: false })
      .limit(50)

    // System-repaired transactions (auto-booked by inbox processor or reconciler)
    const { data: systemRepaired } = await supabase
      .from('transactions')
      .select('id, transaction_type, reference_id, amount, description, status, created_at, metadata, entry_method')
      .eq('ledger_id', ledger.id)
      .eq('entry_method', 'system')
      .not('status', 'in', '("voided","reversed")')
      .order('created_at', { ascending: false })
      .limit(50)

    // Manual sales/income total vs processor sales total (for mismatch ratio)
    const { data: manualRevenueSum } = await supabase
      .from('transactions')
      .select('amount')
      .eq('ledger_id', ledger.id)
      .eq('entry_method', 'manual')
      .in('transaction_type', ['sale', 'income'])
      .eq('status', 'completed')

    const { data: processorRevenueSum } = await supabase
      .from('transactions')
      .select('amount')
      .eq('ledger_id', ledger.id)
      .eq('entry_method', 'processor')
      .in('transaction_type', ['sale', 'income'])
      .eq('status', 'completed')

    const manualTotal = (manualRevenueSum || []).reduce((s, r) => s + Number(r.amount || 0), 0)
    const processorTotal = (processorRevenueSum || []).reduce((s, r) => s + Number(r.amount || 0), 0)

    return NextResponse.json({
      ledger_id: ledger.id,
      business_name: ledger.business_name,
      counts: countsByMethod,
      manual_revenue: manualRevenue || [],
      system_repaired: systemRepaired || [],
      totals: {
        manual_revenue: manualTotal,
        processor_revenue: processorTotal,
      },
    })
  },
  { routePath: '/api/reconciliation/provenance' }
)
