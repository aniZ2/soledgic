import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { FileText, Download, Calendar } from 'lucide-react'

export default async function CreatorStatementsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/creator/login')

  const creatorEmail = user.email

  // Find all connected accounts for this creator email
  const { data: connectedAccounts } = await supabase
    .from('connected_accounts')
    .select(`
      id,
      ledger_id,
      entity_id,
      display_name,
      ledger:ledgers(business_name)
    `)
    .eq('email', creatorEmail)
    .eq('is_active', true)

  // Get statements (frozen periods)
  const statements: any[] = []

  if (connectedAccounts && connectedAccounts.length > 0) {
    for (const account of connectedAccounts) {
      // Get frozen statements for this ledger
      const { data: periods } = await supabase
        .from('periods')
        .select('*')
        .eq('ledger_id', account.ledger_id)
        .eq('status', 'closed')
        .order('end_date', { ascending: false })
        .limit(12)

      if (periods) {
        for (const period of periods) {
          statements.push({
            ...period,
            ledger_name: (account.ledger as any)?.business_name || 'Unknown',
            entity_id: account.entity_id
          })
        }
      }
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    })
  }

  const formatDateRange = (start: string, end: string) => {
    const startDate = new Date(start)
    const endDate = new Date(end)
    return `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }

  // Generate synthetic monthly statements if no periods exist
  const months = []
  const now = new Date()
  for (let i = 0; i < 6; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({
      month: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      year: date.getFullYear(),
      monthNum: date.getMonth() + 1
    })
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Statements</h1>
        <p className="text-muted-foreground mt-1">
          Download your monthly earnings statements
        </p>
      </div>

      {/* Monthly Statements */}
      <div className="bg-card border border-border rounded-lg">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Monthly Statements</h2>
        </div>

        <div className="divide-y divide-border">
          {months.map((month) => (
            <div
              key={month.month}
              className="px-6 py-4 flex items-center justify-between hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{month.month}</p>
                  <p className="text-sm text-muted-foreground">Earnings Statement</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href={`/api/creator/statements/${month.year}/${month.monthNum}/pdf`}
                  className="inline-flex items-center gap-2 px-3 py-1.5 border border-border rounded-md text-sm text-foreground hover:bg-accent transition-colors"
                >
                  <Download className="w-4 h-4" />
                  PDF
                </Link>
                <Link
                  href={`/api/creator/statements/${month.year}/${month.monthNum}/csv`}
                  className="inline-flex items-center gap-2 px-3 py-1.5 border border-border rounded-md text-sm text-foreground hover:bg-accent transition-colors"
                >
                  <Download className="w-4 h-4" />
                  CSV
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tax Documents */}
      <div className="bg-card border border-border rounded-lg mt-8">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Tax Documents</h2>
        </div>

        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="font-medium text-foreground">1099-K Forms</p>
              <p className="text-sm text-muted-foreground mt-1">
                1099-K forms will be available in January for the previous tax year,
                if your earnings exceed the IRS reporting threshold.
              </p>
              <Link
                href="/creator/settings#tax"
                className="text-sm text-primary hover:underline mt-2 inline-block"
              >
                Update your tax information
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
