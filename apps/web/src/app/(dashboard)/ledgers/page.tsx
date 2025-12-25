import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus, BookOpen, MoreVertical } from 'lucide-react'

export default async function LedgersPage() {
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
    .select('*')
    .in('organization_id', orgIds)
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Ledgers</h1>
          <p className="mt-1 text-muted-foreground">
            Manage your business ledgers
          </p>
        </div>
        <Link
          href="/ledgers/new"
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New ledger
        </Link>
      </div>

      <div className="mt-8">
        {ledgers && ledgers.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {ledgers.map((ledger) => (
              <Link
                key={ledger.id}
                href={`/ledgers/${ledger.id}`}
                className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <BookOpen className="h-5 w-5 text-primary" />
                  </div>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    ledger.status === 'active' 
                      ? 'bg-green-500/10 text-green-500'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {ledger.status}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-foreground">
                  {ledger.platform_name}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Created {new Date(ledger.created_at).toLocaleDateString()}
                </p>
                <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {ledger.settings?.default_platform_fee_percent || 20}% platform fee
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground mx-auto" />
            <h3 className="mt-4 text-lg font-medium text-foreground">No ledgers yet</h3>
            <p className="mt-2 text-muted-foreground max-w-sm mx-auto">
              Create your first ledger to start tracking finances for a business.
            </p>
            <Link
              href="/ledgers/new"
              className="mt-6 inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Create ledger
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
