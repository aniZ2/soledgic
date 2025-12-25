import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

interface Invitation {
  id: string
  email: string
  role: string
  status: string
  expires_at: string
  organization?: { name: string } | null
}

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-bold text-foreground">Invalid Invitation</h1>
          <p className="mt-2 text-muted-foreground">
            This invitation link is invalid or has expired.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block bg-primary text-primary-foreground px-6 py-3 rounded-md"
          >
            Go to login
          </Link>
        </div>
      </div>
    )
  }

  const supabase = await createClient()

  // Look up invitation
  const { data, error } = await supabase
    .from('organization_invitations')
    .select(`
      id,
      email,
      role,
      status,
      expires_at,
      organization:organizations(name)
    `)
    .eq('token', token)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .single()

  const invitation = data as Invitation | null

  if (error || !invitation) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-bold text-foreground">Invitation Expired</h1>
          <p className="mt-2 text-muted-foreground">
            This invitation has expired or has already been used.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block bg-primary text-primary-foreground px-6 py-3 rounded-md"
          >
            Go to login
          </Link>
        </div>
      </div>
    )
  }

  // Check if user is logged in
  const { data: { user } } = await supabase.auth.getUser()

  const organizationName = invitation.organization?.name || 'this organization'

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-3xl font-bold text-primary">
            Soledge
          </Link>
        </div>

        <div className="bg-card border border-border rounded-lg p-8">
          <h1 className="text-2xl font-bold text-foreground text-center">
            You're Invited
          </h1>
          <p className="mt-2 text-muted-foreground text-center">
            Join <strong className="text-foreground">{organizationName}</strong> on Soledge
          </p>

          <div className="mt-6 p-4 bg-muted/50 rounded-lg">
            <div className="text-sm text-muted-foreground">
              <p>Invited as: <span className="text-foreground capitalize">{invitation.role}</span></p>
              <p className="mt-1">Email: <span className="text-foreground">{invitation.email}</span></p>
            </div>
          </div>

          {user ? (
            // User is logged in - show accept button
            <form action="/api/invitations/accept" method="POST" className="mt-6">
              <input type="hidden" name="token" value={token} />
              <button
                type="submit"
                className="w-full bg-primary text-primary-foreground py-3 rounded-md font-medium hover:bg-primary/90"
              >
                Accept Invitation
              </button>
            </form>
          ) : (
            // User not logged in - redirect to signup/login
            <div className="mt-6 space-y-3">
              <Link
                href={`/signup?invite=${token}&email=${encodeURIComponent(invitation.email)}`}
                className="block w-full bg-primary text-primary-foreground py-3 rounded-md font-medium hover:bg-primary/90 text-center"
              >
                Create Account
              </Link>
              <Link
                href={`/login?invite=${token}`}
                className="block w-full border border-border py-3 rounded-md font-medium hover:bg-accent text-center"
              >
                Sign in to existing account
              </Link>
            </div>
          )}

          <p className="mt-6 text-xs text-muted-foreground text-center">
            This invitation expires on {new Date(invitation.expires_at).toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  )
}
