'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setLivemodeAction } from '@/lib/livemode-server'

export function LiveModeToggle({
  initialLivemode,
  activeLedgerGroupId,
}: {
  initialLivemode: boolean
  activeLedgerGroupId: string | null
}) {
  const [livemode, setLivemode] = useState(initialLivemode)
  const [switching, setSwitching] = useState(false)
  const router = useRouter()

  const toggle = async () => {
    if (switching) return
    setSwitching(true)

    const next = !livemode
    try {
      const result = await setLivemodeAction(next, activeLedgerGroupId)
      if (result.success) {
        setLivemode(next)
        router.refresh()
      }
    } finally {
      setSwitching(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={switching}
      className="w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent transition-colors disabled:opacity-60"
    >
      <div className="flex items-center gap-2">
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            livemode ? 'bg-green-500' : 'bg-amber-500'
          }`}
        />
        <span className="text-sm font-medium text-foreground">
          {livemode ? 'Live' : 'Test'}
        </span>
      </div>

      {/* Toggle track */}
      <div
        className={`relative w-9 h-5 rounded-full transition-colors ${
          livemode ? 'bg-green-500' : 'bg-amber-500'
        }`}
      >
        <div
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            livemode ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </div>
    </button>
  )
}
