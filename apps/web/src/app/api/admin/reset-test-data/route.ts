import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { createApiHandler, parseJsonBody } from '@/lib/api-handler'

export const POST = createApiHandler(
  async (request, { user }) => {
    const supabase = await createClient()

    const { data: body, error: parseError } = await parseJsonBody<{
      confirmation: string
    }>(request)

    if (parseError || !body || body.confirmation !== 'RESET TEST DATA') {
      return NextResponse.json(
        { error: 'You must confirm by sending { confirmation: "RESET TEST DATA" }' },
        { status: 400 }
      )
    }

    // Verify user is an admin/owner of their org
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user!.id)
      .eq('status', 'active')
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only organization owners and admins can reset test data' },
        { status: 403 }
      )
    }

    const orgId = membership.organization_id

    // Get all test ledger IDs for this org
    const { data: testLedgers } = await supabase
      .from('ledgers')
      .select('id')
      .eq('organization_id', orgId)
      .eq('livemode', false)

    if (!testLedgers || testLedgers.length === 0) {
      return NextResponse.json({ success: true, deleted: { ledgers: 0 } })
    }

    const testLedgerIds = testLedgers.map(l => l.id)

    // Delete child records in dependency order.
    // entries depend on transactions, so delete entries first.
    const deleted: Record<string, number> = {}

    // 1. Entries (depend on transactions + accounts)
    const { count: entriesCount } = await supabase
      .from('entries')
      .delete({ count: 'exact' })
      .in('ledger_id', testLedgerIds)
    deleted.entries = entriesCount ?? 0

    // 2. Transactions
    const { count: txCount } = await supabase
      .from('transactions')
      .delete({ count: 'exact' })
      .in('ledger_id', testLedgerIds)
    deleted.transactions = txCount ?? 0

    // 3. Accounts
    const { count: accountsCount } = await supabase
      .from('accounts')
      .delete({ count: 'exact' })
      .in('ledger_id', testLedgerIds)
    deleted.accounts = accountsCount ?? 0

    // 4. Payouts
    const { count: payoutsCount } = await supabase
      .from('payouts')
      .delete({ count: 'exact' })
      .in('ledger_id', testLedgerIds)
    deleted.payouts = payoutsCount ?? 0

    // 5. Webhook events
    const { count: webhookEventsCount } = await supabase
      .from('webhook_events')
      .delete({ count: 'exact' })
      .in('ledger_id', testLedgerIds)
    deleted.webhook_events = webhookEventsCount ?? 0

    // 6. Reconciliation records
    const { count: reconCount } = await supabase
      .from('reconciliation_records')
      .delete({ count: 'exact' })
      .in('ledger_id', testLedgerIds)
    deleted.reconciliation_records = reconCount ?? 0

    // 7. Tax documents
    const { count: taxCount } = await supabase
      .from('tax_documents')
      .delete({ count: 'exact' })
      .in('ledger_id', testLedgerIds)
    deleted.tax_documents = taxCount ?? 0

    // 8. Report exports
    const { count: reportCount } = await supabase
      .from('report_exports')
      .delete({ count: 'exact' })
      .in('ledger_id', testLedgerIds)
    deleted.report_exports = reportCount ?? 0

    // 9. Usage metrics tied to test ledgers
    const { count: usageCount } = await supabase
      .from('usage_metrics')
      .delete({ count: 'exact' })
      .in('ledger_id', testLedgerIds)
    deleted.usage_metrics = usageCount ?? 0

    // Note: We do NOT delete the test ledgers themselves — they keep their
    // API keys and group pairing. We only wipe their data so developers
    // can start fresh.

    const totalDeleted = Object.values(deleted).reduce((a, b) => a + b, 0)

    return NextResponse.json({
      success: true,
      testLedgerCount: testLedgerIds.length,
      totalRecordsDeleted: totalDeleted,
      deleted,
    })
  },
  {
    requireAuth: true,
    rateLimit: true,
    csrfProtection: true,
    routePath: '/api/admin/reset-test-data',
  }
)
