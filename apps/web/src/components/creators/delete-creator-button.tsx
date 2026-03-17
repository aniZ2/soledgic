'use client'

import { useState } from 'react'
import { Trash2, Loader2 } from 'lucide-react'
import { callLedgerFunction } from '@/lib/ledger-functions-client'
import { useToast } from '@/components/notifications/toast-provider'
import { ConfirmDialog } from '@/components/settings/confirm-dialog'

interface DeleteCreatorButtonProps {
  ledgerId: string
  creatorId: string
  creatorName: string
  onDeleted?: () => void
}

export function DeleteCreatorButton({ ledgerId, creatorId, creatorName, onDeleted }: DeleteCreatorButtonProps) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const toast = useToast()

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await callLedgerFunction(`participants/${creatorId}`, {
        ledgerId,
        method: 'DELETE',
      })
      const data = await res.json()

      if (data.success) {
        toast.success('Deleted', `${creatorName} has been removed`)
        onDeleted?.()
        // Reload the page to reflect the deletion
        window.location.reload()
      } else {
        toast.error('Delete failed', data.error || 'Could not delete participant')
      }
    } catch {
      toast.error('Delete failed', 'An unexpected error occurred')
    }
    setDeleting(false)
    setConfirming(false)
  }

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        disabled={deleting}
        className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-500/10 transition-colors"
        title="Delete test participant"
      >
        {deleting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Trash2 className="w-4 h-4" />
        )}
      </button>

      <ConfirmDialog
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={handleDelete}
        title="Delete Test Participant"
        message={`Delete "${creatorName}" and all their test data? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
      />
    </>
  )
}
