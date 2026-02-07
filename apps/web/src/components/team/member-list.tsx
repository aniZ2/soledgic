'use client'

import { useState } from 'react'
import { MoreHorizontal, Trash2, Mail, Shield, User, Eye, Crown, Loader2 } from 'lucide-react'

export interface TeamMember {
  id: string
  user_id: string
  email: string | null
  full_name: string | null
  role: 'owner' | 'admin' | 'member' | 'viewer'
  status: string
  created_at: string
}

export interface Invitation {
  id: string
  email: string
  role: string
  created_at: string
  expires_at: string
}

interface MemberListProps {
  members: TeamMember[]
  invitations: Invitation[]
  currentUserId: string
  currentUserRole: string
  onRemoveMember: (memberId: string) => Promise<void>
  onRevokeInvitation: (inviteId: string) => Promise<void>
  onResendInvitation: (email: string, role: string) => Promise<void>
}

const ROLE_CONFIG = {
  owner: {
    label: 'Owner',
    icon: Crown,
    color: 'text-amber-600 bg-amber-500/10',
    description: 'Full access, billing, delete org',
  },
  admin: {
    label: 'Admin',
    icon: Shield,
    color: 'text-blue-600 bg-blue-500/10',
    description: 'Manage team, create ledgers',
  },
  member: {
    label: 'Member',
    icon: User,
    color: 'text-green-600 bg-green-500/10',
    description: 'View/edit transactions',
  },
  viewer: {
    label: 'Viewer',
    icon: Eye,
    color: 'text-gray-600 bg-gray-500/10',
    description: 'Read-only access',
  },
}

export function MemberList({
  members,
  invitations,
  currentUserId,
  currentUserRole,
  onRemoveMember,
  onRevokeInvitation,
  onResendInvitation,
}: MemberListProps) {
  const [loadingMember, setLoadingMember] = useState<string | null>(null)
  const [loadingInvite, setLoadingInvite] = useState<string | null>(null)
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  const canManageTeam = currentUserRole === 'owner' || currentUserRole === 'admin'

  const handleRemoveMember = async (memberId: string) => {
    setLoadingMember(memberId)
    setOpenMenu(null)
    try {
      await onRemoveMember(memberId)
    } finally {
      setLoadingMember(null)
    }
  }

  const handleRevokeInvitation = async (inviteId: string) => {
    setLoadingInvite(inviteId)
    setOpenMenu(null)
    try {
      await onRevokeInvitation(inviteId)
    } finally {
      setLoadingInvite(null)
    }
  }

  const handleResendInvitation = async (email: string, role: string) => {
    setOpenMenu(null)
    await onResendInvitation(email, role)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const getRoleBadge = (role: string) => {
    const config = ROLE_CONFIG[role as keyof typeof ROLE_CONFIG] || ROLE_CONFIG.viewer
    const Icon = config.icon
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </span>
    )
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Active Members */}
      <div className="px-6 py-4 border-b border-border">
        <h3 className="font-semibold text-foreground">Team Members</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {members.length} active member{members.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="divide-y divide-border">
        {members.map((member) => {
          const isCurrentUser = member.user_id === currentUserId
          const canRemove = canManageTeam && !isCurrentUser && member.role !== 'owner'

          return (
            <div key={member.id} className="px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-medium text-primary">
                    {(member.full_name || member.email || '?').charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">
                      {member.full_name || member.email?.split('@')[0] || 'Unknown'}
                    </p>
                    {isCurrentUser && (
                      <span className="text-xs text-muted-foreground">(you)</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{member.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {getRoleBadge(member.role)}

                {canRemove && (
                  <div className="relative">
                    <button
                      onClick={() => setOpenMenu(openMenu === member.id ? null : member.id)}
                      className="p-2 hover:bg-accent rounded transition-colors"
                      disabled={loadingMember === member.id}
                    >
                      {loadingMember === member.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      ) : (
                        <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>

                    {openMenu === member.id && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setOpenMenu(null)}
                        />
                        <div className="absolute right-0 mt-1 w-48 bg-popover border border-border rounded-lg shadow-lg z-20">
                          <button
                            onClick={() => handleRemoveMember(member.id)}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-accent transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                            Remove from team
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <>
          <div className="px-6 py-4 border-t border-border bg-muted/30">
            <h3 className="font-semibold text-foreground">Pending Invitations</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {invitations.length} pending invitation{invitations.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="divide-y divide-border">
            {invitations.map((invite) => (
              <div key={invite.id} className="px-6 py-4 flex items-center justify-between bg-muted/10">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                    <Mail className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{invite.email}</p>
                    <p className="text-sm text-muted-foreground">
                      Invited {formatDate(invite.created_at)} · Expires {formatDate(invite.expires_at)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {getRoleBadge(invite.role)}

                  {canManageTeam && (
                    <div className="relative">
                      <button
                        onClick={() => setOpenMenu(openMenu === invite.id ? null : invite.id)}
                        className="p-2 hover:bg-accent rounded transition-colors"
                        disabled={loadingInvite === invite.id}
                      >
                        {loadingInvite === invite.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        ) : (
                          <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                        )}
                      </button>

                      {openMenu === invite.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setOpenMenu(null)}
                          />
                          <div className="absolute right-0 mt-1 w-48 bg-popover border border-border rounded-lg shadow-lg z-20">
                            <button
                              onClick={() => handleResendInvitation(invite.email, invite.role)}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                            >
                              <Mail className="w-4 h-4" />
                              Resend invitation
                            </button>
                            <button
                              onClick={() => handleRevokeInvitation(invite.id)}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-accent transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                              Revoke invitation
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Role Permissions */}
      <div className="px-6 py-4 border-t border-border bg-muted/20">
        <h4 className="text-sm font-medium text-foreground mb-3">Role Permissions</h4>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(ROLE_CONFIG).map(([role, config]) => (
            <div key={role} className="flex items-start gap-2 text-sm">
              <config.icon className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div>
                <span className="font-medium text-foreground">{config.label}:</span>{' '}
                <span className="text-muted-foreground">{config.description}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
