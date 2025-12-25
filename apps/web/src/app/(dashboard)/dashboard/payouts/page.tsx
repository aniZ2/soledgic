import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Wallet, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'

export default async function PayoutsPage() {
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
    .select('id, business_name, payout_rails')
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

  // Get payout transactions
  const { data: payouts } = await supabase
    .from('transactions')
    .select(`
      id,
      reference_id,
      amount,
      description,
      status,
      created_at,
      metadata
    `)
    .eq('ledger_id', ledger.id)
    .eq('transaction_type', 'payout')
    .order('created_at', { ascending: false })
    .limit(50)

  // Calculate stats
  const stats = {
    total: payouts?.length || 0,
    completed: payouts?.filter(p => p.status === 'completed').length || 0,
    pending: payouts?.filter(p => p.status === 'pending').length || 0,
    totalAmount: payouts?.reduce((sum, p) => sum + Number(p.amount), 0) || 0,
  }

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />
      default:
        return <AlertCircle className="w-4 h-4 text-gray-500" />
    }
  }

  const payoutRails = (ledger.payout_rails as any[]) || []

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Payouts</h1>
        <p className="text-muted-foreground mt-1">
          Manage creator payouts for {ledger.business_name}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Total Payouts</p>
          <p className="text-2xl font-bold text-foreground mt-1">{stats.total}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Completed</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{stats.completed}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Pending</p>
          <p className="text-2xl font-bold text-yellow-600 mt-1">{stats.pending}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-6">
          <p className="text-sm text-muted-foreground">Total Amount</p>
          <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(stats.totalAmount)}</p>
        </div>
      </div>

      {/* Payment Rails */}
      <div className="bg-card border border-border rounded-lg mb-8">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Payment Rails</h2>
          <Link
            href="/settings/payment-rails"
            className="text-sm text-primary hover:underline"
          >
            Configure
          </Link>
        </div>
        <div className="p-6">
          {payoutRails.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No payment rails configured. Configure Stripe Connect, Plaid, or manual bank transfers.
            </p>
          ) : (
            <div className="flex gap-4">
              {payoutRails.map((rail: any) => (
                <div
                  key={rail.rail}
                  className={`px-4 py-2 rounded-lg border ${
                    rail.enabled 
                      ? 'border-green-500/50 bg-green-500/10' 
                      : 'border-border'
                  }`}
                >
                  <span className="text-sm font-medium capitalize">
                    {rail.rail.replace('_', ' ')}
                  </span>
                  <span className={`ml-2 text-xs ${rail.enabled ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {rail.enabled ? 'Active' : 'Disabled'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Payouts List */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Recent Payouts</h2>
        </div>
        
        {!payouts || payouts.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Wallet className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No payouts yet</p>
            <p className="text-sm mt-2">
              Use the API to process payouts: POST /process-payout
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Reference
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Creator
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Rail
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payouts.map((payout) => (
                <tr key={payout.id} className="hover:bg-muted/30">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <code className="text-xs bg-muted px-2 py-1 rounded">
                      {payout.reference_id}
                    </code>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                    {(payout.metadata as any)?.creator_id || '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(payout.status)}
                      <span className="text-sm capitalize">{payout.status}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground capitalize">
                    {(payout.metadata as any)?.rail_used || 'pending'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right font-medium text-foreground">
                    {formatCurrency(payout.amount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                    {formatDate(payout.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
