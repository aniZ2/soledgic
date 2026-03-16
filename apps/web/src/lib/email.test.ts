import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock Resend
const mockSend = vi.fn()
vi.mock('resend', () => {
  return {
    Resend: class MockResend {
      emails = { send: mockSend }
    },
  }
})

import {
  sendTeamInviteEmail,
  sendWelcomeEmail,
  sendBillingReminderEmail,
  sendPaymentFailedEmail,
  sendPayoutProcessedEmail,
  sendSecurityAlertEmail,
} from './email'

beforeEach(() => {
  mockSend.mockReset()
  mockSend.mockResolvedValue({ id: 'email-123' })
})

describe('sendTeamInviteEmail', () => {
  it('sends with correct subject and returns success', async () => {
    const result = await sendTeamInviteEmail({
      to: 'user@example.com',
      orgName: 'Acme Corp',
      inviterName: 'Jane Doe',
      role: 'admin',
      token: 'invite-token-123',
    })

    expect(result).toEqual({ success: true })
    expect(mockSend).toHaveBeenCalledOnce()
    const call = mockSend.mock.calls[0][0]
    expect(call.to).toBe('user@example.com')
    expect(call.subject).toContain('Jane Doe')
    expect(call.subject).toContain('Acme Corp')
    expect(call.html).toContain('invite-token-123')
  })

  it('escapes HTML in org name and inviter name', async () => {
    await sendTeamInviteEmail({
      to: 'user@example.com',
      orgName: '<script>alert("xss")</script>',
      inviterName: 'A & B',
      role: 'admin',
      token: 'token',
    })

    const html = mockSend.mock.calls[0][0].html
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('A &amp; B')
  })

  it('returns error on send failure', async () => {
    mockSend.mockRejectedValueOnce(new Error('Rate limited'))
    const result = await sendTeamInviteEmail({
      to: 'user@example.com',
      orgName: 'Org',
      inviterName: 'Jane',
      role: 'member',
      token: 'tok',
    })

    expect(result).toEqual({ success: false, error: 'Rate limited' })
  })

  it('returns generic error for non-Error throws', async () => {
    mockSend.mockRejectedValueOnce('string error')
    const result = await sendTeamInviteEmail({
      to: 'user@example.com',
      orgName: 'Org',
      inviterName: 'Jane',
      role: 'member',
      token: 'tok',
    })

    expect(result).toEqual({ success: false, error: 'Unknown email error' })
  })
})

describe('sendWelcomeEmail', () => {
  it('sends welcome email with escaped name', async () => {
    const result = await sendWelcomeEmail({
      to: 'user@example.com',
      name: 'John "Doe"',
    })

    expect(result).toEqual({ success: true })
    const call = mockSend.mock.calls[0][0]
    expect(call.subject).toBe('Welcome to Soledgic')
    expect(call.html).toContain('John &quot;Doe&quot;')
  })
})

describe('sendBillingReminderEmail', () => {
  it('pluralizes "days" correctly for multiple days', async () => {
    await sendBillingReminderEmail({
      to: 'user@example.com',
      orgName: 'Org',
      daysLeft: 7,
    })

    const html = mockSend.mock.calls[0][0].html
    expect(html).toContain('7 days')
  })

  it('uses singular "day" for 1 day', async () => {
    await sendBillingReminderEmail({
      to: 'user@example.com',
      orgName: 'Org',
      daysLeft: 1,
    })

    const html = mockSend.mock.calls[0][0].html
    expect(html).toContain('1 day')
    expect(html).not.toContain('1 days')
  })
})

describe('sendPaymentFailedEmail', () => {
  it('includes amount and next retry date when provided', async () => {
    await sendPaymentFailedEmail({
      to: 'user@example.com',
      orgName: 'Org',
      amount: '$50.00',
      nextRetry: 'March 20, 2026',
    })

    const html = mockSend.mock.calls[0][0].html
    expect(html).toContain('$50.00')
    expect(html).toContain('March 20, 2026')
  })

  it('omits next retry section when not provided', async () => {
    await sendPaymentFailedEmail({
      to: 'user@example.com',
      orgName: 'Org',
      amount: '$50.00',
    })

    const html = mockSend.mock.calls[0][0].html
    expect(html).not.toContain('automatically retry')
  })
})

describe('sendPayoutProcessedEmail', () => {
  it('includes arrival date when provided', async () => {
    await sendPayoutProcessedEmail({
      to: 'creator@example.com',
      creatorName: 'Alice',
      amount: '$100.00',
      payoutMethod: 'ACH',
      arrivalDate: 'March 25, 2026',
    })

    const html = mockSend.mock.calls[0][0].html
    expect(html).toContain('March 25, 2026')
    expect(html).toContain('Alice')
    expect(html).toContain('ACH')
  })

  it('omits arrival date section when not provided', async () => {
    await sendPayoutProcessedEmail({
      to: 'creator@example.com',
      creatorName: 'Bob',
      amount: '$50.00',
      payoutMethod: 'ACH',
    })

    const html = mockSend.mock.calls[0][0].html
    expect(html).not.toContain('Expected arrival')
  })
})

describe('sendSecurityAlertEmail', () => {
  it('sends with correct title for new_login', async () => {
    await sendSecurityAlertEmail({
      to: 'user@example.com',
      alertType: 'new_login',
      details: 'Login from Chrome on macOS',
      ipAddress: '1.2.3.4',
      timestamp: '2026-03-16T12:00:00Z',
    })

    const call = mockSend.mock.calls[0][0]
    expect(call.subject).toContain('New login to your account')
    expect(call.html).toContain('1.2.3.4')
  })

  it('handles password_changed alert type', async () => {
    await sendSecurityAlertEmail({
      to: 'user@example.com',
      alertType: 'password_changed',
      details: 'Password was changed',
      timestamp: '2026-03-16T12:00:00Z',
    })

    const html = mockSend.mock.calls[0][0].html
    expect(html).toContain('Your password was changed')
  })

  it('handles api_key_created alert type', async () => {
    await sendSecurityAlertEmail({
      to: 'user@example.com',
      alertType: 'api_key_created',
      details: 'New API key was created',
      timestamp: '2026-03-16T12:00:00Z',
    })

    const html = mockSend.mock.calls[0][0].html
    expect(html).toContain('New API key created')
  })

  it('omits IP address when not provided', async () => {
    await sendSecurityAlertEmail({
      to: 'user@example.com',
      alertType: 'new_login',
      details: 'Login',
      timestamp: '2026-03-16T12:00:00Z',
    })

    const html = mockSend.mock.calls[0][0].html
    expect(html).not.toContain('IP Address')
  })
})
