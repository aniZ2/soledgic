import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendSecurityAlertEmail } from '@/lib/email'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Get IP address from request headers
  const forwardedFor = request.headers.get('x-forwarded-for')
  const ipAddress = forwardedFor?.split(',')[0]?.trim() || 'Unknown'

  // Send security alert email
  await sendSecurityAlertEmail({
    to: user.email,
    alertType: 'password_changed',
    details: 'Your Soledgic account password was successfully changed.',
    ipAddress,
    timestamp: new Date().toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }),
  })

  return NextResponse.json({ success: true })
}
