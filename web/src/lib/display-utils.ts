// Human-friendly labels for accounting concepts
// Hides "debit/credit" complexity from non-accountants

export const TRANSACTION_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  sale: { label: 'Money In', color: 'text-green-500', icon: '↓' },
  expense: { label: 'Money Out', color: 'text-red-500', icon: '↑' },
  payout: { label: 'Creator Payment', color: 'text-blue-500', icon: '→' },
  refund: { label: 'Refund', color: 'text-orange-500', icon: '↩' },
  adjustment: { label: 'Adjustment', color: 'text-purple-500', icon: '⟳' },
  reversal: { label: 'Correction', color: 'text-gray-500', icon: '↺' },
  transfer: { label: 'Transfer', color: 'text-cyan-500', icon: '⇄' },
  fee: { label: 'Fee', color: 'text-red-400', icon: '−' },
}

export const ACCOUNT_LABELS: Record<string, string> = {
  platform_revenue: 'Your Revenue',
  creator_balance: 'Creator Balance',
  creator_pool: 'Creator Payable',
  tax_reserve: 'Tax Reserve',
  processing_fees: 'Processing Fees',
  refund_reserve: 'Refund Reserve',
  cash: 'Cash',
  expense: 'Expenses',
}

export const REPORT_LABELS = {
  trial_balance: {
    title: 'Account Balances',
    description: 'Current balance of all accounts',
    // Hide: "Trial Balance", "Debits", "Credits"
    debit: 'Increases',
    credit: 'Decreases',
    balanced: 'Books are balanced ✓',
    unbalanced: 'Something doesn\'t add up',
  },
  profit_loss: {
    title: 'Profit & Loss',
    description: 'Money earned vs money spent',
    revenue: 'Money Earned',
    expenses: 'Money Spent',
    net: 'What You Kept',
  },
}

// Format transaction for display
export function formatTransaction(tx: {
  transaction_type: string
  amount: number
  description?: string
}) {
  const config = TRANSACTION_LABELS[tx.transaction_type] || {
    label: tx.transaction_type,
    color: 'text-gray-500',
    icon: '•',
  }

  return {
    ...config,
    amount: formatMoney(tx.amount),
    description: tx.description || config.label,
  }
}

// Format money (cents to dollars)
export function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

// Format date for display
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

// Friendly balance display (positive = good, negative = owed)
export function formatBalance(cents: number, accountType: string): {
  display: string
  sentiment: 'positive' | 'negative' | 'neutral'
} {
  const amount = formatMoney(Math.abs(cents))
  
  // Cash and revenue: positive is good
  if (['cash', 'platform_revenue'].includes(accountType)) {
    return {
      display: cents >= 0 ? amount : `-${amount}`,
      sentiment: cents >= 0 ? 'positive' : 'negative',
    }
  }
  
  // Creator balances: these are what you owe (liability)
  if (['creator_balance', 'creator_pool'].includes(accountType)) {
    return {
      display: amount,
      sentiment: 'neutral', // Not bad, just what's owed
    }
  }
  
  // Expenses: always shown as spent
  if (accountType === 'expense') {
    return {
      display: amount,
      sentiment: 'negative',
    }
  }
  
  return { display: amount, sentiment: 'neutral' }
}
