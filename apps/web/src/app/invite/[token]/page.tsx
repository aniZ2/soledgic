import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Users, AlertCircle, Clock, CheckCircle } from 'lucide-react'

interface InvitePageProps {
  params: Promise<{ token: string }>
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params
  const supabase = await createClient()

  // Check if user is logged in
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch invitation details
  const { data: invitation, error } = await supabase
    .from('organization_invitations')
    .select(`
      id,
      email,
      role,
      status,
      expires_at,
      created_at,
      organization:organizations(
        id,
        name
      ),
      inviter:invited_by(
        id
      )
    `)
    .eq('token', token)
    .single()

  // Handle invalid token
  if (error || !invitation) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Invalid Invitation</h1>
          <p className="text-muted-foreground mb-6">
            This invitation link is invalid or has been removed. Please ask for a new invitation.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Go to Login
          </Link>
        </div>
      </div>
    )
  }

  const org = invitation.organization as unknown as { id: string; name: string } | null
  const isExpired = new Date(invitation.expires_at) < new Date()
  const isAlreadyUsed = invitation.status !== 'pending'

  // Handle expired invitation
  if (isExpired) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Clock className="w-8 h-8 text-amber-500" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Invitation Expired</h1>
          <p className="text-muted-foreground mb-6">
            This invitation has expired. Please ask the organization admin to send you a new invitation.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Go to Login
          </Link>
        </div>
      </div>
    )
  }

  // Handle already used invitation
  if (isAlreadyUsed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            {invitation.status === 'accepted' ? 'Invitation Already Accepted' : 'Invitation No Longer Valid'}
          </h1>
          <p className="text-muted-foreground mb-6">
            {invitation.status === 'accepted'
              ? 'This invitation has already been accepted. You can log in to access the organization.'
              : 'This invitation is no longer valid. Please request a new invitation if needed.'}
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Go to Login
          </Link>
        </div>
      </div>
    )
  }

  // Valid invitation - show accept page
  const roleLabels: Record<string, string> = {
    admin: 'Admin',
    member: 'Member',
    viewer: 'Viewer',
  }

  // If user is logged in, redirect to accept endpoint
  // If not logged in, show landing page with login/signup options
  const acceptUrl = `/api/invitations/accept?token=${token}`

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-card border border-border rounded-lg p-8 shadow-sm">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              You&apos;re invited!
            </h1>
            <p className="text-muted-foreground">
              You&apos;ve been invited to join
            </p>
          </div>

          {/* Organization info */}
          <div className="bg-muted/50 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <span className="text-lg font-bold text-primary">
                  {org?.name?.charAt(0).toUpperCase() || '?'}
                </span>
              </div>
              <div>
                <p className="font-semibold text-foreground">{org?.name || 'Unknown Organization'}</p>
                <p className="text-sm text-muted-foreground">
                  as {roleLabels[invitation.role] || invitation.role}
                </p>
              </div>
            </div>
          </div>

          {/* Invitation details */}
          <div className="text-sm text-muted-foreground mb-6 space-y-1">
            <p>Invited: {invitation.email}</p>
            <p>Expires: {new Date(invitation.expires_at).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}</p>
          </div>

          {/* Actions */}
          {user ? (
            // User is logged in - show accept button
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground text-center mb-4">
                Logged in as <span className="text-foreground">{user.email}</span>
              </p>
              <a
                href={acceptUrl}
                className="w-full flex items-center justify-center px-4 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-medium"
              >
                Accept Invitation
              </a>
              <Link
                href="/dashboard"
                className="w-full flex items-center justify-center px-4 py-3 border border-border rounded-md hover:bg-muted transition-colors text-muted-foreground"
              >
                Go to Dashboard
              </Link>
            </div>
          ) : (
            // User is not logged in - show login/signup options
            <div className="space-y-3">
              <Link
                href={`/login?invite=${token}&email=${encodeURIComponent(invitation.email)}`}
                className="w-full flex items-center justify-center px-4 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-medium"
              >
                Log in to Accept
              </Link>
              <Link
                href={`/signup?invite=${token}&email=${encodeURIComponent(invitation.email)}`}
                className="w-full flex items-center justify-center px-4 py-3 border border-border rounded-md hover:bg-muted transition-colors"
              >
                Create Account
              </Link>
              <p className="text-xs text-muted-foreground text-center mt-4">
                By accepting this invitation, you agree to join {org?.name || 'this organization'} and accept our terms of service.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
