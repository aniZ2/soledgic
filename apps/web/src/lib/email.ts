import { Resend } from 'resend'

let _resend: Resend | null = null

export function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY!)
  }
  return _resend
}

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
}: SendTeamInviteEmailParams): Promise<{ success: boolean; error?: string }> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const acceptUrl = `${appUrl}/api/invitations/accept?token=${token}`

  try {
    await getResend().emails.send({
      from: 'Soledgic <team@soledgic.com>',
      to,
      subject: `${inviterName} invited you to join ${orgName} on Soledgic`,
      html: `
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
              <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">
                You've been invited to join ${orgName}
              </h1>
              <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.5;">
                ${inviterName} has invited you to join <strong>${orgName}</strong> on Soledgic as a <strong>${role}</strong>.
              </p>
              <a href="${acceptUrl}" style="display:inline-block;padding:10px 24px;background-color:#111827;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">
                Accept Invitation
              </a>
              <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
                This invitation expires in 7 days. If you didn't expect this email, you can safely ignore it.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #f3f4f6;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                Soledgic &mdash; Creator economy infrastructure
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `.trim(),
    })

    return { success: true }
  } catch (err: any) {
    console.error('Failed to send invite email:', err.message)
    return { success: false, error: err.message }
  }
}
