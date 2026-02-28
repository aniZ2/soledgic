'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MemberList, TeamMember, Invitation } from '@/components/team/member-list'
import { InviteMemberDialog } from '@/components/team/invite-member-dialog'
import { UserPlus, AlertCircle } from 'lucide-react'
import { fetchWithCsrf } from '@/lib/fetch-with-csrf'

interface TeamData {
  members: TeamMember[]
  invitations: Invitation[]
  current_user_id: string
  current_user_role: string
  organization: {
    id: string
    name: string
    plan: string
    status: string
    max_team_members: number
    current_member_count: number
    overage_team_member_price: number
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export default function TeamSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [teamData, setTeamData] = useState<TeamData | null>(null)
  const [showInviteDialog, setShowInviteDialog] = useState(false)

  const loadTeamData = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setError('Not authenticated')
        setLoading(false)
        return
      }

      const res = await fetchWithCsrf('/api/team')

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to load team data')
      }

      const data = await res.json()
      setTeamData(data)
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to load team data'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTeamData()
  }, [loadTeamData])

  const handleInvite = async (email: string, role: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetchWithCsrf('/api/team', {
        method: 'POST',
        body: JSON.stringify({ email, role }),
      })

      const data = await res.json()

      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to send invitation' }
      }

      // Reload team data
      await loadTeamData()
      return { success: true }
    } catch (err: unknown) {
      return { success: false, error: getErrorMessage(err, 'An unexpected error occurred') }
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    try {
      const res = await fetchWithCsrf(`/api/team/${memberId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to remove member')
      }

      await loadTeamData()
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to remove member'))
    }
  }

  const handleRevokeInvitation = async (inviteId: string) => {
    try {
      const res = await fetchWithCsrf(`/api/team/invitations/${inviteId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to revoke invitation')
      }

      await loadTeamData()
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to revoke invitation'))
    }
  }

  const handleResendInvitation = async (email: string, role: string) => {
    // Revoke old invite and send new one
    const existingInvite = teamData?.invitations.find(i => i.email === email)
    if (existingInvite) {
      await handleRevokeInvitation(existingInvite.id)
    }
    await handleInvite(email, role)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error && !teamData) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-foreground mb-2">Failed to load team</h2>
        <p className="text-muted-foreground mb-4">{error}</p>
        <button
          onClick={() => {
            setError(null)
            setLoading(true)
            loadTeamData()
          }}
          className="text-primary hover:underline"
        >
          Try again
        </button>
      </div>
    )
  }

  if (!teamData) return null

  const { organization, members, invitations, current_user_id, current_user_role } = teamData
  const canManageTeam = current_user_role === 'owner' || current_user_role === 'admin'
  const includedMembers = organization.max_team_members === -1
    ? organization.current_member_count
    : organization.max_team_members
  const additionalMembers = organization.max_team_members === -1
    ? 0
    : Math.max(0, organization.current_member_count - organization.max_team_members)
  const teamMemberOveragePrice = organization.overage_team_member_price ?? 2000

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Team</h1>
          <p className="text-muted-foreground mt-1">
            Manage your team members and invitations
          </p>
        </div>

        {canManageTeam && (
          <button
            onClick={() => setShowInviteDialog(true)}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Invite Member
          </button>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-600 text-sm rounded-md p-3 mb-6">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="mb-6 p-4 rounded-lg border bg-muted/50 border-border">
        <p className="font-medium text-foreground">
          {organization.current_member_count} team member{organization.current_member_count === 1 ? '' : 's'} active
        </p>
        <p className="text-sm text-muted-foreground">
          {includedMembers} included. Additional team members: $
          {(teamMemberOveragePrice / 100).toFixed(0)}
          /month each.
          {additionalMembers > 0 ? ` (${additionalMembers} additional member${additionalMembers === 1 ? '' : 's'} currently billed)` : ''}
        </p>
      </div>

      {/* Member List */}
      <MemberList
        members={members}
        invitations={invitations}
        currentUserId={current_user_id}
        currentUserRole={current_user_role}
        onRemoveMember={handleRemoveMember}
        onRevokeInvitation={handleRevokeInvitation}
        onResendInvitation={handleResendInvitation}
      />

      {/* Invite Dialog */}
      <InviteMemberDialog
        isOpen={showInviteDialog}
        onClose={() => setShowInviteDialog(false)}
        onInvite={handleInvite}
        currentUserRole={current_user_role}
      />
    </div>
  )
}
