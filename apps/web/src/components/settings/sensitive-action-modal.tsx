'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Shield, Smartphone, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { SensitiveActionChallenge } from '@/lib/sensitive-action-shared'

interface SensitiveActionModalProps {
  challenge: SensitiveActionChallenge | null
  onClose: () => void
  onVerified: () => Promise<void> | void
}

function formatSignedInAt(value: string | null): string | null {
  if (!value) return null

  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return null

  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function SensitiveActionModal({
  challenge,
  onClose,
  onVerified,
}: SensitiveActionModalProps) {
  const [code, setCode] = useState('')
  const [factorId, setFactorId] = useState<string | null>(null)
  const [loadingFactor, setLoadingFactor] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isOpen = challenge !== null
  const requiresMfa = Boolean(challenge?.verification.requires_mfa)
  const signedInAt = useMemo(
    () => formatSignedInAt(challenge?.verification.signed_in_at ?? null),
    [challenge?.verification.signed_in_at],
  )

  useEffect(() => {
    if (!isOpen) {
      setCode('')
      setFactorId(null)
      setLoadingFactor(false)
      setVerifying(false)
      setError(null)
      return
    }

    if (!requiresMfa) {
      setFactorId(null)
      setError(null)
      return
    }

    let cancelled = false

    async function loadFactor() {
      setLoadingFactor(true)
      setError(null)

      try {
        const supabase = createClient()
        const { data, error: listError } = await supabase.auth.mfa.listFactors()
        if (listError) throw listError

        const nextFactorId = data?.totp?.find((factor) => factor.status === 'verified')?.id ?? null
        if (!cancelled) {
          setFactorId(nextFactorId)
          if (!nextFactorId) {
            setError('No verified authenticator factor is available for this account.')
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Failed to load your authenticator settings.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoadingFactor(false)
        }
      }
    }

    void loadFactor()

    return () => {
      cancelled = true
    }
  }, [isOpen, requiresMfa])

  async function handleVerify(event: React.FormEvent) {
    event.preventDefault()
    if (!challenge || !factorId) return

    setError(null)
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from your authenticator app.')
      return
    }

    setVerifying(true)

    try {
      const supabase = createClient()
      const response = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code,
      })
      if (response.error) throw response.error

      await onVerified()
    } catch (verifyError) {
      setError(
        verifyError instanceof Error
          ? verifyError.message
          : 'Verification failed. Try again.',
      )
    } finally {
      setVerifying(false)
    }
  }

  async function handleSignInAgain() {
    const supabase = createClient()
    const redirect = `${window.location.pathname}${window.location.search}`

    try {
      await supabase.auth.signOut()
    } catch {
      // Best effort: we still redirect to the login page below.
    }

    window.location.href = `/login?redirect=${encodeURIComponent(redirect)}`
  }

  if (!isOpen || !challenge) return null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-md rounded-lg border border-border bg-card shadow-xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                {requiresMfa ? (
                  <Smartphone className="h-5 w-5 text-primary" />
                ) : (
                  <Shield className="h-5 w-5 text-primary" />
                )}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Verify Sensitive Action</h2>
                <p className="text-sm text-muted-foreground">{challenge.action}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded p-2 text-muted-foreground transition-colors hover:bg-accent"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4 p-6">
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              {challenge.error}
            </div>

            {requiresMfa ? (
              <form onSubmit={handleVerify} className="space-y-4">
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-700 dark:text-emerald-300">
                  MFA is enabled on this account, so this action requires a fresh authenticator code.
                </div>

                {loadingFactor ? (
                  <div className="flex items-center gap-2 rounded-lg border border-border p-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading verified factors...
                  </div>
                ) : null}

                <div>
                  <label
                    htmlFor="sensitive-action-code"
                    className="mb-1.5 block text-sm font-medium text-foreground"
                  >
                    Authenticator code
                  </label>
                  <input
                    id="sensitive-action-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-center font-mono text-2xl tracking-[0.5em] text-foreground placeholder:text-muted-foreground"
                    disabled={loadingFactor || verifying || !factorId}
                    autoFocus
                  />
                </div>

                {error ? (
                  <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600">
                    {error}
                  </div>
                ) : null}

                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={handleSignInAgain}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    Sign in again instead
                  </button>
                  <button
                    type="submit"
                    disabled={loadingFactor || verifying || !factorId}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                  >
                    {verifying ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Verify
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-300">
                  This account does not have MFA enabled, so sensitive actions require a recent sign-in.
                </div>

                {signedInAt ? (
                  <div className="text-sm text-muted-foreground">
                    Last sign-in: <span className="font-medium text-foreground">{signedInAt}</span>
                  </div>
                ) : null}

                <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                  To continue, sign in again. If you enable 2FA, future sensitive actions can be approved in-app with an authenticator code instead of a full re-login.
                </div>

                {error ? (
                  <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600">
                    {error}
                  </div>
                ) : null}

                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSignInAgain}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <AlertTriangle className="h-4 w-4" />
                    Sign in again
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
