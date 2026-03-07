'use client'

import { useState } from 'react'
import { X, Loader2, Smartphone, Check, Copy } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface MfaEnrollModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  qrCode: string
  secret: string
  factorId: string
}

export function MfaEnrollModal({
  isOpen,
  onClose,
  onSuccess,
  qrCode,
  secret,
  factorId,
}: MfaEnrollModalProps) {
  const [step, setStep] = useState<'qr' | 'verify' | 'success'>('qr')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      setError('Please enter a valid 6-digit code')
      return
    }

    setVerifying(true)

    try {
      const supabase = createClient()
      const challenge = await supabase.auth.mfa.challenge({ factorId })
      if (challenge.error) throw challenge.error

      const verify = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code,
      })
      if (verify.error) throw verify.error

      setStep('success')
    } catch (err: unknown) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Verification failed. Please try again.'
      )
    } finally {
      setVerifying(false)
    }
  }

  const handleCopySecret = async () => {
    await navigator.clipboard.writeText(secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClose = async () => {
    if (verifying) return
    if (step === 'success') {
      onSuccess()
    } else {
      // Explicitly unenroll the unverified factor to avoid orphaned factors
      try {
        const supabase = createClient()
        await supabase.auth.mfa.unenroll({ factorId })
      } catch {
        // Best-effort cleanup — ignore errors
      }
    }
    setStep('qr')
    setCode('')
    setError(null)
    setCopied(false)
    onClose()
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  {step === 'success' ? '2FA Enabled' : 'Enable Two-Factor Authentication'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {step === 'qr' && 'Scan the QR code with your authenticator app'}
                  {step === 'verify' && 'Enter the code from your authenticator app'}
                  {step === 'success' && 'Your account is now protected'}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-accent rounded transition-colors"
              disabled={verifying}
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {step === 'qr' && (
              <div className="space-y-4">
                {/* QR Code */}
                <div className="flex justify-center">
                  <div className="bg-white p-4 rounded-lg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrCode.startsWith('data:') ? qrCode : `data:image/svg+xml;utf8,${qrCode}`}
                      alt="Scan this QR code with your authenticator app"
                      className="w-48 h-48"
                    />
                  </div>
                </div>

                {/* Manual entry secret */}
                <div>
                  <p className="text-sm text-muted-foreground mb-2">
                    Or enter this code manually:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-muted px-3 py-2 rounded-md text-sm font-mono text-foreground break-all select-all">
                      {secret}
                    </code>
                    <button
                      onClick={handleCopySecret}
                      className="p-2 hover:bg-accent rounded transition-colors flex-shrink-0"
                      title="Copy secret"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Next button */}
                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setStep('verify')}
                    className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {step === 'verify' && (
              <form onSubmit={handleVerify} className="space-y-4">
                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-600 text-sm rounded-md p-3">
                    {error}
                  </div>
                )}

                <div>
                  <label
                    htmlFor="totp-code"
                    className="block text-sm font-medium text-foreground mb-1.5"
                  >
                    Verification code
                  </label>
                  <input
                    id="totp-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="w-full border border-border rounded-md py-2 px-3 bg-background text-foreground text-center text-2xl tracking-[0.5em] font-mono placeholder:text-muted-foreground placeholder:tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    disabled={verifying}
                    autoFocus
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('qr')
                      setError(null)
                      setCode('')
                    }}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    disabled={verifying}
                  >
                    Back to QR code
                  </button>
                  <button
                    type="submit"
                    disabled={verifying || code.length !== 6}
                    className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {verifying ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      'Verify'
                    )}
                  </button>
                </div>
              </form>
            )}

            {step === 'success' && (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
                  <Check className="w-8 h-8 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    Two-factor authentication is now enabled
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    You&apos;ll be asked for a code from your authenticator app when signing in.
                  </p>
                </div>
                <button
                  onClick={handleClose}
                  className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
