import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus, BookOpen } from 'lucide-react'
import { getLivemode } from '@/lib/livemode-server'
import { LedgerCard } from '@/components/ledger-card'

export default async function LedgersPage() {
  const supabase = await createClient()
  const livemode = await getLivemode()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get organizations visible to current user.
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('status', 'active')

  const orgIds = memberships?.map(m => m.organization_id) || []

  // Get ledgers
  const { data: ledgers } = await supabase
    .from('ledgers')
    .select('*')
    .in('organization_id', orgIds)
    .eq('livemode', livemode)
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
              <LedgerCard key={ledger.id} ledger={ledger} />
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
