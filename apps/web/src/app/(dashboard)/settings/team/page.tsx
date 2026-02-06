'use client'

import { useState, useEffect } from 'react'
import {
  Loader2, Crown, ShieldCheck, Shield, Eye,
  UserPlus, X, ChevronDown, Check, AlertTriangle,
  Mail, Clock, Trash2, Info,
} from 'lucide-react'
import { fetchWithCsrf } from '@/lib/fetch-with-csrf'

interface Member {
  id: string
  user_id: string
  role: string
  status: string
  created_at: string
  email: string | null
  full_name: string | null
}

interface Invitation {
  id: string
  email: string
  role: string
  created_at: string
  expires_at: string
}

interface Organization {
  id: string
  name: string
  plan: string
  max_team_members: number
  current_member_count: number
}

interface TeamData {
  members: Member[]
  invitations: Invitation[]
  current_user_id: string
  current_user_role: string
  organization: Organization
}

const rolePermissions: Record<string, string[]> = {
  owner: ['Full access', 'Manage billing', 'Delete organization', 'Manage team'],
  admin: ['Manage team', 'Create ledgers', 'Full transaction access'],
  member: ['View ledgers', 'Create transactions', 'View reports'],
  viewer: ['Read-only access', 'View transactions', 'View reports'],
}

