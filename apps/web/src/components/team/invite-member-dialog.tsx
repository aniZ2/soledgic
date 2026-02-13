'use client'

import { useState } from 'react'
import { X, Loader2, UserPlus, Shield, User, Eye } from 'lucide-react'

interface InviteMemberDialogProps {
  isOpen: boolean
  onClose: () => void
  onInvite: (email: string, role: string) => Promise<{ success: boolean; error?: string }>
  currentUserRole: string
}

const ROLES = [
  {
    id: 'admin',
    label: 'Admin',
    description: 'Can manage team members and create ledgers',
    icon: Shield,
    ownerOnly: true,
  },
  {
    id: 'member',
    label: 'Member',
    description: 'Can view and edit transactions',
    icon: User,
    ownerOnly: false,
  },
  {
    id: 'viewer',
    label: 'Viewer',
    description: 'Read-only access to data',
    icon: Eye,
    ownerOnly: false,
  },
]

export function InviteMemberDialog({
  isOpen,
  onClose,
  onInvite,
  currentUserRole,
}: InviteMemberDialogProps) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email) {
      setError('Email is required')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address')
      return
    }

    setLoading(true)

    try {
      const result = await onInvite(email.toLowerCase(), role)
      if (result.success) {
        setEmail('')
        setRole('member')
        onClose()
      } else {
        setError(result.error || 'Failed to send invitation')
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (!loading) {
      setEmail('')
      setRole('member')
      setError(null)
      onClose()
    }
  }

  if (!isOpen) return null

  const availableRoles = ROLES.filter(
    (r) => !r.ownerOnly || currentUserRole === 'owner'
  )

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
                <UserPlus className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Invite Team Member</h2>
                <p className="text-sm text-muted-foreground">
                  Send an invitation via email
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-accent rounded transition-colors"
              disabled={loading}
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-600 text-sm rounded-md p-3">
                {error}
              </div>
            )}

            {/* Email Input */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="w-full border border-border rounded-md py-2 px-3 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                disabled={loading}
              />
            </div>

            {/* Role Selection */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Role
              </label>
              <div className="space-y-2">
                {availableRoles.map((r) => (
                  <label
                    key={r.id}
                    className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      role === r.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-accent/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={r.id}
                      checked={role === r.id}
                      onChange={(e) => setRole(e.target.value)}
                      className="mt-1"
                      disabled={loading}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <r.icon className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium text-foreground">{r.label}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {r.description}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    Send Invitation
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
