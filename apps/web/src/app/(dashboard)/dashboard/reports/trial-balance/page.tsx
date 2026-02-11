import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Scale } from 'lucide-react'
import { getLivemode, getActiveLedgerGroupId } from '@/lib/livemode-server'
import { pickActiveLedger } from '@/lib/active-ledger'
import { ExportButton } from '@/components/reports/export-button'

export default async function TrialBalancePage() {
  const supabase = await createClient()
  const livemode = await getLivemode()
  const activeLedgerGroupId = await getActiveLedgerGroupId()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!membership) redirect('/onboarding')

  const { data: ledgers } = await supabase
    .from('ledgers')
    .select('id, business_name, api_key, ledger_group_id')
    .eq('organization_id', membership.organization_id)
    .eq('status', 'active')
    .eq('livemode', livemode)

  const ledger = pickActiveLedger(ledgers, activeLedgerGroupId)

  if (!ledger) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No ledger found.</p>
      </div>
    )
  }

  // Get all accounts with their balances
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name, account_type, entity_type')
    .eq('ledger_id', ledger.id)
    .eq('is_active', true)
    .order('account_type')
    .order('name')

  // Calculate balances for each account
  const accountsWithBalances = await Promise.all(
    (accounts || []).map(async (account) => {
      const { data: entries } = await supabase
        .from('entries')
        .select('entry_type, amount, transactions!inner(status)')
        .eq('account_id', account.id)
        .not('transactions.status', 'in', '("voided","reversed","draft")')

      let debits = 0
      let credits = 0
      
      for (const e of entries || []) {
        if (e.entry_type === 'debit') {
          debits += Number(e.amount)
        } else {
          credits += Number(e.amount)
        }
      }

      return {
        ...account,
        debits: Math.round(debits * 100) / 100,
        credits: Math.round(credits * 100) / 100,
        balance: Math.round((debits - credits) * 100) / 100,
      }
    })
  )

  // Filter out zero-balance accounts and group by type
  const nonZeroAccounts = accountsWithBalances.filter(a => a.debits > 0 || a.credits > 0)
  
  const accountTypes = [
    { type: 'cash', label: 'Cash & Bank' },
    { type: 'accounts_receivable', label: 'Accounts Receivable' },
    { type: 'creator_balance', label: 'Creator Balances (Liability)' },
    { type: 'platform_revenue', label: 'Platform Revenue' },
    { type: 'processing_fees', label: 'Processing Fees (Expense)' },
    { type: 'reserve', label: 'Reserves' },
    { type: 'refund_liability', label: 'Refund Liability' },
  ]

  // Calculate totals
  const totalDebits = nonZeroAccounts.reduce((sum, a) => sum + a.debits, 0)
  const totalCredits = nonZeroAccounts.reduce((sum, a) => sum + a.credits, 0)
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  return (
    <div>
      <div className="mb-8">
        <Link 
          href="/dashboard/reports" 
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Reports
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Trial Balance</h1>
            <p className="text-muted-foreground mt-1">
              {ledger.business_name} • As of {new Date().toLocaleDateString()}
            </p>
          </div>
          <ExportButton
            reportType="trial-balance"
            ledgerId={ledger.id}
          />
        </div>
      </div>

      {/* Balance Status */}
      <div className={`mb-6 p-4 rounded-lg border ${
        isBalanced 
          ? 'bg-green-500/10 border-green-500/20' 
          : 'bg-red-500/10 border-red-500/20'
      }`}>
        <div className="flex items-center gap-3">
          <Scale className={`w-5 h-5 ${isBalanced ? 'text-green-600' : 'text-red-600'}`} />
          <span className={`font-medium ${isBalanced ? 'text-green-600' : 'text-red-600'}`}>
            {isBalanced 
              ? 'Ledger is balanced' 
              : `Ledger is unbalanced by ${formatCurrency(Math.abs(totalDebits - totalCredits))}`
            }
          </span>
        </div>
      </div>

      {/* Trial Balance Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Account
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Debits
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Credits
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {accountTypes.map((accountType) => {
              const typeAccounts = nonZeroAccounts.filter(a => a.account_type === accountType.type)
              if (typeAccounts.length === 0) return null

              return (
                <React.Fragment key={accountType.type}>
                  <tr className="bg-muted/30">
                    <td colSpan={3} className="px-6 py-2 text-sm font-semibold text-foreground">
                      {accountType.label}
                    </td>
                  </tr>
                  {typeAccounts.map((account) => (
                    <tr key={account.id} className="hover:bg-muted/20">
                      <td className="px-6 py-3 pl-10 text-sm text-foreground">
                        {account.name}
                      </td>
                      <td className="px-6 py-3 text-sm text-right font-mono">
                        {account.debits > 0 ? formatCurrency(account.debits) : '—'}
                      </td>
                      <td className="px-6 py-3 text-sm text-right font-mono">
                        {account.credits > 0 ? formatCurrency(account.credits) : '—'}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              )
            })}
            
            {/* Other accounts not in the predefined list */}
            {(() => {
              const knownTypes = accountTypes.map(t => t.type)
              const otherAccounts = nonZeroAccounts.filter(a => !knownTypes.includes(a.account_type))
              if (otherAccounts.length === 0) return null
              
              return (
                <>
                  <tr className="bg-muted/30">
                    <td colSpan={3} className="px-6 py-2 text-sm font-semibold text-foreground">
                      Other Accounts
                    </td>
                  </tr>
                  {otherAccounts.map((account) => (
                    <tr key={account.id} className="hover:bg-muted/20">
                      <td className="px-6 py-3 pl-10 text-sm text-foreground">
                        {account.name} <span className="text-muted-foreground">({account.account_type})</span>
                      </td>
                      <td className="px-6 py-3 text-sm text-right font-mono">
                        {account.debits > 0 ? formatCurrency(account.debits) : '—'}
                      </td>
                      <td className="px-6 py-3 text-sm text-right font-mono">
                        {account.credits > 0 ? formatCurrency(account.credits) : '—'}
                      </td>
                    </tr>
                  ))}
                </>
              )
            })()}
          </tbody>
          <tfoot className="bg-muted/50 border-t-2 border-border">
            <tr>
              <td className="px-6 py-4 text-sm font-bold text-foreground">
                TOTALS
              </td>
              <td className="px-6 py-4 text-sm text-right font-mono font-bold">
                {formatCurrency(totalDebits)}
              </td>
              <td className="px-6 py-4 text-sm text-right font-mono font-bold">
                {formatCurrency(totalCredits)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// Need to import React for Fragment
import React from 'react'
