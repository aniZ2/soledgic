'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'

interface PlanSelectButtonProps {
  planId: string
  priceId: string | null
  isCurrentPlan: boolean
  isOwner: boolean
  contactSales: boolean
  popular?: boolean
}

export function PlanSelectButton({
  planId,
  priceId,
  isCurrentPlan,
  isOwner,
  contactSales,
  popular,
}: PlanSelectButtonProps) {
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    if (isCurrentPlan || !isOwner) return

    if (contactSales) {
      window.location.href = 'mailto:ani@osifoholdings.com?subject=Soledgic Scale Plan Inquiry'
      return
    }

    if (!priceId) return

    setLoading(true)
    try {
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_checkout_session',
          price_id: priceId,
        }),
      })
      const result = await res.json()

      if (result.success && result.data?.url) {
        window.location.href = result.data.url
      }
    } catch (error) {
      console.error('Checkout error:', error)
    }
    setLoading(false)
  }

  const disabled = !isOwner || isCurrentPlan || loading

  const label = isCurrentPlan
    ? 'Current plan'
    : contactSales
    ? 'Contact Sales'
    : 'Select plan'

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={`mt-6 w-full py-3 rounded-md font-medium ${
        isCurrentPlan
          ? 'bg-muted text-muted-foreground cursor-not-allowed'
          : popular
          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
          : 'border border-border hover:bg-accent'
      } disabled:opacity-50`}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin mx-auto" />
      ) : (
        label
      )}
    </button>
  )
}
