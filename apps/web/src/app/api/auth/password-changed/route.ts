import { NextResponse } from 'next/server'
import { createApiHandler } from '@/lib/api-handler'
import { sendSecurityAlertEmail } from '@/lib/email'

function getClientIp(request: Request): string {
  const ipCandidates = [
    request.headers.get('cf-connecting-ip'),
    request.headers.get('x-real-ip'),
    request.headers.get('x-vercel-forwarded-for'),
    request.headers.get('x-forwarded-for'),
  ]
  return ipCandidates
    .map((candidate) => (candidate || '').split(',')[0].trim())
    .find((candidate) => candidate.length > 0) || 'Unknown'
}

export const POST = createApiHandler(
  async (request, { user }) => {
    if (!user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const ipAddress = getClientIp(request)

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
  },
  {
    requireAuth: true,
    rateLimit: true,
    csrfProtection: true,
    routePath: '/api/auth/password-changed',
  }
)
