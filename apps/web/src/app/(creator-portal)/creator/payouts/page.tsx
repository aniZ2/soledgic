import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { type LucideIcon } from 'lucide-react'
import { ArrowUpRight, Clock, CheckCircle, XCircle, Plus } from 'lucide-react'

interface ConnectedAccountRow {
  id: string
  ledger_id: string
  entity_id: string
  default_bank_last4: string | null
  default_bank_name: string | null
  ledger: {
    business_name: string
  } | null
}

interface PayoutRequestRow {
  id: string
  created_at: string
  status: string
  approved_amount: number | null
  requested_amount: number
}

interface PayoutRequestView extends PayoutRequestRow {
  ledger_name: string
  bank_last4: string | null
  bank_name: string | null
}

export default async function CreatorPayoutsPage() {
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
      payouts_enabled,
      default_bank_last4,
      default_bank_name,
      ledger:ledgers(business_name)
    `)
    .eq('email', creatorEmail)
    .eq('is_active', true)

  // Get payout requests
  const payoutRequests: PayoutRequestView[] = []
  let totalAvailable = 0

  const connectedAccountsRows = (connectedAccounts as ConnectedAccountRow[] | null) ?? []
  if (connectedAccountsRows.length > 0) {
    for (const account of connectedAccountsRows) {
      // Get payout requests
      const { data: requests } = await supabase
        .from('payout_requests')
        .select('*')
        .eq('connected_account_id', account.id)
        .order('created_at', { ascending: false })
        .limit(20)

      const requestRows = (requests as PayoutRequestRow[] | null) ?? []
      for (const request of requestRows) {
        payoutRequests.push({
          ...request,
          ledger_name: account.ledger?.business_name || 'Unknown',
          bank_last4: account.default_bank_last4,
          bank_name: account.default_bank_name
        })
      }

      // Get available balance
      const { data: creatorAccount } = await supabase
        .from('accounts')
        .select('balance')
        .eq('ledger_id', account.ledger_id)
        .eq('account_type', 'creator_balance')
        .eq('entity_id', account.entity_id)
        .single()

      if (creatorAccount) {
        totalAvailable += Number(creatorAccount.balance || 0)
      }
    }
  }

  // Sort by date
  payoutRequests.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; text: string; icon: LucideIcon }> = {
      pending: { bg: 'bg-amber-500/10', text: 'text-amber-600', icon: Clock },
      approved: { bg: 'bg-blue-500/10', text: 'text-blue-600', icon: Clock },
      processing: { bg: 'bg-blue-500/10', text: 'text-blue-600', icon: Clock },
      completed: { bg: 'bg-green-500/10', text: 'text-green-600', icon: CheckCircle },
      rejected: { bg: 'bg-red-500/10', text: 'text-red-600', icon: XCircle },
      failed: { bg: 'bg-red-500/10', text: 'text-red-600', icon: XCircle },
    }
    const style = styles[status] || styles.pending
    const Icon = style.icon

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
        <Icon className="w-3 h-3" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Payouts</h1>
          <p className="text-muted-foreground mt-1">
            Request and track your payout history
          </p>
        </div>
        <Link
          href="/creator/payouts/request"
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Request Payout
        </Link>
      </div>

      {/* Available Balance */}
      <div className="bg-card border border-border rounded-lg p-6 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Available for Payout</p>
            <p className="text-3xl font-bold text-foreground mt-1">
              {formatCurrency(totalAvailable)}
            </p>
          </div>
          {totalAvailable > 0 && (
            <Link
              href="/creator/payouts/request"
              className="inline-flex items-center gap-2 border border-primary text-primary px-4 py-2 rounded-md hover:bg-primary/10 transition-colors"
            >
              <ArrowUpRight className="w-4 h-4" />
              Withdraw
            </Link>
          )}
        </div>
      </div>

      {/* Payout History */}
      <div className="bg-card border border-border rounded-lg">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Payout History</h2>
        </div>

        {payoutRequests.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No payout requests yet. Request your first payout to withdraw funds.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {payoutRequests.map((request) => (
              <div
                key={request.id}
                className="px-6 py-4 flex items-center justify-between hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                    <ArrowUpRight className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      Payout to {request.bank_name || 'Bank'} ****{request.bank_last4 || '****'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {request.ledger_name} &bull; {formatDate(request.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {getStatusBadge(request.status)}
                  <p className="font-medium text-foreground">
                    {formatCurrency(request.approved_amount || request.requested_amount)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
