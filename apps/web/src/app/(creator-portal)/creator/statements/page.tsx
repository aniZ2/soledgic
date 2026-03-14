import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { FileText, Clock, Calendar, CheckCircle, AlertCircle, FileOutput } from 'lucide-react'

interface ConnectedAccountRow {
  ledger_id: string
  entity_id: string
  ledger: {
    business_name: string
  } | null
}

interface StatementPeriod {
  id: string
  status: string
  start_date: string
  end_date: string
}

interface StatementView extends StatementPeriod {
  ledger_name: string
  entity_id: string
}

interface TaxDocumentRow {
  id: string
  document_type: string
  tax_year: number
  gross_amount: number
  status: string
  created_at: string
  ledger_name: string
}

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
  const statements: StatementView[] = []

  const connectedAccountRows = (connectedAccounts as ConnectedAccountRow[] | null) ?? []
  if (connectedAccountRows.length > 0) {
    for (const account of connectedAccountRows) {
      // Get frozen statements for this ledger
      const { data: periods } = await supabase
        .from('periods')
        .select('*')
        .eq('ledger_id', account.ledger_id)
        .eq('status', 'closed')
        .order('end_date', { ascending: false })
        .limit(12)

      const periodRows = (periods as StatementPeriod[] | null) ?? []
      for (const period of periodRows) {
        statements.push({
          ...period,
          ledger_name: account.ledger?.business_name || 'Unknown',
          entity_id: account.entity_id
        })
      }
    }
  }

  // Fetch tax documents for this creator across connected accounts
  const taxDocuments: TaxDocumentRow[] = []
  for (const account of connectedAccountRows) {
    const { data: docs } = await supabase
      .from('tax_documents')
      .select('id, document_type, tax_year, gross_amount, status, created_at')
      .eq('recipient_id', account.entity_id)
      .neq('status', 'superseded')
      .order('tax_year', { ascending: false })
      .limit(10)

    if (docs) {
      for (const doc of docs) {
        taxDocuments.push({
          ...(doc as { id: string; document_type: string; tax_year: number; gross_amount: number; status: string; created_at: string }),
          ledger_name: account.ledger?.business_name || 'Unknown',
        })
      }
    }
  }

  const formatCurrency = (cents: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

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
                <span
                  title="Statement downloads are coming soon"
                  className="inline-flex items-center gap-2 px-3 py-1.5 border border-border rounded-md text-sm text-muted-foreground cursor-not-allowed opacity-60"
                >
                  <Clock className="w-4 h-4" />
                  PDF
                </span>
                <span
                  title="Statement downloads are coming soon"
                  className="inline-flex items-center gap-2 px-3 py-1.5 border border-border rounded-md text-sm text-muted-foreground cursor-not-allowed opacity-60"
                >
                  <Clock className="w-4 h-4" />
                  CSV
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tax Documents */}
      <div className="bg-card border border-border rounded-lg mt-8">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Tax Documents</h2>
          <Link
            href="/creator/settings#tax"
            className="text-sm text-primary hover:underline"
          >
            Manage tax info
          </Link>
        </div>

        {taxDocuments.length > 0 ? (
          <div className="divide-y divide-border">
            {taxDocuments.map((doc) => (
              <div
                key={doc.id}
                className="px-6 py-4 flex items-center justify-between hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center">
                    <FileOutput className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      {doc.document_type} &mdash; {doc.tax_year}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {doc.ledger_name} &bull; Gross: {formatCurrency(Number(doc.gross_amount))}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {doc.status === 'filed' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded bg-green-500/10 text-green-700 dark:text-green-400">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Filed
                    </span>
                  ) : doc.status === 'exported' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">
                      <FileOutput className="w-3.5 h-3.5" />
                      Exported
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded bg-blue-500/10 text-blue-700 dark:text-blue-400">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Calculated
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center">
                <Calendar className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="font-medium text-foreground">1099-NEC Forms</p>
                <p className="text-sm text-muted-foreground mt-1">
                  1099-NEC forms will be available in January for the previous tax year,
                  if your earnings exceed the IRS reporting threshold ($600).
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
