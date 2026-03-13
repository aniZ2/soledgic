'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Shield, Smartphone, Key, AlertTriangle,
  Check, X, Loader2, LogOut, Globe,
} from 'lucide-react'
import { useToast } from '@/components/notifications/toast-provider'
import { MfaEnrollModal } from '@/components/settings/mfa-enroll-modal'
import { ConfirmDialog } from '@/components/settings/confirm-dialog'

interface Session {
  id: string
  user_agent: string
  ip: string
  created_at: string
  is_current: boolean
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export default function SecuritySettingsPage() {
  const [loading, setLoading] = useState(true)
  const [mfaEnabled, setMfaEnabled] = useState(false)
  const [mfaEnrolling, setMfaEnrolling] = useState(false)
  const [sessions, setSessions] = useState<Session[]>([])
  const [passwordUpdating, setPasswordUpdating] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [lastSignIn, setLastSignIn] = useState<string | null>(null)
  const [enrollData, setEnrollData] = useState<{
    qrCode: string
    secret: string
    factorId: string
  } | null>(null)
  const [confirmAction, setConfirmAction] = useState<'disable-mfa' | 'sign-out-all' | null>(null)
  const toast = useToast()

  useEffect(() => {
    loadSecurityData()
  }, [])

  const loadSecurityData = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return

    setUserEmail(user.email || '')
    setLastSignIn(user.last_sign_in_at || null)

    // Check MFA status
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const hasTOTP = factors?.totp?.some(f => f.status === 'verified')
    setMfaEnabled(!!hasTOTP)

    // Mock sessions for now - Supabase doesn't expose session list directly
    setSessions([
      {
        id: 'current',
        user_agent: navigator.userAgent,
        ip: 'Current session',
        created_at: new Date().toISOString(),
        is_current: true,
      },
    ])

    setLoading(false)
  }

