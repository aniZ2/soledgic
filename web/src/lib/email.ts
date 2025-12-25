/**
 * Email Sending Utility
 * Uses Resend API for transactional emails
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL = process.env.EMAIL_FROM || 'Soledgic <noreply@soledgic.com>'
const APP_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

interface EmailResult {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * Send an email using Resend API
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  if (!RESEND_API_KEY) {
    if (process.env.NODE_ENV === 'production') {
      console.error('EMAIL ERROR: RESEND_API_KEY is not configured')
      return { success: false, error: 'Email service not configured' }
    }
    // In development, just log the email
    console.warn('Email not sent (RESEND_API_KEY not set):', {
      to: options.to,
      subject: options.subject,
    })
    return { success: true, messageId: 'dev-skipped' }
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Email send failed:', error)
      return { success: false, error: error.message || 'Failed to send email' }
    }

    const data = await response.json()
    return { success: true, messageId: data.id }
  } catch (error) {
    console.error('Email send error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Send organization invitation email
 */
export async function sendInvitationEmail(params: {
  email: string
  organizationName: string
  inviterName: string
  role: string
  invitationId: string
}): Promise<EmailResult> {
  const { email, organizationName, inviterName, role, invitationId } = params
  const inviteUrl = `${APP_URL}/invite?id=${invitationId}`

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #f9fafb; border-radius: 8px; padding: 32px; margin-bottom: 24px;">
        <h1 style="margin: 0 0 16px; font-size: 24px; color: #111;">You've been invited</h1>
        <p style="margin: 0 0 24px; color: #666;">
          <strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> as a <strong>${role}</strong>.
        </p>
        <a href="${inviteUrl}" style="display: inline-block; background: #0f172a; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
          Accept Invitation
        </a>
      </div>
      <p style="color: #999; font-size: 14px;">
        If you didn't expect this invitation, you can safely ignore this email.
      </p>
    </body>
    </html>
  `

  const text = `
You've been invited to join ${organizationName}

${inviterName} has invited you to join ${organizationName} as a ${role}.

Accept the invitation: ${inviteUrl}

If you didn't expect this invitation, you can safely ignore this email.
  `.trim()

  return sendEmail({
    to: email,
    subject: `You've been invited to join ${organizationName}`,
    html,
    text,
  })
}
