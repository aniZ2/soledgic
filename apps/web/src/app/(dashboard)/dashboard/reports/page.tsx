import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { FileText, Download, Calendar, TrendingUp, Scale } from 'lucide-react'

export default async function ReportsPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get user's organization
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) redirect('/onboarding')

  // Get first ledger
  const { data: ledgers } = await supabase
    .from('ledgers')
    .select('id, business_name, api_key')
    .eq('organization_id', membership.organization_id)
    .eq('status', 'active')
    .limit(1)

  const ledger = ledgers?.[0]

  if (!ledger) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No ledger found. Create one first.</p>
        <Link href="/ledgers/new" className="text-primary hover:underline mt-2 inline-block">
          Create Ledger
        </Link>
      </div>
    )
  }

  const reports = [
    {
      id: 'trial_balance',
      name: 'Trial Balance',
      description: 'Summary of all account balances showing debits and credits',
      icon: Scale,
      href: `/dashboard/reports/trial-balance`,
    },
    {
      id: 'profit_loss',
      name: 'Profit & Loss',
      description: 'Income statement showing revenue, expenses, and net income',
      icon: TrendingUp,
      href: `/dashboard/reports/profit-loss`,
    },
    {
      id: 'creator_statement',
      name: 'Creator Statements',
      description: 'Individual earnings statements for each creator',
      icon: FileText,
      href: `/dashboard/reports/creator-statements`,
    },
    {
      id: '1099_summary',
      name: '1099 Summary',
      description: 'Tax reporting summary for creator payments',
      icon: Calendar,
      href: `/dashboard/reports/1099`,
    },
  ]

  // Get accounting periods
  const { data: periods } = await supabase
    .from('accounting_periods')
    .select('*')
    .eq('ledger_id', ledger.id)
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(12)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Reports</h1>
        <p className="text-muted-foreground mt-1">
          Financial reports for {ledger.business_name}
        </p>
      </div>

      {/* Report Types */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        {reports.map((report) => (
          <Link
            key={report.id}
            href={report.href}
            className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-colors group"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <report.icon className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                  {report.name}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {report.description}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Accounting Periods */}
      <div className="bg-card border border-border rounded-lg">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Accounting Periods</h2>
        </div>
        
        {!periods || periods.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No accounting periods yet. Periods are created when you close a month.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {periods.map((period) => (
              <div key={period.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">
                    {new Date(period.year, period.month - 1).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                    })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {period.period_start} to {period.period_end}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    period.status === 'closed' 
                      ? 'bg-green-500/10 text-green-600' 
                      : period.status === 'locked'
                      ? 'bg-blue-500/10 text-blue-600'
                      : 'bg-yellow-500/10 text-yellow-600'
                  }`}>
                    {period.status}
                  </span>
                  {period.status === 'closed' && (
                    <Link
                      href={`/dashboard/reports/period/${period.id}`}
                      className="text-sm text-primary hover:underline"
                    >
                      View Frozen Report
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* API Info */}
      <div className="mt-8 bg-muted/50 border border-border rounded-lg p-6">
        <h3 className="font-semibold text-foreground mb-2">Generate via API</h3>
        <p className="text-sm text-muted-foreground mb-4">
          All reports can also be generated programmatically via the API:
        </p>
        <code className="text-sm bg-background border border-border px-4 py-2 rounded block overflow-x-auto">
          POST /generate-report &#123; &quot;report_type&quot;: &quot;trial_balance&quot; &#125;
        </code>
      </div>
    </div>
  )
}