  const handleEnrollMFA = async () => {
    setMfaEnrolling(true)
    const supabase = createClient()

    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Authenticator App',
      })

      if (error) throw error

      if (data?.totp?.qr_code) {
        setEnrollData({
          qrCode: data.totp.qr_code,
          secret: data.totp.secret,
          factorId: data.id,
        })
      }
    } catch (err: unknown) {
      toast.error('MFA enrollment failed', getErrorMessage(err, 'Failed to enroll MFA'))
    }

    setMfaEnrolling(false)
  }

  const handleDisableMFA = async () => {
    setConfirmAction('disable-mfa')
  }

  const confirmDisableMFA = async () => {
    const supabase = createClient()
    const { data: factors } = await supabase.auth.mfa.listFactors()

    if (factors?.totp?.[0]) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: factors.totp[0].id })
      if (error) {
        const needsReauth =
          error.message?.toLowerCase().includes('aal') ||
          error.status === 403
        toast.error(
          'Failed to disable 2FA',
          needsReauth
            ? 'Please sign out and sign back in with your 2FA code, then try again.'
            : error.message
        )
        setConfirmAction(null)
        return
      }
      setMfaEnabled(false)
      toast.success('Two-factor authentication disabled')
    }
    setConfirmAction(null)
  }

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(false)

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match')
      return
    }

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters')
      return
    }

    setPasswordUpdating(true)

    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (error) {
      setPasswordError(error.message)
    } else {
      setPasswordSuccess(true)
      setNewPassword('')
      setConfirmPassword('')
    }

    setPasswordUpdating(false)
  }

  const handleSignOutAll = async () => {
    setConfirmAction('sign-out-all')
  }

  const confirmSignOutAll = async () => {
    const supabase = createClient()
    const { error } = await supabase.auth.signOut({ scope: 'others' })
    if (error) {
      toast.error('Failed to sign out other sessions', error.message)
    } else {
      toast.success('Signed out of all other sessions')
    }
    setConfirmAction(null)
  }

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Security</h1>
        <p className="text-muted-foreground mt-1">
          Manage your account security and authentication
        </p>
      </div>

      {/* Account overview */}
      <div className="bg-card border border-border rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Account Overview
        </h2>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="text-foreground">{userEmail}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Last sign in</dt>
            <dd className="text-foreground">
              {lastSignIn ? formatDate(lastSignIn) : 'Unknown'}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Two-factor authentication</dt>
            <dd>
              {mfaEnabled ? (
                <span className="inline-flex items-center gap-1 text-green-600">
                  <Check className="w-4 h-4" /> Enabled
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-600">
                  <AlertTriangle className="w-4 h-4" /> Not enabled
                </span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      {/* Two-factor authentication */}
      <div className="bg-card border border-border rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-foreground mb-2 flex items-center gap-2">
          <Smartphone className="w-5 h-5" />
          Two-Factor Authentication
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Add an extra layer of security by requiring a code from your authenticator app. Sensitive control-plane actions use this to approve changes in-app without forcing a full re-login.
        </p>

        {mfaEnabled ? (
          <div className="flex items-center justify-between p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
            <div className="flex items-center gap-3">
              <Check className="w-5 h-5 text-green-600" />
              <div>
                <p className="font-medium text-foreground">Two-factor is enabled</p>
                <p className="text-sm text-muted-foreground">
                  Your account is protected with an authenticator app
                </p>
              </div>
            </div>
            <button
              onClick={handleDisableMFA}
              className="text-sm text-red-600 hover:underline"
            >
              Disable
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <div>
                <p className="font-medium text-foreground">Two-factor is not enabled</p>
                <p className="text-sm text-muted-foreground">
                  We recommend enabling 2FA for additional security
                </p>
              </div>
            </div>
            <button
              onClick={handleEnrollMFA}
              disabled={mfaEnrolling}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 text-sm"
            >
              {mfaEnrolling ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Smartphone className="w-4 h-4" />
              )}
              Enable 2FA
            </button>
          </div>
        )}
      </div>

      {/* Change password */}
      <div className="bg-card border border-border rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Key className="w-5 h-5" />
          Change Password
        </h2>

        {passwordSuccess && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mb-4 flex items-center gap-3">
            <Check className="w-5 h-5 text-green-500" />
            <p className="text-green-600">Password updated successfully</p>
          </div>
        )}

        {passwordError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-4 flex items-center gap-3">
            <X className="w-5 h-5 text-red-500" />
            <p className="text-red-600">{passwordError}</p>
          </div>
        )}

        <form onSubmit={handleUpdatePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              New password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
              placeholder="Enter new password"
              minLength={8}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Confirm new password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground"
              placeholder="Confirm new password"
              minLength={8}
              required
            />
          </div>
          <button
            type="submit"
            disabled={passwordUpdating || !newPassword || !confirmPassword}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            {passwordUpdating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Key className="w-4 h-4" />
            )}
            Update Password
          </button>
        </form>
      </div>

      {/* Active sessions */}
      <div className="bg-card border border-border rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Active Sessions
          </h2>
          <button
            onClick={handleSignOutAll}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <LogOut className="w-4 h-4" />
            Sign out all others
          </button>
        </div>

        <div className="space-y-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`p-4 rounded-lg border ${
                session.is_current ? 'border-primary/30 bg-primary/5' : 'border-border'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground flex items-center gap-2">
                    {session.is_current && (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                        Current
                      </span>
                    )}
                    {session.ip}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 truncate max-w-md">
                    {session.user_agent.substring(0, 80)}...
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatDate(session.created_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-card border border-red-500/30 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-red-600 mb-2 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Danger Zone
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Permanently delete your account and all associated data.
        </p>
        <a
          href="/settings/organization"
          className="text-sm text-red-600 hover:underline"
        >
          Delete account in Organization Settings →
        </a>
      </div>

      {/* MFA Enrollment Modal */}
      {enrollData && (
        <MfaEnrollModal
          isOpen
          onClose={() => setEnrollData(null)}
          onSuccess={() => {
            setMfaEnabled(true)
            setEnrollData(null)
          }}
          qrCode={enrollData.qrCode}
          secret={enrollData.secret}
          factorId={enrollData.factorId}
        />
      )}

      {/* Disable MFA Confirm */}
      <ConfirmDialog
        isOpen={confirmAction === 'disable-mfa'}
        onClose={() => setConfirmAction(null)}
        onConfirm={confirmDisableMFA}
        title="Disable 2FA"
        message="Are you sure you want to disable two-factor authentication? This will make your account less secure."
        confirmLabel="Disable 2FA"
        variant="danger"
      />

      {/* Sign Out All Confirm */}
      <ConfirmDialog
        isOpen={confirmAction === 'sign-out-all'}
        onClose={() => setConfirmAction(null)}
        onConfirm={confirmSignOutAll}
        title="Sign Out All Sessions"
        message="Sign out of all other sessions? You will remain logged in on this device."
        confirmLabel="Sign Out Others"
      />
    </div>
  )
}
