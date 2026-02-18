import { Resend } from 'resend'

let _resend: Resend | null = null

export function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY!)
  }
  return _resend
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const FROM_EMAIL = 'Soledgic <team@soledgic.com>'

// Email wrapper for consistent styling
function emailTemplate(content: string, footer = 'Soledgic — Creator economy infrastructure') {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
          <tr>
            <td style="padding:32px 32px 24px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #f3f4f6;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                ${footer}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

// Common button style
const buttonStyle = 'display:inline-block;padding:10px 24px;background-color:#111827;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;'

interface EmailResult {
  success: boolean
  error?: string
}

// ════════════════════════════════════════════════════════════════════════════
// Team Invitation Email
// ════════════════════════════════════════════════════════════════════════════

interface SendTeamInviteEmailParams {
  to: string
  orgName: string
  inviterName: string
  role: string
  token: string
}

export async function sendTeamInviteEmail({
  to,
  orgName,
  inviterName,
  role,
  token,
}: SendTeamInviteEmailParams): Promise<EmailResult> {
  const acceptUrl = `${APP_URL}/api/invitations/accept?token=${token}`

  const content = `
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">
      You've been invited to join ${orgName}
    </h1>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.5;">
      ${inviterName} has invited you to join <strong>${orgName}</strong> on Soledgic as a <strong>${role}</strong>.
    </p>
    <a href="${acceptUrl}" style="${buttonStyle}">
      Accept Invitation
    </a>
    <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
      This invitation expires in 7 days. If you didn't expect this email, you can safely ignore it.
    </p>
  `

  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject: `${inviterName} invited you to join ${orgName} on Soledgic`,
      html: emailTemplate(content),
    })
    return { success: true }
  } catch (err: any) {
    console.error('Failed to send invite email:', err.message)
    return { success: false, error: err.message }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Welcome Email (after signup)
// ════════════════════════════════════════════════════════════════════════════

interface SendWelcomeEmailParams {
  to: string
  name: string
}

export async function sendWelcomeEmail({
  to,
  name,
}: SendWelcomeEmailParams): Promise<EmailResult> {
  const content = `
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">
      Welcome to Soledgic, ${name}!
    </h1>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.5;">
      Thanks for signing up. Soledgic helps you track creator earnings, process payouts, and maintain an audit-ready ledger.
    </p>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.5;">
      Here's what you can do next:
    </p>
    <ul style="margin:0 0 24px;padding-left:20px;font-size:14px;color:#6b7280;line-height:1.8;">
      <li>Complete onboarding to create your first ledger</li>
      <li>Generate API keys for your integration</li>
      <li>Record your first transaction</li>
    </ul>
    <a href="${APP_URL}/getting-started" style="${buttonStyle}">
      Get Started
    </a>
    <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
      Need help? Reply to this email or check out our <a href="${APP_URL}/docs" style="color:#6366f1;">documentation</a>.
    </p>
  `

  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject: 'Welcome to Soledgic',
      html: emailTemplate(content),
    })
    return { success: true }
  } catch (err: any) {
    console.error('Failed to send welcome email:', err.message)
    return { success: false, error: err.message }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Free Plan Billing Reminder Email
// ════════════════════════════════════════════════════════════════════════════

interface SendBillingReminderEmailParams {
  to: string
  orgName: string
  daysLeft: number
}

export async function sendBillingReminderEmail({
  to,
  orgName,
  daysLeft,
}: SendBillingReminderEmailParams): Promise<EmailResult> {
  const content = `
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">
      Billing reminder for ${orgName}
    </h1>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.5;">
      Soledgic starts free with one included ledger and one included team member. Additional ledgers and additional team members are billed at $20/month each, and payment processing fees apply.
    </p>
    <a href="${APP_URL}/billing" style="${buttonStyle}">
      View Billing
    </a>
    <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
      Current pricing details can be reviewed at any time from your billing page.
    </p>
  `

  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Soledgic billing reminder`,
      html: emailTemplate(content),
    })
    return { success: true }
  } catch (err: any) {
    console.error('Failed to send billing reminder email:', err.message)
    return { success: false, error: err.message }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Payment Failed Email
// ════════════════════════════════════════════════════════════════════════════

interface SendPaymentFailedEmailParams {
  to: string
  orgName: string
  amount: string
  nextRetry?: string
}

export async function sendPaymentFailedEmail({
  to,
  orgName,
  amount,
  nextRetry,
}: SendPaymentFailedEmailParams): Promise<EmailResult> {
  const content = `
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">
      Payment failed for ${orgName}
    </h1>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.5;">
      We couldn't process your payment of <strong>${amount}</strong>. Please update your payment method to avoid service interruption.
    </p>
    ${nextRetry ? `
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.5;">
      We'll automatically retry on ${nextRetry}.
    </p>
    ` : ''}
    <a href="${APP_URL}/billing" style="${buttonStyle}">
      Update Payment Method
    </a>
    <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
      If you believe this is an error, please contact support.
    </p>
  `

  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Action required: Payment failed for ${orgName}`,
      html: emailTemplate(content),
    })
    return { success: true }
  } catch (err: any) {
    console.error('Failed to send payment failed email:', err.message)
    return { success: false, error: err.message }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Payout Processed Email (for creators)
// ════════════════════════════════════════════════════════════════════════════

interface SendPayoutProcessedEmailParams {
  to: string
  creatorName: string
  amount: string
  payoutMethod: string
  arrivalDate?: string
}

export async function sendPayoutProcessedEmail({
  to,
  creatorName,
  amount,
  payoutMethod,
  arrivalDate,
}: SendPayoutProcessedEmailParams): Promise<EmailResult> {
  const content = `
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">
      Payout sent!
    </h1>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.5;">
      Hi ${creatorName}, we've sent your payout of <strong>${amount}</strong> via ${payoutMethod}.
    </p>
    ${arrivalDate ? `
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.5;">
      Expected arrival: <strong>${arrivalDate}</strong>
    </p>
    ` : ''}
    <p style="margin:0 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
      If you have questions about this payout, please contact the platform administrator.
    </p>
  `

  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Your payout of ${amount} is on the way`,
      html: emailTemplate(content),
    })
    return { success: true }
  } catch (err: any) {
    console.error('Failed to send payout processed email:', err.message)
    return { success: false, error: err.message }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Security Alert Email
// ════════════════════════════════════════════════════════════════════════════

interface SendSecurityAlertEmailParams {
  to: string
  alertType: 'new_login' | 'password_changed' | 'api_key_created'
  details: string
  ipAddress?: string
  timestamp: string
}

export async function sendSecurityAlertEmail({
  to,
  alertType,
  details,
  ipAddress,
  timestamp,
}: SendSecurityAlertEmailParams): Promise<EmailResult> {
  const titles: Record<string, string> = {
    new_login: 'New login to your account',
    password_changed: 'Your password was changed',
    api_key_created: 'New API key created',
  }

  const content = `
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">
      ${titles[alertType]}
    </h1>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.5;">
      ${details}
    </p>
    <div style="margin:0 0 24px;padding:16px;background-color:#f9fafb;border-radius:6px;font-size:13px;color:#6b7280;">
      <p style="margin:0 0 4px;">Time: ${timestamp}</p>
      ${ipAddress ? `<p style="margin:0;">IP Address: ${ipAddress}</p>` : ''}
    </div>
    <p style="margin:0 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
      If this wasn't you, please <a href="${APP_URL}/settings/security" style="color:#dc2626;">secure your account</a> immediately.
    </p>
  `

  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Security alert: ${titles[alertType]}`,
      html: emailTemplate(content),
    })
    return { success: true }
  } catch (err: any) {
    console.error('Failed to send security alert email:', err.message)
    return { success: false, error: err.message }
  }
}
