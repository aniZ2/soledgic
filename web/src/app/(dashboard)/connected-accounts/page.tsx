import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Link2, Plus, AlertCircle, CheckCircle2, XCircle } from 'lucide-react'
import { AccountActions } from './account-actions'

export default async function ConnectedAccountsPage() {
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

  // Get connected accounts across all ledgers
  const { data: accounts } = await supabase
    .from('connected_accounts')
    .select(`
      *,
      ledger:ledgers(platform_name)
    `)
    .in('ledger_id', ledgerIds)
    .order('created_at', { ascending: false })

  const totalAccounts = accounts?.length || 0
  const enabledCount = accounts?.filter((a: any) => a.stripe_status === 'enabled').length || 0
  const needsAttentionCount = accounts?.filter((a: any) =>
    a.stripe_status === 'restricted' || a.stripe_status === 'pending'
  ).length || 0

  const statusBadge = (status: string) => {
    switch (status) {
      case 'enabled':
        return 'bg-green-500/10 text-green-500'
      case 'restricted':
        return 'bg-amber-500/10 text-amber-500'
      case 'pending':
        return 'bg-blue-500/10 text-blue-500'
      case 'disabled':
        return 'bg-red-500/10 text-red-500'
      default:
        return 'bg-muted text-muted-foreground'
    }
  }

  const entityTypeBadge = (type: string) => {
    switch (type) {
      case 'creator':
        return 'bg-purple-500/10 text-purple-500'
      case 'venture':
        return 'bg-blue-500/10 text-blue-500'
      case 'merchant':
        return 'bg-emerald-500/10 text-emerald-500'
      default:
        return 'bg-muted text-muted-foreground'
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Connected Accounts</h1>
          <p className="mt-1 text-muted-foreground">
            Manage Stripe connected accounts for payouts and compliance
          </p>
        </div>
        <Link
          href="/connected-accounts/new"
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Add account
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Total Accounts</p>
          <p className="text-3xl font-bold text-foreground mt-1">{totalAccounts}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Fully Enabled</p>
          <p className="text-3xl font-bold text-green-500 mt-1">{enabledCount}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Needs Attention</p>
          <p className="text-3xl font-bold text-amber-500 mt-1">{needsAttentionCount}</p>
        </div>
      </div>

      {/* Info Banner */}
      <div className="mt-6 bg-muted/30 border border-border rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="text-foreground">
              You initiate onboarding and track status. Stripe-hosted onboarding collects and verifies identity, bank details, and business information required for payouts.
            </p>
          </div>
        </div>
      </div>

      {/* Accounts Table */}
      <div className="mt-8">
        {accounts && accounts.length > 0 ? (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Display Name / Email</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Entity Type</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Stripe Status</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">Charges</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">Details</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account: any) => (
                  <tr key={account.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium text-foreground">{account.display_name || account.entity_id}</p>
                        <p className="text-sm text-muted-foreground">{account.email || '-'}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${entityTypeBadge(account.entity_type)}`}>
                        {account.entity_type}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusBadge(account.stripe_status)}`}>
                        {account.stripe_status || 'pending'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {account.charges_enabled ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground mx-auto" />
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {account.details_submitted ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground mx-auto" />
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <AccountActions
                        stripeStatus={account.stripe_status}
                        detailsSubmitted={account.details_submitted}
                        stripeAccountId={account.stripe_account_id}
                        ledgerId={account.ledger_id}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <Link2 className="h-12 w-12 text-muted-foreground mx-auto" />
            <h3 className="mt-4 text-lg font-medium text-foreground">No connected accounts yet</h3>
            <p className="mt-2 text-muted-foreground max-w-sm mx-auto">
              Add a connected account to start collecting KYC information and enable payouts.
            </p>
            <Link
              href="/connected-accounts/new"
              className="mt-6 inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Add account
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
