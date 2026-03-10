import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, ShieldCheck, ShieldAlert, AlertTriangle, Cpu,
} from 'lucide-react'
import { getLivemode, getActiveLedgerGroupId } from '@/lib/livemode-server'
import { pickActiveLedger } from '@/lib/active-ledger'
import { ExportButton } from '@/components/reports/export-button'

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

interface Transaction {
  id: string
  transaction_type: string
  reference_id: string
  amount: number
  description: string | null
  status: string
  created_at: string
  metadata: Record<string, unknown> | null
  entry_method: string | null
}

export default async function ProvenanceReportPage() {
  const supabase = await createClient()
  const livemode = await getLivemode()
  const activeLedgerGroupId = await getActiveLedgerGroupId()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!membership) redirect('/onboarding')

  const { data: ledgers } = await supabase
    .from('ledgers')
    .select('id, business_name, ledger_group_id')
    .eq('organization_id', membership.organization_id)
    .eq('status', 'active')
    .eq('livemode', livemode)

  const ledger = pickActiveLedger(ledgers, activeLedgerGroupId)

  if (!ledger) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No ledger found.</p>
      </div>
    )
  }

  // Counts by entry_method
  const countsByMethod: Record<string, number> = {}
  for (const method of ['processor', 'manual', 'system', 'import']) {
    const { count } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('ledger_id', ledger.id)
      .eq('entry_method', method)
    countsByMethod[method] = count || 0
  }

  const { count: nullCount } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('ledger_id', ledger.id)
    .is('entry_method', null)
  countsByMethod['untagged'] = nullCount || 0

  const totalTx = Object.values(countsByMethod).reduce((s, n) => s + n, 0)

  // Manual revenue transactions (sales/income without processor verification)
  const { data: manualRevenue } = await supabase
    .from('transactions')
    .select('id, transaction_type, reference_id, amount, description, status, created_at, metadata, entry_method')
    .eq('ledger_id', ledger.id)
    .eq('entry_method', 'manual')
    .in('transaction_type', ['sale', 'income'])
    .order('created_at', { ascending: false })
    .limit(100)

  // System-repaired transactions
  const { data: systemRepaired } = await supabase
    .from('transactions')
    .select('id, transaction_type, reference_id, amount, description, status, created_at, metadata, entry_method')
    .eq('ledger_id', ledger.id)
    .eq('entry_method', 'system')
    .order('created_at', { ascending: false })
    .limit(100)

  // Revenue totals
  const { data: manualRevenueRows } = await supabase
    .from('transactions')
    .select('amount')
    .eq('ledger_id', ledger.id)
    .eq('entry_method', 'manual')
    .in('transaction_type', ['sale', 'income'])
    .eq('status', 'completed')

  const { data: processorRevenueRows } = await supabase
    .from('transactions')
    .select('amount')
    .eq('ledger_id', ledger.id)
    .eq('entry_method', 'processor')
    .in('transaction_type', ['sale', 'income'])
    .eq('status', 'completed')

  const manualTotal = (manualRevenueRows || []).reduce((s, r) => s + Number(r.amount || 0), 0)
  const processorTotal = (processorRevenueRows || []).reduce((s, r) => s + Number(r.amount || 0), 0)
  const totalRevenue = manualTotal + processorTotal

  const manualRatio = totalRevenue > 0 ? manualTotal / totalRevenue : 0
  const manualPct = totalTx > 0 ? ((countsByMethod.manual || 0) / totalTx * 100).toFixed(1) : '0'
  const manualRevenuePct = totalRevenue > 0 ? (manualTotal / totalRevenue * 100).toFixed(1) : '0'

  const healthColor = manualRatio < 0.05
    ? 'text-green-600'
    : manualRatio < 0.20
    ? 'text-yellow-600'
    : 'text-red-600'
  const healthBg = manualRatio < 0.05
    ? 'bg-green-500/10 border-green-500/20'
    : manualRatio < 0.20
    ? 'bg-yellow-500/10 border-yellow-500/20'
    : 'bg-red-500/10 border-red-500/20'
  const HealthIcon = manualRatio < 0.05 ? ShieldCheck : manualRatio < 0.20 ? AlertTriangle : ShieldAlert
  const healthLabel = manualRatio < 0.05
    ? 'Ledger integrity is strong. Nearly all revenue is processor-verified.'
    : manualRatio < 0.20
    ? 'Some revenue entries are manually recorded without processor verification.'
    : 'A significant portion of revenue is manually entered. Review recommended.'

  const manualRevList = (manualRevenue || []) as Transaction[]
  const systemRepList = (systemRepaired || []) as Transaction[]

  return (
    <div>
      <div className="mb-8">
        <Link
          href="/dashboard/reports"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Reports
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Provenance Report</h1>
            <p className="text-muted-foreground mt-1">
              {ledger.business_name} &bull; As of {new Date().toLocaleDateString()}
            </p>
          </div>
          <ExportButton reportType="provenance" ledgerId={ledger.id} />
        </div>
      </div>

      {/* Health Summary */}
      <div className={`rounded-lg border p-6 mb-6 ${healthBg}`}>
        <div className="flex items-start gap-4">
          <HealthIcon className={`w-8 h-8 mt-0.5 ${healthColor}`} />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-foreground">Provenance Integrity</h2>
            <p className="text-sm text-muted-foreground mt-1">{healthLabel}</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
          <div className="bg-background/50 rounded-md p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Processor-Verified</p>
            <p className="text-xl font-bold text-foreground mt-1">{countsByMethod.processor || 0}</p>
          </div>
          <div className="bg-background/50 rounded-md p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Manual Entries</p>
            <p className="text-xl font-bold text-foreground mt-1">
              {countsByMethod.manual || 0}
              <span className="text-sm font-normal text-muted-foreground ml-1">({manualPct}%)</span>
            </p>
          </div>
          <div className="bg-background/50 rounded-md p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">System Auto-Repaired</p>
            <p className="text-xl font-bold text-foreground mt-1">{countsByMethod.system || 0}</p>
          </div>
          <div className="bg-background/50 rounded-md p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Imported</p>
            <p className="text-xl font-bold text-foreground mt-1">{countsByMethod.import || 0}</p>
          </div>
          <div className="bg-background/50 rounded-md p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              {(countsByMethod.untagged || 0) > 0 ? 'Untagged (Pre-Migration)' : 'Total'}
            </p>
            <p className="text-xl font-bold text-foreground mt-1">
              {(countsByMethod.untagged || 0) > 0 ? countsByMethod.untagged : totalTx}
            </p>
          </div>
        </div>

        {/* Revenue Breakdown */}
        {totalRevenue > 0 && (
          <div className="mt-6 pt-4 border-t border-border/50">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Revenue via Processor</span>
              <span className="font-medium text-foreground">{formatCurrency(processorTotal)}</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-muted-foreground">Revenue via Manual Entry</span>
              <span className={`font-medium ${manualRevList.length > 0 ? healthColor : 'text-foreground'}`}>
                {formatCurrency(manualTotal)}
                {manualRevList.length > 0 && (
                  <span className="text-xs ml-1">({manualRevenuePct}% of revenue)</span>
                )}
              </span>
            </div>
            <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full"
                style={{ width: `${100 - Number(manualRevenuePct)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>Processor-verified</span>
              <span>Manual</span>
            </div>
          </div>
        )}
      </div>

      {/* Manual Revenue Entries */}
      {manualRevList.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-border flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            <div>
              <h2 className="font-semibold text-foreground">
                Manual Revenue Entries ({manualRevList.length})
              </h2>
              <p className="text-xs text-muted-foreground">
                Sales and income recorded without processor verification
              </p>
            </div>
          </div>
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Date</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Type</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Reference</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Description</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {manualRevList.map((tx) => (
                <tr key={tx.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(tx.created_at)}</td>
                  <td className="px-4 py-3">
                    <span className="capitalize text-sm font-medium text-foreground">{tx.transaction_type}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/transactions/${tx.id}`}>
                      <code className="text-xs bg-muted px-2 py-1 rounded hover:underline">{tx.reference_id}</code>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground max-w-xs truncate">
                    {tx.description || '\u2014'}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-foreground">
                    {formatCurrency(tx.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* System-Repaired Entries */}
      {systemRepList.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-border flex items-center gap-3">
            <Cpu className="w-5 h-5 text-blue-500" />
            <div>
              <h2 className="font-semibold text-foreground">
                System Auto-Repaired ({systemRepList.length})
              </h2>
              <p className="text-xs text-muted-foreground">
                Transactions auto-booked by reconciler or webhook processor
              </p>
            </div>
          </div>
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Date</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Type</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Reference</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Source</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {systemRepList.map((tx) => (
                <tr key={tx.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(tx.created_at)}</td>
                  <td className="px-4 py-3">
                    <span className="capitalize text-sm font-medium text-foreground">{tx.transaction_type}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/transactions/${tx.id}`}>
                      <code className="text-xs bg-muted px-2 py-1 rounded hover:underline">{tx.reference_id}</code>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {(tx.metadata?.booked_from as string) === 'process_processor_inbox'
                      ? 'Webhook processor'
                      : (tx.metadata?.reconciled as boolean)
                      ? 'Reconciler'
                      : (tx.metadata?.auto_repaired as boolean)
                      ? 'Auto-repair'
                      : 'System'}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-foreground">
                    {formatCurrency(tx.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* All clear */}
      {manualRevList.length === 0 && systemRepList.length === 0 && totalTx > 0 && (
        <div className="bg-card border border-border rounded-lg p-8 text-center mb-6">
          <ShieldCheck className="w-10 h-10 text-green-500 mx-auto" />
          <h3 className="mt-3 font-semibold text-foreground">All entries verified</h3>
          <p className="text-sm text-muted-foreground mt-1">
            No manual revenue entries or system repairs to review.
          </p>
        </div>
      )}
    </div>
  )
}
