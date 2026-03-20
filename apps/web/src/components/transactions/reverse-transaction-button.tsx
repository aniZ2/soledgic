'use client'

import { useState, useEffect, useCallback } from 'react'
import { RotateCcw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useLivemode, useActiveLedgerGroupId } from '@/components/livemode-provider'
import { pickActiveLedger } from '@/lib/active-ledger'
import { ReverseTransactionModal } from './reverse-transaction-modal'

interface ReverseTransactionButtonProps {
  transactionId: string
  transactionAmount: number
  transactionStatus: string
}

export function ReverseTransactionButton({
  transactionId,
  transactionAmount,
  transactionStatus,
}: ReverseTransactionButtonProps) {
  const livemode = useLivemode()
  const activeLedgerGroupId = useActiveLedgerGroupId()
  const [ledgerId, setLedgerId] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  const loadLedger = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!membership) return

    const { data: ledgers } = await supabase
      .from('ledgers')
      .select('id, ledger_group_id')
      .eq('organization_id', membership.organization_id)
      .eq('status', 'active')
      .eq('livemode', livemode)

    const ledger = pickActiveLedger(ledgers, activeLedgerGroupId)
    if (ledger) setLedgerId(ledger.id)
  }, [livemode, activeLedgerGroupId])

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadLedger()
    }, 0)

    return () => clearTimeout(timeoutId)
  }, [loadLedger])

  // Don't show button if transaction is already reversed/voided
  const isReversible = transactionStatus !== 'reversed' && transactionStatus !== 'voided'

  if (!isReversible || !ledgerId) return null

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm font-medium"
      >
        <RotateCcw className="w-4 h-4" />
        Reverse Transaction
      </button>

      <ReverseTransactionModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        ledgerId={ledgerId}
        transactionId={transactionId}
        transactionAmount={transactionAmount}
        onSuccess={() => {
          // Refresh the page to show updated status
          window.location.reload()
        }}
      />
    </>
  )
}
