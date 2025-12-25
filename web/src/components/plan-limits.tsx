'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, Zap, Clock, CheckCircle } from 'lucide-react'

interface PlanStatus {
  plan: string
  status: string
  limits: {
    ledgers: {
      max: number | 'unlimited'
      current: number
      remaining: number | null
      overage: number
    }
    members: {
      max: number | 'unlimited'
      current: number
    }
  }
  trial: {
    active: boolean
    expired: boolean
    ends_at: string
  }
  canCreateLedger: {
    allowed: boolean
    within_limit?: boolean
    overage?: boolean
    reason?: string
    message?: string
  }
}

export function PlanLimitBanner({ organizationId }: { organizationId: string }) {
  const [status, setStatus] = useState<PlanStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch(`/api/organizations/${organizationId}/plan-status`)
        const data = await res.json()
        setStatus(data)
      } catch (err) {
        console.error('Failed to fetch plan status:', err)
      }
      setLoading(false)
    }
    fetchStatus()
  }, [organizationId])

  if (loading || !status) return null

  // Trial expiring soon (within 3 days)
  const trialEndsAt = status.trial.ends_at ? new Date(status.trial.ends_at) : null
  const daysUntilTrialEnds = trialEndsAt 
    ? Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null
  const trialExpiringSoon = status.trial.active && daysUntilTrialEnds !== null && daysUntilTrialEnds <= 3

  // Trial expired
  if (status.trial.expired) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-destructive">Trial expired</p>
            <p className="text-sm text-destructive/80 mt-1">
              Your trial has ended. Upgrade now to continue using soledgic.
            </p>
          </div>
          <Link
            href="/billing"
            className="px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm font-medium hover:bg-destructive/90"
          >
            Upgrade now
          </Link>
        </div>
      </div>
    )
  }

  // Trial expiring soon
  if (trialExpiringSoon) {
    return (
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <Clock className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-amber-600">
              Trial ends in {daysUntilTrialEnds} day{daysUntilTrialEnds === 1 ? '' : 's'}
            </p>
            <p className="text-sm text-amber-600/80 mt-1">
              Upgrade to keep your data and continue using all features.
            </p>
          </div>
          <Link
            href="/billing"
            className="px-4 py-2 bg-amber-500 text-white rounded-md text-sm font-medium hover:bg-amber-600"
          >
            View plans
          </Link>
        </div>
      </div>
    )
  }

  // Ledger overage
  if (status.limits.ledgers.overage > 0) {
    return (
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <Zap className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-blue-600">
              Using {status.limits.ledgers.overage} extra ledger{status.limits.ledgers.overage === 1 ? '' : 's'}
            </p>
            <p className="text-sm text-blue-600/80 mt-1">
              Extra ledgers are billed at $20/month each. Upgrade to increase your limit.
            </p>
          </div>
          <Link
            href="/billing"
            className="px-4 py-2 border border-blue-500 text-blue-600 rounded-md text-sm font-medium hover:bg-blue-500/10"
          >
            Upgrade plan
          </Link>
        </div>
      </div>
    )
  }

  // Near limit (1 ledger remaining)
  if (status.limits.ledgers.remaining === 1) {
    return (
      <div className="bg-muted border border-border rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <CheckCircle className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-foreground">
              1 ledger remaining on your plan
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              You can create one more ledger. Need more? Upgrade anytime.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return null
}

interface CreateLedgerGateProps {
  organizationId: string
  children: React.ReactNode
  onBlocked?: (reason: string) => void
  renderButton?: (props: { isOverage: boolean; overagePrice: number }) => React.ReactNode
}

export function CreateLedgerGate({ 
  organizationId, 
  children,
  onBlocked,
  renderButton,
}: CreateLedgerGateProps) {
  const [canCreate, setCanCreate] = useState<boolean | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isOverage, setIsOverage] = useState(false)
  const [overagePrice, setOveragePrice] = useState(2000) // $20 default

  useEffect(() => {
    async function checkLimit() {
      try {
        const res = await fetch(`/api/organizations/${organizationId}/plan-status`)
        const data = await res.json()
        
        setCanCreate(data.canCreateLedger?.allowed ?? false)
        
        if (!data.canCreateLedger?.allowed) {
          setMessage(data.canCreateLedger?.reason || 'Cannot create ledger')
          onBlocked?.(data.canCreateLedger?.reason || 'Limit reached')
        } else if (data.canCreateLedger?.overage) {
          setIsOverage(true)
          setOveragePrice(data.canCreateLedger?.overage_price || 2000)
          setMessage(data.canCreateLedger?.message || 'Additional charges apply')
        }
      } catch (err) {
        setCanCreate(false)
        setMessage('Failed to check plan limits')
      }
    }
    checkLimit()
  }, [organizationId, onBlocked])

  if (canCreate === null) {
    return <div className="animate-pulse bg-muted h-10 rounded-md" />
  }

  if (!canCreate) {
    return (
      <div className="text-center p-6 bg-muted/50 rounded-lg border border-border">
        <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
        <p className="font-medium text-foreground">{message}</p>
        <Link
          href="/billing"
          className="mt-4 inline-block px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
        >
          Upgrade plan
        </Link>
      </div>
    )
  }

  // If renderButton provided, use it for custom button text
  if (renderButton) {
    return (
      <>
        {isOverage && (
          <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md">
            <p className="text-sm text-amber-600">
              You've used all ledgers in your plan. Additional ledgers are ${(overagePrice / 100).toFixed(0)}/month each.
            </p>
          </div>
        )}
        {renderButton({ isOverage, overagePrice })}
      </>
    )
  }

  return (
    <>
      {message && (
        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md">
          <p className="text-sm text-amber-600">{message}</p>
        </div>
      )}
      {children}
    </>
  )
}

// Helper component for the create ledger button
export function CreateLedgerButton({ 
  organizationId,
  className = '',
}: { 
  organizationId: string
  className?: string
}) {
  return (
    <CreateLedgerGate 
      organizationId={organizationId}
      renderButton={({ isOverage, overagePrice }) => (
        <Link
          href="/ledgers/new"
          className={`inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 ${className}`}
        >
          {isOverage ? (
            <>
              <Zap className="h-4 w-4" />
              Add Ledger (+${(overagePrice / 100).toFixed(0)}/mo)
            </>
          ) : (
            'Create Ledger'
          )}
        </Link>
      )}
    >
      <Link
        href="/ledgers/new"
        className={`inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 ${className}`}
      >
        Create Ledger
      </Link>
    </CreateLedgerGate>
  )
}
