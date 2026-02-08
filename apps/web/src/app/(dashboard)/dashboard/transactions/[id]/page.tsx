import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { 
  ArrowLeft, CheckCircle, AlertTriangle, ExternalLink,
  FileText, Database, CreditCard, Building, Hash, Clock
} from 'lucide-react'

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  
  const { data: { session } } = await supabase.auth.getSession(); const user = session?.user
  // Auth handled by layout

  // Get transaction with entries
  const { data: transaction } = await supabase
    .from('transactions')
    .select(`
      *,
      entries (
        id,
        account_id,
        entry_type,
        amount,
        accounts (
          id,
          name,
          account_type,
          entity_id
        )
      )
    `)
    .eq('id', id)
    .single()

  if (!transaction) notFound()

  // Get external source data based on reference_type
  let sourceData: any = null
  let sourceName = 'Unknown'
  let sourceVerified = false

  if (transaction.reference_type === 'stripe_charge' || 
      transaction.reference_type === 'stripe_payment_intent') {
    // Get from stripe_events
    const stripeId = transaction.metadata?.stripe_charge_id || 
                     transaction.metadata?.stripe_payment_intent_id
    
    if (stripeId) {
      const { data: stripeEvent } = await supabase
        .from('stripe_events')
        .select('*')
        .eq('ledger_id', transaction.ledger_id)
        .or(`raw_data->data->object->id.eq.${stripeId},raw_data->data->object->payment_intent.eq.${stripeId}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (stripeEvent) {
        sourceData = stripeEvent.raw_data
        sourceName = 'Stripe Webhook'
        sourceVerified = stripeEvent.status === 'processed'
      }
    }

    // Also check stripe_transactions for reconciliation status
    const { data: stripeTx } = await supabase
      .from('stripe_transactions')
      .select('*')
      .eq('transaction_id', transaction.id)
      .single()

    if (stripeTx) {
      transaction._stripeTx = stripeTx
    }
  }

  if (transaction.reference_type === 'bank_import' || 
      transaction.metadata?.source === 'bank_import') {
    // Get from plaid_transactions
    const { data: bankTx } = await supabase
      .from('plaid_transactions')
      .select('*')
      .eq('transaction_id', transaction.id)
      .single()

    if (bankTx) {
      sourceData = bankTx.raw_data || {
        date: bankTx.date,
        amount: bankTx.amount,
        description: bankTx.description,
        reference: bankTx.reference,
        dedup_hash: bankTx.dedup_hash,
      }
      sourceName = bankTx.source === 'plaid' ? 'Plaid Bank Feed' : 'CSV Import'
      sourceVerified = bankTx.match_status === 'matched' || bankTx.match_status === 'auto_matched'
      transaction._bankTx = bankTx
    }
  }

  // Get audit log entries for this transaction
  const { data: auditLogs } = await supabase
    .from('audit_log')
    .select('*')
    .or(`entity_id.eq.${transaction.id},details->transaction_id.eq.${transaction.id}`)
    .order('created_at', { ascending: true })
    .limit(20)

  // Get linked transactions (reversals, etc)
  let linkedTransactions: any[] = []
  if (transaction.reverses) {
    const { data } = await supabase
      .from('transactions')
      .select('id, transaction_type, amount, status, created_at')
      .eq('id', transaction.reverses)
    if (data) linkedTransactions.push(...data.map(t => ({ ...t, relation: 'reverses' })))
  }
  if (transaction.reversed_by) {
    const { data } = await supabase
      .from('transactions')
      .select('id, transaction_type, amount, status, created_at')
      .eq('id', transaction.reversed_by)
    if (data) linkedTransactions.push(...data.map(t => ({ ...t, relation: 'reversed_by' })))
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  // Calculate entry totals
  const totalDebits = transaction.entries?.reduce(
    (sum: number, e: any) => sum + (e.entry_type === 'debit' ? e.amount : 0), 0
  ) || 0
  const totalCredits = transaction.entries?.reduce(
    (sum: number, e: any) => sum + (e.entry_type === 'credit' ? e.amount : 0), 0
  ) || 0
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <Link 
          href="/dashboard/transactions"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Transactions
        </Link>
        
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground capitalize">
              {transaction.transaction_type}
            </h1>
            <p className="text-muted-foreground mt-1">
              {transaction.description || 'No description'}
            </p>
          </div>
          <div className="text-right">
            <p className={`text-3xl font-bold ${
              transaction.transaction_type === 'sale' ? 'text-green-600' : 
              transaction.transaction_type === 'refund' ? 'text-red-600' : 
              'text-foreground'
            }`}>
              {formatCurrency(transaction.amount)}
            </p>
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium mt-2 ${
              transaction.status === 'completed' ? 'bg-green-500/10 text-green-600' :
              transaction.status === 'voided' ? 'bg-red-500/10 text-red-600' :
              'bg-yellow-500/10 text-yellow-600'
            }`}>
              {transaction.status}
            </span>
          </div>
        </div>
      </div>

      {/* Triple-Entry Verification Banner */}
      <div className={`rounded-lg p-4 mb-6 flex items-center gap-4 ${
        sourceVerified && isBalanced 
          ? 'bg-green-500/10 border border-green-500/20' 
          : 'bg-yellow-500/10 border border-yellow-500/20'
      }`}>
        {sourceVerified && isBalanced ? (
          <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0" />
        ) : (
          <AlertTriangle className="w-6 h-6 text-yellow-500 flex-shrink-0" />
        )}
        <div>
          <p className="font-medium text-foreground">
            {sourceVerified && isBalanced 
              ? 'Triple-Entry Verified' 
              : 'Verification Incomplete'}
          </p>
          <p className="text-sm text-muted-foreground">
            {sourceVerified 
              ? `Ledger entries match external record from ${sourceName}` 
              : 'External source data not yet verified'}
            {isBalanced 
              ? ' • Debits equal credits' 
              : ' • ⚠️ Transaction is unbalanced'}
          </p>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Transaction Details */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-muted/30">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Transaction Details
            </h2>
          </div>
          <div className="p-6 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase mb-1">Transaction ID</p>
              <code className="text-sm bg-muted px-2 py-1 rounded">{transaction.id}</code>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase mb-1">Reference</p>
              <code className="text-sm bg-muted px-2 py-1 rounded">{transaction.reference_id}</code>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase mb-1">Type</p>
              <p className="text-foreground capitalize">{transaction.reference_type || 'manual'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase mb-1">Created</p>
              <p className="text-foreground">{formatDate(transaction.created_at)}</p>
            </div>
            {transaction.metadata?.creator_id && (
              <div>
                <p className="text-xs text-muted-foreground uppercase mb-1">Creator ID</p>
                <code className="text-sm bg-muted px-2 py-1 rounded">{transaction.metadata.creator_id}</code>
              </div>
            )}
            {transaction.metadata?.breakdown && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground uppercase mb-1">Amount Breakdown</p>
                <div className="flex gap-4 text-sm">
                  <span>Gross: {formatCurrency(transaction.metadata.breakdown.gross)}</span>
                  <span>Fees: {formatCurrency(transaction.metadata.breakdown.stripe_fee || 0)}</span>
                  <span>Net: {formatCurrency(transaction.metadata.breakdown.net)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Ledger Entries (Second Entry) */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-muted/30">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <Database className="w-4 h-4" />
              Ledger Entries
              <span className="text-xs font-normal text-muted-foreground ml-2">
                (Internal Record — Entry #2)
              </span>
            </h2>
          </div>
          <table className="w-full">
            <thead className="bg-muted/30">
              <tr>
                <th className="px-6 py-2 text-left text-xs font-medium text-muted-foreground">Account</th>
                <th className="px-6 py-2 text-right text-xs font-medium text-muted-foreground">Debit</th>
                <th className="px-6 py-2 text-right text-xs font-medium text-muted-foreground">Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transaction.entries?.map((entry: any) => (
                <tr key={entry.id}>
                  <td className="px-6 py-3">
                    <p className="font-medium text-foreground">{entry.accounts?.name}</p>
                    <p className="text-xs text-muted-foreground">{entry.accounts?.account_type}</p>
                  </td>
                  <td className="px-6 py-3 text-right font-mono">
                    {entry.entry_type === 'debit' ? formatCurrency(entry.amount) : '—'}
                  </td>
                  <td className="px-6 py-3 text-right font-mono">
                    {entry.entry_type === 'credit' ? formatCurrency(entry.amount) : '—'}
                  </td>
                </tr>
              ))}
              <tr className="bg-muted/30 font-semibold">
                <td className="px-6 py-3">Total</td>
                <td className="px-6 py-3 text-right font-mono">{formatCurrency(totalDebits)}</td>
                <td className="px-6 py-3 text-right font-mono">{formatCurrency(totalCredits)}</td>
              </tr>
            </tbody>
          </table>
          {!isBalanced && (
            <div className="px-6 py-3 bg-red-500/10 border-t border-red-500/20">
              <p className="text-sm text-red-600">
                ⚠️ Unbalanced: Difference of {formatCurrency(Math.abs(totalDebits - totalCredits))}
              </p>
            </div>
          )}
        </div>

        {/* External Source Proof (Third Entry) */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-muted/30">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              {sourceName.includes('Stripe') ? (
                <CreditCard className="w-4 h-4" />
              ) : (
                <Building className="w-4 h-4" />
              )}
              External Source: {sourceName}
              <span className="text-xs font-normal text-muted-foreground ml-2">
                (Immutable Record — Entry #3)
              </span>
              {sourceVerified && (
                <CheckCircle className="w-4 h-4 text-green-500 ml-auto" />
              )}
            </h2>
          </div>
          <div className="p-6">
            {sourceData ? (
              <>
                {/* Key fields summary */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {sourceData.id && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase mb-1">External ID</p>
                      <code className="text-sm bg-muted px-2 py-1 rounded">{sourceData.id}</code>
                    </div>
                  )}
                  {sourceData.data?.object?.id && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase mb-1">Stripe Object ID</p>
                      <code className="text-sm bg-muted px-2 py-1 rounded">{sourceData.data.object.id}</code>
                    </div>
                  )}
                  {sourceData.data?.object?.amount && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase mb-1">Stripe Amount</p>
                      <p className="text-foreground">{formatCurrency(sourceData.data.object.amount / 100)}</p>
                    </div>
                  )}
                  {sourceData.dedup_hash && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground uppercase mb-1">Deduplication Hash (SHA-256)</p>
                      <code className="text-xs bg-muted px-2 py-1 rounded break-all">{sourceData.dedup_hash}</code>
                    </div>
                  )}
                </div>

                {/* Full JSON */}
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                    View Raw JSON
                  </summary>
                  <pre className="mt-2 p-4 bg-muted rounded-lg overflow-x-auto text-xs">
                    {JSON.stringify(sourceData, null, 2)}
                  </pre>
                </details>
              </>
            ) : (
              <p className="text-muted-foreground">
                No external source data linked to this transaction.
                {transaction.reference_type === 'api' && (
                  <span className="block mt-1 text-sm">
                    This transaction was created via API without external verification.
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Reconciliation Status */}
        {(transaction._stripeTx || transaction._bankTx) && (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-muted/30">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Hash className="w-4 h-4" />
                Reconciliation Status
              </h2>
            </div>
            <div className="p-6">
              {transaction._stripeTx && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">Stripe Transaction</p>
                    <p className="text-sm text-muted-foreground">
                      {transaction._stripeTx.stripe_type} • {transaction._stripeTx.stripe_id}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    transaction._stripeTx.match_status === 'auto_matched' 
                      ? 'bg-green-500/10 text-green-600' 
                      : transaction._stripeTx.match_status === 'matched'
                      ? 'bg-blue-500/10 text-blue-600'
                      : 'bg-yellow-500/10 text-yellow-600'
                  }`}>
                    {transaction._stripeTx.match_status}
                  </span>
                </div>
              )}
              {transaction._bankTx && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">Bank Transaction</p>
                    <p className="text-sm text-muted-foreground">
                      {transaction._bankTx.source} • {transaction._bankTx.reference || transaction._bankTx.description}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    transaction._bankTx.match_status === 'auto_matched' 
                      ? 'bg-green-500/10 text-green-600' 
                      : transaction._bankTx.match_status === 'matched'
                      ? 'bg-blue-500/10 text-blue-600'
                      : 'bg-yellow-500/10 text-yellow-600'
                  }`}>
                    {transaction._bankTx.match_status}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Linked Transactions */}
        {linkedTransactions.length > 0 && (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-muted/30">
              <h2 className="font-semibold text-foreground">Linked Transactions</h2>
            </div>
            <div className="divide-y divide-border">
              {linkedTransactions.map((linked) => (
                <Link
                  key={linked.id}
                  href={`/dashboard/transactions/${linked.id}`}
                  className="px-6 py-4 flex items-center justify-between hover:bg-muted/30"
                >
                  <div>
                    <p className="font-medium text-foreground capitalize">
                      {linked.transaction_type}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {linked.relation === 'reverses' ? 'This transaction reverses' : 'Reversed by'} this entry
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-mono">{formatCurrency(linked.amount)}</span>
                    <ExternalLink className="w-4 h-4 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Audit Trail */}
        {auditLogs && auditLogs.length > 0 && (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-muted/30">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Audit Trail
              </h2>
            </div>
            <div className="divide-y divide-border">
              {auditLogs.map((log: any) => (
                <div key={log.id} className="px-6 py-3 flex items-start gap-4">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground mt-2 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">
                      <span className="font-medium">{log.action}</span>
                      {log.actor_type && (
                        <span className="text-muted-foreground"> by {log.actor_type}</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(log.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
