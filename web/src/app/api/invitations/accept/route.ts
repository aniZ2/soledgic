import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function POST(request: Request) {
  const formData = await request.formData()
  const token = formData.get('token') as string

  if (!token) {
    redirect('/login?error=invalid_token')
  }

  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect(`/login?invite=${token}`)
  }

  // Get invitation
  const { data: invitation, error: inviteError } = await supabase
    .from('organization_invitations')
    .select('*')
    .eq('token', token)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .single()

  if (inviteError || !invitation) {
    redirect('/dashboard?error=invitation_expired')
  }

  // Verify email matches (or allow any logged in user)
  // For now, we'll allow any logged in user to accept

  // Create membership
  const { error: memberError } = await supabase
    .from('organization_members')
    .insert({
      organization_id: invitation.organization_id,
      user_id: user.id,
      role: invitation.role,
      invited_by: invitation.invited_by,
      invited_at: invitation.created_at,
      accepted_at: new Date().toISOString(),
      status: 'active',
    })

  if (memberError) {
    // Might already be a member
    redirect('/dashboard?error=already_member')
  }

  // Update invitation status
  await supabase
    .from('organization_invitations')
    .update({ 
      status: 'accepted',
      accepted_at: new Date().toISOString(),
    })
    .eq('id', invitation.id)

  redirect('/dashboard?success=invitation_accepted')
}
