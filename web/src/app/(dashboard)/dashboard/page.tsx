import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  BookOpen,
  ArrowRight,
  AlertTriangle
} from 'lucide-react'

interface Organization {
  id: string
  name: string
  plan: string
  trial_ends_at: string | null
  current_ledger_count: number
}

export default async function DashboardPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()

  // Get user's organizations
  const { data: memberships } = await supabase
    .from('organization_members')
    .select(`
      organization:organizations(
        id, name, plan, trial_ends_at, current_ledger_count
      )
    `)
    .eq('user_id', user?.id)
    .eq('status', 'active')

  // Extract organizations from memberships, handling the nested structure
  const organizations: Organization[] = (memberships || [])
    .map(m => {
      const org = m.organization
      // Handle both array and object cases from Supabase
      if (Array.isArray(org)) return org[0] as Organization | undefined
      return org as Organization | undefined
    })
    .filter((org): org is Organization => org !== undefined && org !== null)

  const hasOrganization = organizations.length > 0

  // If no organization, show onboarding
  if (!hasOrganization) {
    return (
      <div>
        <h1 className="text-3xl font-bold text-foreground">Welcome to Soledge</h1>
        <p className="mt-2 text-muted-foreground">
          Let's set up your first organization to get started.
        </p>

        <div className="mt-8 max-w-lg">
          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-xl font-semibold text-foreground">Create your organization</h2>
            <p className="mt-2 text-muted-foreground">
              An organization is your billing entity. You can add multiple ledgers (businesses) to it.
            </p>
            <Link
              href="/onboarding"
              className="mt-6 inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90"
            >
              Get started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Get ledgers for the first organization
  const orgId = organizations[0]?.id
  const { data: ledgers } = await supabase
    .from('ledgers')
    .select('id, platform_name, status, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(5)

  // Mock stats (these would come from actual API calls)
  const stats = [
    { 
      name: 'Total Revenue', 
      value: '$0.00', 
      change: '+0%', 
      trend: 'up',
      icon: DollarSign 
    },
    { 
      name: 'Total Expenses', 
      value: '$0.00', 
      change: '+0%', 
      trend: 'up',
      icon: TrendingDown 
    },
    { 
      name: 'Net Income', 
      value: '$0.00', 
      change: '+0%', 
      trend: 'up',
      icon: TrendingUp 
    },
    { 
      name: 'Active Ledgers', 
      value: ledgers?.length || 0, 
      change: null, 
      trend: null,
      icon: BookOpen 
    },
  ]

  const trialEndsAt = organizations[0]?.trial_ends_at
  const isTrialing = trialEndsAt && new Date(trialEndsAt) > new Date()
  const daysLeft = trialEndsAt 
    ? Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">
            Overview of your financial activity
          </p>
        </div>
        <Link
          href="/ledgers/new"
          className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90"
        >
          New ledger
        </Link>
      </div>

      {/* Trial banner */}
      {isTrialing && daysLeft <= 7 && (
        <div className="mt-6 bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              Your trial ends in {daysLeft} days
            </p>
            <p className="text-sm text-muted-foreground">
              Add a payment method to continue using Soledge.
            </p>
          </div>
          <Link
            href="/billing"
            className="text-sm font-medium text-primary hover:underline"
          >
            Upgrade now
          </Link>
        </div>
      )}

      {/* Stats */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">{stat.name}</span>
              <stat.icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-2 text-3xl font-bold text-foreground">{stat.value}</p>
            {stat.change && (
              <p className={`mt-1 text-sm ${stat.trend === 'up' ? 'text-green-500' : 'text-red-500'}`}>
                {stat.change} from last month
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Recent Ledgers */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-foreground">Your Ledgers</h2>
          <Link href="/ledgers" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </div>
        
        {ledgers && ledgers.length > 0 ? (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Name</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Created</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {ledgers.map((ledger) => (
                  <tr key={ledger.id} className="border-b border-border last:border-0">
                    <td className="py-3 px-4">
                      <span className="font-medium text-foreground">{ledger.platform_name}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        ledger.status === 'active' 
                          ? 'bg-green-500/10 text-green-500'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {ledger.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground text-sm">
                      {new Date(ledger.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link 
                        href={`/ledgers/${ledger.id}`}
                        className="text-sm text-primary hover:underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground mx-auto" />
            <h3 className="mt-4 text-lg font-medium text-foreground">No ledgers yet</h3>
            <p className="mt-2 text-muted-foreground">
              Create your first ledger to start tracking finances.
            </p>
            <Link
              href="/ledgers/new"
              className="mt-4 inline-block bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90"
            >
              Create ledger
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
