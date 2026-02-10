'use client'

import { useRouter } from 'next/navigation'
import { BookOpen } from 'lucide-react'
import { setActiveLedgerGroupAction } from '@/lib/livemode-server'

interface LedgerCardProps {
  ledger: {
    id: string
    platform_name: string
    status: string
    created_at: string
    ledger_group_id: string
    settings?: { default_platform_fee_percent?: number }
  }
}

export function LedgerCard({ ledger }: LedgerCardProps) {
  const router = useRouter()

  const handleClick = async () => {
    // Set this ledger's group as the active group before navigating
    await setActiveLedgerGroupAction(ledger.ledger_group_id)
    router.push(`/ledgers/${ledger.id}`)
    router.refresh()
  }

  return (
    <button
      onClick={handleClick}
      className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-colors text-left w-full"
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
    </button>
  )
}
