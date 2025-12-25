'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, Upload, CheckCircle2, XCircle, Link2, Unlink } from 'lucide-react'

interface BankAccount {
  id: string
  bank_name: string
  account_name: string
  account_last_four: string
}

interface BankLine {
  id: string
  date: string
  description: string
  amount: number
  type: 'debit' | 'credit'
  status: 'unmatched' | 'matched' | 'ignored'
  matched_transaction_id?: string
}

interface Transaction {
  id: string
  created_at: string
  description: string
  amount: number
  transaction_type: string
  status: string
}

export default function ReconciliationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: ledgerId } = use(params)
  
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState<string>('')
  const [bankLines, setBankLines] = useState<BankLine[]>([])
  const [unmatchedTransactions, setUnmatchedTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBankLine, setSelectedBankLine] = useState<string | null>(null)
  const [selectedTransaction, setSelectedTransaction] = useState<string | null>(null)

  useEffect(() => {
    async function loadBankAccounts() {
      const res = await fetch(`/api/ledgers/${ledgerId}/bank-accounts`)
      const data = await res.json()
      setBankAccounts(data.bank_accounts || [])
      if (data.bank_accounts?.length > 0) {
        setSelectedAccount(data.bank_accounts[0].id)
      }
      setLoading(false)
    }
    loadBankAccounts()
  }, [ledgerId])

  useEffect(() => {
    if (!selectedAccount) return

    async function loadReconciliationData() {
      const [linesRes, txRes] = await Promise.all([
        fetch(`/api/ledgers/${ledgerId}/bank-lines?account_id=${selectedAccount}&status=unmatched`),
        fetch(`/api/ledgers/${ledgerId}/transactions?unreconciled=true`),
      ])
      
      const linesData = await linesRes.json()
      const txData = await txRes.json()
      
      setBankLines(linesData.lines || [])
      setUnmatchedTransactions(txData.transactions || [])
    }
    loadReconciliationData()
  }, [ledgerId, selectedAccount])

  const handleMatch = async () => {
    if (!selectedBankLine || !selectedTransaction) return

    try {
      await fetch(`/api/ledgers/${ledgerId}/reconcile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'match',
          bank_line_id: selectedBankLine,
          transaction_id: selectedTransaction,
        }),
      })

      // Remove matched items from lists
      setBankLines(lines => lines.filter(l => l.id !== selectedBankLine))
      setUnmatchedTransactions(txs => txs.filter(t => t.id !== selectedTransaction))
      setSelectedBankLine(null)
      setSelectedTransaction(null)
    } catch (err) {
      console.error('Match failed:', err)
    }
  }

  const handleAutoMatch = async () => {
    try {
      const res = await fetch(`/api/ledgers/${ledgerId}/reconcile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'auto_match',
          bank_account_id: selectedAccount,
        }),
      })
      
      const data = await res.json()
      
      // Reload data
      window.location.reload()
    } catch (err) {
      console.error('Auto-match failed:', err)
    }
  }

  return (
    <div>
      <Link
        href={`/ledgers/${ledgerId}`}
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to ledger
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Bank Reconciliation</h1>
          <p className="mt-1 text-muted-foreground">
            Match bank transactions with your ledger entries
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href={`/ledgers/${ledgerId}/reconciliation/import`}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-md hover:bg-accent"
          >
            <Upload className="h-4 w-4" />
            Import statement
          </Link>
          <Link
            href={`/ledgers/${ledgerId}/reconciliation/accounts`}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-md hover:bg-accent"
          >
            <Plus className="h-4 w-4" />
            Add bank account
          </Link>
        </div>
      </div>

      {/* Bank Account Selector */}
      {bankAccounts.length > 0 && (
        <div className="mt-6">
          <label className="block text-sm font-medium text-foreground mb-2">
            Bank Account
          </label>
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="px-4 py-2 border border-border rounded-md bg-background text-foreground"
          >
            {bankAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.bank_name} - {account.account_name} (****{account.account_last_four})
              </option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div className="mt-8 text-center text-muted-foreground">Loading...</div>
      ) : bankAccounts.length === 0 ? (
        <div className="mt-8 bg-card border border-border rounded-lg p-12 text-center">
          <Upload className="h-12 w-12 text-muted-foreground mx-auto" />
          <h3 className="mt-4 text-lg font-medium text-foreground">No bank accounts</h3>
          <p className="mt-2 text-muted-foreground max-w-sm mx-auto">
            Add a bank account and import statements to start reconciling.
          </p>
          <Link
            href={`/ledgers/${ledgerId}/reconciliation/accounts`}
            className="mt-6 inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Add bank account
          </Link>
        </div>
      ) : (
        <>
          {/* Action Bar */}
          <div className="mt-6 flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                {bankLines.length} unmatched bank lines • {unmatchedTransactions.length} unmatched transactions
              </span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleAutoMatch}
                className="px-4 py-2 border border-border rounded-md hover:bg-accent text-sm"
              >
                Auto-match
              </button>
              <button
                onClick={handleMatch}
                disabled={!selectedBankLine || !selectedTransaction}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 disabled:opacity-50 text-sm"
              >
                <Link2 className="h-4 w-4" />
                Match selected
              </button>
            </div>
          </div>

          {/* Two Column Layout */}
          <div className="mt-6 grid grid-cols-2 gap-6">
            {/* Bank Lines */}
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-4">Bank Statement Lines</h2>
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                {bankLines.length > 0 ? (
                  <div className="divide-y divide-border">
                    {bankLines.map((line) => (
                      <div
                        key={line.id}
                        onClick={() => setSelectedBankLine(line.id === selectedBankLine ? null : line.id)}
                        className={`p-4 cursor-pointer hover:bg-muted/50 ${
                          selectedBankLine === line.id ? 'bg-primary/10 border-l-4 border-l-primary' : ''
                        }`}
                      >
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">
                            {new Date(line.date).toLocaleDateString()}
                          </span>
                          <span className={`font-medium ${line.type === 'credit' ? 'text-green-500' : 'text-red-500'}`}>
                            {line.type === 'credit' ? '+' : '-'}${(line.amount / 100).toFixed(2)}
                          </span>
                        </div>
                        <p className="mt-1 text-foreground text-sm truncate">{line.description}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    All bank lines matched
                  </div>
                )}
              </div>
            </div>

            {/* Ledger Transactions */}
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-4">Ledger Transactions</h2>
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                {unmatchedTransactions.length > 0 ? (
                  <div className="divide-y divide-border">
                    {unmatchedTransactions.map((tx) => (
                      <div
                        key={tx.id}
                        onClick={() => setSelectedTransaction(tx.id === selectedTransaction ? null : tx.id)}
                        className={`p-4 cursor-pointer hover:bg-muted/50 ${
                          selectedTransaction === tx.id ? 'bg-primary/10 border-l-4 border-l-primary' : ''
                        }`}
                      >
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">
                            {new Date(tx.created_at).toLocaleDateString()}
                          </span>
                          <span className="font-medium text-foreground">
                            ${(tx.amount / 100).toFixed(2)}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            tx.transaction_type === 'sale' ? 'bg-green-500/10 text-green-500' :
                            tx.transaction_type === 'expense' ? 'bg-red-500/10 text-red-500' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {tx.transaction_type}
                          </span>
                          <span className="text-sm text-foreground truncate">{tx.description}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    All transactions matched
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Match Preview */}
          {selectedBankLine && selectedTransaction && (
            <div className="mt-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Link2 className="h-5 w-5 text-green-500" />
                  <span className="font-medium text-foreground">Ready to match</span>
                </div>
                <button
                  onClick={() => { setSelectedBankLine(null); setSelectedTransaction(null); }}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Clear selection
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