function RoleBadge({ role }: { role: string }) {
  const config: Record<string, { label: string; className: string; icon: typeof Crown }> = {
    owner: { label: 'Owner', className: 'bg-amber-500/10 text-amber-600', icon: Crown },
    admin: { label: 'Admin', className: 'bg-blue-500/10 text-blue-600', icon: ShieldCheck },
    member: { label: 'Member', className: 'bg-green-500/10 text-green-600', icon: Shield },
    viewer: { label: 'Viewer', className: 'bg-gray-500/10 text-gray-600', icon: Eye },
  }

  const c = config[role] || config.member
  const Icon = c.icon

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.className}`}>
      <Icon className="w-3 h-3" />
      {c.label}
    </span>
  )
}

function RoleInfoPopover() {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-1 text-muted-foreground hover:text-foreground transition-colors"
        title="Role permissions"
      >
        <Info className="w-4 h-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-2 w-72 bg-card border border-border rounded-lg shadow-lg z-20 p-4">
            <h4 className="font-medium text-foreground mb-3">Role Permissions</h4>
            <div className="space-y-3">
              {Object.entries(rolePermissions).map(([role, perms]) => (
                <div key={role}>
                  <RoleBadge role={role} />
                  <ul className="mt-1.5 text-xs text-muted-foreground space-y-0.5 ml-1">
                    {perms.map(perm => (
                      <li key={perm}>• {perm}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function TeamSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<TeamData | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  const [inviting, setInviting] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  useEffect(() => {
    loadTeamData()
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!openMenuId) return
    const handler = () => setOpenMenuId(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [openMenuId])

  const loadTeamData = async () => {
    try {
      const res = await fetch('/api/team')
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch (err) {
      console.error('Failed to load team data:', err)
    }
    setLoading(false)
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviting(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const res = await fetchWithCsrf('/api/team', {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })
      const json = await res.json()

      if (res.ok) {
        setSuccessMessage(
          json.warning
            ? `Invitation created. ${json.warning}`
            : `Invitation sent to ${inviteEmail}`
        )
        setInviteEmail('')
        setInviteRole('member')
        await loadTeamData()
      } else {
        setErrorMessage(json.error || 'Failed to send invitation')
      }
    } catch {
      setErrorMessage('Something went wrong. Please try again.')
    }

    setInviting(false)
  }

  const handleRoleChange = async (memberId: string, newRole: string) => {
    setOpenMenuId(null)
    setActionLoading(memberId)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const res = await fetchWithCsrf(`/api/team/${memberId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole }),
      })
      const json = await res.json()

      if (res.ok) {
        setSuccessMessage('Role updated')
        await loadTeamData()
      } else {
        setErrorMessage(json.error || 'Failed to update role')
      }
    } catch {
      setErrorMessage('Something went wrong. Please try again.')
    }

    setActionLoading(null)
  }

  const handleRemoveMember = async (memberId: string) => {
    setOpenMenuId(null)
    if (!confirm('Are you sure you want to remove this team member?')) return

    setActionLoading(memberId)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const res = await fetchWithCsrf(`/api/team/${memberId}`, {
        method: 'DELETE',
      })
      const json = await res.json()

      if (res.ok) {
        setSuccessMessage('Team member removed')
        await loadTeamData()
      } else {
        setErrorMessage(json.error || 'Failed to remove member')
      }
    } catch {
      setErrorMessage('Something went wrong. Please try again.')
    }

    setActionLoading(null)
  }

  const handleRevokeInvitation = async (inviteId: string) => {
    if (!confirm('Are you sure you want to revoke this invitation?')) return

    setActionLoading(inviteId)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const res = await fetchWithCsrf(`/api/team/invitations/${inviteId}`, {
        method: 'DELETE',
      })
      const json = await res.json()

      if (res.ok) {
        setSuccessMessage('Invitation revoked')
        await loadTeamData()
      } else {
        setErrorMessage(json.error || 'Failed to revoke invitation')
      }
    } catch {
      setErrorMessage('Something went wrong. Please try again.')
    }

    setActionLoading(null)
  }

  const handleResendInvite = async (inviteId: string, email: string) => {
    setActionLoading(inviteId)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const res = await fetchWithCsrf(`/api/team/invitations/${inviteId}/resend`, {
        method: 'POST',
      })
      const json = await res.json()

      if (res.ok) {
        setSuccessMessage(`Invitation resent to ${email}`)
      } else {
        setErrorMessage(json.error || 'Failed to resend invitation')
      }
    } catch {
      setErrorMessage('Something went wrong. Please try again.')
    }

    setActionLoading(null)
  }

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="max-w-2xl">
        <p className="text-muted-foreground">Failed to load team data. Please refresh the page.</p>
      </div>
    )
  }

  const { members, invitations, current_user_role, organization } = data
  const isOwnerOrAdmin = current_user_role === 'owner' || current_user_role === 'admin'
  const isOwner = current_user_role === 'owner'
  const isAtLimit = organization.max_team_members !== -1 &&
    organization.current_member_count >= organization.max_team_members
  const isOverLimit = organization.max_team_members !== -1 &&
    organization.current_member_count > organization.max_team_members

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold text-foreground">Team Members</h1>
          <RoleInfoPopover />
        </div>
        <p className="text-muted-foreground mt-1">
          Manage who has access to your organization
        </p>
      </div>

      {/* Success banner */}
      {successMessage && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mb-6 flex items-center gap-3">
          <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
          <p className="text-green-600 flex-1">{successMessage}</p>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-green-600 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Error banner */}
      {errorMessage && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6 flex items-center gap-3">
          <X className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-600 flex-1">{errorMessage}</p>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-600 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Plan limit banner */}
      {(isAtLimit || isOverLimit) && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mb-6 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-foreground">
              {organization.current_member_count} of {organization.max_team_members} team member{organization.max_team_members === 1 ? '' : 's'} on the {organization.plan} plan
            </p>
            <p className="text-sm text-muted-foreground">
              Upgrade your plan to add more team members.
            </p>
          </div>
        </div>
      )}

      {/* Invite form — only visible to owner/admin */}
      {isOwnerOrAdmin && (
        <div className="bg-card border border-border rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Invite Team Member
          </h2>
          <form onSubmit={handleInvite} className="flex gap-3">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@company.com"
              required
              disabled={isAtLimit}
              className="flex-1 px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground disabled:opacity-50"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              disabled={isAtLimit}
              className="px-3 py-2 border border-border rounded-md bg-background text-foreground disabled:opacity-50"
            >
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
              {isOwner && <option value="admin">Admin</option>}
            </select>
            <button
              type="submit"
              disabled={inviting || !inviteEmail || isAtLimit}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 whitespace-nowrap"
            >
              {inviting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Mail className="w-4 h-4" />
              )}
              Send Invite
            </button>
          </form>
        </div>
      )}

      {/* Members list */}
      <div className="bg-card border border-border rounded-lg overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            Members ({members.length})
          </h2>
        </div>
        <div className="divide-y divide-border">
          {members.map((member) => {
            const displayName = member.full_name || member.email || 'Unknown'
            const initial = (displayName[0] || '?').toUpperCase()
            const isSelf = member.user_id === data.current_user_id
            const canManage = isOwnerOrAdmin &&
              member.role !== 'owner' &&
              !isSelf &&
              !(current_user_role === 'admin' && member.role === 'admin')

            return (
              <div key={member.id} className="px-6 py-4 flex items-center gap-4">
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-medium text-primary">{initial}</span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">
                    {member.full_name || member.email || 'Unknown user'}
                    {isSelf && <span className="text-muted-foreground ml-1">(you)</span>}
                  </p>
                  {member.full_name && member.email && (
                    <p className="text-sm text-muted-foreground truncate">{member.email}</p>
                  )}
                </div>

                {/* Role badge */}
                <RoleBadge role={member.role} />

                {/* Actions menu */}
                {canManage && (
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenMenuId(openMenuId === member.id ? null : member.id)
                      }}
                      disabled={actionLoading === member.id}
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                    >
                      {actionLoading === member.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>

                    {openMenuId === member.id && (
                      <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-lg shadow-lg z-10 py-1">
                        <div className="px-3 py-1.5 text-xs text-muted-foreground font-medium">
                          Change role
                        </div>
                        {(isOwner ? ['admin', 'member', 'viewer'] : ['member', 'viewer'])
                          .filter(r => r !== member.role)
                          .map(r => (
                            <button
                              key={r}
                              onClick={() => handleRoleChange(member.id, r)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted capitalize"
                            >
                              {r}
                            </button>
                          ))
                        }
                        <div className="border-t border-border my-1" />
                        <button
                          onClick={() => handleRemoveMember(member.id)}
                          className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-500/10"
                        >
                          Remove member
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Pending Invitations ({invitations.length})
            </h2>
          </div>
          <div className="divide-y divide-border">
            {invitations.map((invite) => (
              <div key={invite.id} className="px-6 py-4 flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{invite.email}</p>
                  <p className="text-sm text-muted-foreground">
                    Expires {formatDate(invite.expires_at)}
                  </p>
                </div>
                <RoleBadge role={invite.role} />
                {isOwnerOrAdmin && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleResendInvite(invite.id, invite.email)}
                      disabled={actionLoading === invite.id}
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                      title="Resend invitation"
                    >
                      {actionLoading === invite.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Mail className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleRevokeInvitation(invite.id)}
                      disabled={actionLoading === invite.id}
                      className="p-1.5 rounded-md hover:bg-red-500/10 text-muted-foreground hover:text-red-600"
                      title="Revoke invitation"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Non-admin notice */}
      {!isOwnerOrAdmin && (
        <p className="text-sm text-muted-foreground">
          Only organization owners and admins can manage team members.
        </p>
      )}
    </div>
  )
}
