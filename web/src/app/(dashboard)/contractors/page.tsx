import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Users, Plus, AlertCircle, CheckCircle2, Download, ExternalLink } from 'lucide-react'

export default async function ContractorsPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()

  // Get user's organizations
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user?.id)
    .eq('status', 'active')

  const orgIds = memberships?.map(m => m.organization_id) || []

  // Get ledgers
  const { data: ledgers } = await supabase
    .from('ledgers')
    .select('id, platform_name')
    .in('organization_id', orgIds)

  const ledgerIds = ledgers?.map(l => l.id) || []

  // Get contractors across all ledgers
  const { data: contractors } = await supabase
    .from('contractors')
    .select(`
      *,
      ledger:ledgers(platform_name)
    `)
    .in('ledger_id', ledgerIds)
    .order('created_at', { ascending: false })

  // Get current year for 1099 threshold
  const currentYear = new Date().getFullYear()
  const threshold1099 = 600

  // Count contractors needing 1099
  const contractorsNeeding1099 = contractors?.filter(
    (c: any) => (c.ytd_payments || 0) >= threshold1099 * 100
  ).length || 0

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Contractors</h1>
          <p className="mt-1 text-muted-foreground">
            Track payments and generate 1099 data
          </p>
        </div>
        <Link
          href="/contractors/new"
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Add contractor
        </Link>
      </div>

      {/* 1099 Summary Card */}
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Total Contractors</p>
          <p className="text-3xl font-bold text-foreground mt-1">{contractors?.length || 0}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Need 1099-NEC</p>
          <p className="text-3xl font-bold text-amber-500 mt-1">{contractorsNeeding1099}</p>
          <p className="text-xs text-muted-foreground mt-1">Paid ≥$600 in {currentYear}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Filing Deadline</p>
          <p className="text-xl font-bold text-foreground mt-1">Jan 31, {currentYear + 1}</p>
          <p className="text-xs text-muted-foreground mt-1">For {currentYear} payments</p>
        </div>
      </div>

      {/* 1099 Info Banner */}
      <div className="mt-6 bg-muted/30 border border-border rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="text-foreground">
              <strong>1099-NEC filing:</strong> Soledge tracks payments and generates export data. 
              To file, download the 1099 summary and submit via{' '}
              <a 
                href="https://www.irs.gov/filing/e-file-forms-1099" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                IRS FIRE system
                <ExternalLink className="h-3 w-3" />
              </a>
              {' '}or mail paper forms.
            </p>
          </div>
        </div>
      </div>

      {/* Export Button */}
      {contractorsNeeding1099 > 0 && (
        <div className="mt-4">
          <button className="flex items-center gap-2 px-4 py-2 border border-border rounded-md hover:bg-accent">
            <Download className="h-4 w-4" />
            Export 1099-NEC Data (CSV)
          </button>
        </div>
      )}

      {/* Contractors List */}
      <div className="mt-8">
        {contractors && contractors.length > 0 ? (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Name</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Business</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Ledger</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">W-9</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">{currentYear} Payments</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">1099 Status</th>
                </tr>
              </thead>
              <tbody>
                {contractors.map((contractor: any) => {
                  const ytdPayments = contractor.ytd_payments || 0
                  const needs1099 = ytdPayments >= threshold1099 * 100
                  
                  return (
                    <tr key={contractor.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium text-foreground">{contractor.name}</p>
                          <p className="text-sm text-muted-foreground">{contractor.email}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {contractor.business_name || '-'}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-sm">
                        {contractor.ledger?.platform_name}
                      </td>
                      <td className="py-3 px-4">
                        {contractor.w9_received ? (
                          <span className="inline-flex items-center gap-1 text-green-500 text-sm">
                            <CheckCircle2 className="h-4 w-4" />
                            On file
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-500 text-sm">
                            <AlertCircle className="h-4 w-4" />
                            Missing
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-foreground">
                        ${(ytdPayments / 100).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {needs1099 ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-500">
                            1099 Required
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                            Under $600
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground mx-auto" />
            <h3 className="mt-4 text-lg font-medium text-foreground">No contractors yet</h3>
            <p className="mt-2 text-muted-foreground max-w-sm mx-auto">
              Add contractors to track payments and generate 1099 data at year-end.
            </p>
            <Link
              href="/contractors/new"
              className="mt-6 inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Add contractor
            </Link>
          </div>
        )}
      </div>

      {/* W-9 Note */}
      <div className="mt-6 text-sm text-muted-foreground">
        <p>
          <strong>W-9 requirement:</strong> Collect a W-9 from each contractor before paying them. 
          Soledge tracks whether you've received it, but does not store tax ID numbers.
        </p>
      </div>
    </div>
  )
}
