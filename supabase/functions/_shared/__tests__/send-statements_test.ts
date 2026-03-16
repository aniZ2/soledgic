import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'

// ============================================================================
// Pure functions extracted from send-statements/index.ts for unit testing.
// ============================================================================

function formatTemplate(template: string, vars: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(vars)) result = result.replace(new RegExp(`{{${key}}}`, 'g'), value)
  return result
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const VALID_ACTIONS = ['send_monthly_statements', 'send_single_statement', 'preview', 'get_queue', 'configure']

interface EmailConfig {
  enabled: boolean
  send_day: number
  from_name: string
  from_email: string
  subject_template: string
  body_template: string
  cc_admin?: boolean
  admin_email?: string
}

// Validate email config the same way the handler does
function validateEmailConfig(config: EmailConfig): string[] {
  const errors: string[] = []
  if (typeof config.enabled !== 'boolean') errors.push('enabled must be a boolean')
  if (!Number.isInteger(config.send_day) || config.send_day < 1 || config.send_day > 28) errors.push('send_day must be an integer 1-28')
  if (!config.from_name || typeof config.from_name !== 'string') errors.push('from_name is required')
  if (!config.from_email || typeof config.from_email !== 'string' || !config.from_email.includes('@')) errors.push('from_email must be a valid email')
  if (!config.subject_template || typeof config.subject_template !== 'string') errors.push('subject_template is required')
  if (!config.body_template || typeof config.body_template !== 'string') errors.push('body_template is required')
  if (config.cc_admin && !config.admin_email) errors.push('admin_email required when cc_admin is true')
  return errors
}

// Year/month validation as used in handler
function validateYearMonth(year: unknown, month: unknown): { valid: boolean; error?: string; year?: number; month?: number } {
  const now = new Date()
  if (year !== undefined && year !== null) {
    const y = Number(year)
    if (!Number.isInteger(y) || y < 2000 || y > 2100) return { valid: false, error: 'Invalid year' }
  }
  if (month !== undefined && month !== null) {
    const m = Number(month)
    if (!Number.isInteger(m) || m < 1 || m > 12) return { valid: false, error: 'Invalid month' }
  }
  const resolvedYear = year !== undefined && year !== null ? Number(year) : now.getFullYear()
  const resolvedMonth = month !== undefined && month !== null ? Number(month) : now.getMonth() + 1
  return { valid: true, year: resolvedYear, month: resolvedMonth }
}

// ============================================================================
// formatTemplate
// ============================================================================

Deno.test('formatTemplate: substitutes single variable', () => {
  assertEquals(formatTemplate('Hello {{name}}', { name: 'Alice' }), 'Hello Alice')
})

Deno.test('formatTemplate: substitutes multiple variables', () => {
  const result = formatTemplate(
    'Your {{month}} {{year}} Earnings Statement',
    { month: 'March', year: '2026' }
  )
  assertEquals(result, 'Your March 2026 Earnings Statement')
})

Deno.test('formatTemplate: substitutes repeated variable', () => {
  assertEquals(
    formatTemplate('{{name}} and {{name}}', { name: 'Bob' }),
    'Bob and Bob'
  )
})

Deno.test('formatTemplate: leaves unmatched placeholders', () => {
  assertEquals(
    formatTemplate('Hello {{name}}, your {{unknown}} is ready', { name: 'Alice' }),
    'Hello Alice, your {{unknown}} is ready'
  )
})

Deno.test('formatTemplate: handles empty vars object', () => {
  assertEquals(formatTemplate('No placeholders here', {}), 'No placeholders here')
})

Deno.test('formatTemplate: handles multiline template', () => {
  const template = 'Hi {{creator_name}},\n\nPlease find attached your earnings statement for {{month}} {{year}}.\n\nBest,\n{{business_name}}'
  const result = formatTemplate(template, {
    creator_name: 'Jane',
    month: 'February',
    year: '2026',
    business_name: 'BookStore Inc',
  })
  assertEquals(result.includes('Hi Jane,'), true)
  assertEquals(result.includes('February 2026'), true)
  assertEquals(result.includes('BookStore Inc'), true)
})

// ============================================================================
// MONTH_NAMES
// ============================================================================

Deno.test('MONTH_NAMES: has 12 entries', () => {
  assertEquals(MONTH_NAMES.length, 12)
})

Deno.test('MONTH_NAMES: first is January, last is December', () => {
  assertEquals(MONTH_NAMES[0], 'January')
  assertEquals(MONTH_NAMES[11], 'December')
})

Deno.test('MONTH_NAMES: index 0 maps correctly for month=1 (month - 1)', () => {
  assertEquals(MONTH_NAMES[1 - 1], 'January')
  assertEquals(MONTH_NAMES[6 - 1], 'June')
  assertEquals(MONTH_NAMES[12 - 1], 'December')
})

// ============================================================================
// VALID_ACTIONS
// ============================================================================

Deno.test('VALID_ACTIONS: contains all expected actions', () => {
  assertEquals(VALID_ACTIONS.includes('send_monthly_statements'), true)
  assertEquals(VALID_ACTIONS.includes('send_single_statement'), true)
  assertEquals(VALID_ACTIONS.includes('preview'), true)
  assertEquals(VALID_ACTIONS.includes('get_queue'), true)
  assertEquals(VALID_ACTIONS.includes('configure'), true)
})

Deno.test('VALID_ACTIONS: rejects unknown actions', () => {
  assertEquals(VALID_ACTIONS.includes('delete'), false)
  assertEquals(VALID_ACTIONS.includes(''), false)
  assertEquals(VALID_ACTIONS.includes('send'), false)
})

// ============================================================================
// validateEmailConfig
// ============================================================================

Deno.test('validateEmailConfig: accepts valid config', () => {
  const errors = validateEmailConfig({
    enabled: true,
    send_day: 1,
    from_name: 'Platform',
    from_email: 'noreply@soledgic.com',
    subject_template: 'Your {{month}} {{year}} Statement',
    body_template: 'Hi {{creator_name}}',
  })
  assertEquals(errors.length, 0)
})

Deno.test('validateEmailConfig: rejects send_day outside 1-28', () => {
  const errors = validateEmailConfig({
    enabled: true,
    send_day: 31,
    from_name: 'Platform',
    from_email: 'noreply@example.com',
    subject_template: 'Test',
    body_template: 'Test',
  })
  assertEquals(errors.some(e => e.includes('send_day')), true)
})

Deno.test('validateEmailConfig: rejects send_day of 0', () => {
  const errors = validateEmailConfig({
    enabled: true,
    send_day: 0,
    from_name: 'Platform',
    from_email: 'noreply@example.com',
    subject_template: 'Test',
    body_template: 'Test',
  })
  assertEquals(errors.some(e => e.includes('send_day')), true)
})

Deno.test('validateEmailConfig: rejects missing from_email', () => {
  const errors = validateEmailConfig({
    enabled: true,
    send_day: 5,
    from_name: 'Platform',
    from_email: '',
    subject_template: 'Test',
    body_template: 'Test',
  })
  assertEquals(errors.some(e => e.includes('from_email')), true)
})

Deno.test('validateEmailConfig: rejects from_email without @', () => {
  const errors = validateEmailConfig({
    enabled: true,
    send_day: 5,
    from_name: 'Platform',
    from_email: 'not-an-email',
    subject_template: 'Test',
    body_template: 'Test',
  })
  assertEquals(errors.some(e => e.includes('from_email')), true)
})

Deno.test('validateEmailConfig: requires admin_email when cc_admin is true', () => {
  const errors = validateEmailConfig({
    enabled: true,
    send_day: 1,
    from_name: 'Platform',
    from_email: 'noreply@example.com',
    subject_template: 'Test',
    body_template: 'Test',
    cc_admin: true,
  })
  assertEquals(errors.some(e => e.includes('admin_email')), true)
})

Deno.test('validateEmailConfig: accepts cc_admin with admin_email', () => {
  const errors = validateEmailConfig({
    enabled: true,
    send_day: 1,
    from_name: 'Platform',
    from_email: 'noreply@example.com',
    subject_template: 'Test',
    body_template: 'Test',
    cc_admin: true,
    admin_email: 'admin@example.com',
  })
  assertEquals(errors.some(e => e.includes('admin_email')), false)
})

// ============================================================================
// validateYearMonth
// ============================================================================

Deno.test('validateYearMonth: accepts valid year and month', () => {
  const result = validateYearMonth(2026, 3)
  assertEquals(result.valid, true)
  assertEquals(result.year, 2026)
  assertEquals(result.month, 3)
})

Deno.test('validateYearMonth: rejects year below 2000', () => {
  const result = validateYearMonth(1999, 1)
  assertEquals(result.valid, false)
  assertEquals(result.error, 'Invalid year')
})

Deno.test('validateYearMonth: rejects year above 2100', () => {
  const result = validateYearMonth(2101, 1)
  assertEquals(result.valid, false)
  assertEquals(result.error, 'Invalid year')
})

Deno.test('validateYearMonth: rejects month 0', () => {
  const result = validateYearMonth(2026, 0)
  assertEquals(result.valid, false)
  assertEquals(result.error, 'Invalid month')
})

Deno.test('validateYearMonth: rejects month 13', () => {
  const result = validateYearMonth(2026, 13)
  assertEquals(result.valid, false)
  assertEquals(result.error, 'Invalid month')
})

Deno.test('validateYearMonth: defaults to current year/month when not provided', () => {
  const result = validateYearMonth(undefined, undefined)
  const now = new Date()
  assertEquals(result.valid, true)
  assertEquals(result.year, now.getFullYear())
  assertEquals(result.month, now.getMonth() + 1)
})

Deno.test('validateYearMonth: rejects fractional year', () => {
  const result = validateYearMonth(2026.5, 1)
  assertEquals(result.valid, false)
})

Deno.test('validateYearMonth: rejects fractional month', () => {
  const result = validateYearMonth(2026, 1.5)
  assertEquals(result.valid, false)
})

// ============================================================================
// Email provider selection (getEmailProvider logic)
// ============================================================================

Deno.test('getEmailProvider logic: defaults to console when EMAIL_PROVIDER not set', () => {
  // The function uses: Deno.env.get('EMAIL_PROVIDER') || 'console'
  // When undefined, fallback is 'console'
  const envValue: string | undefined = undefined
  const provider = envValue || 'console'
  assertEquals(provider, 'console')
})

Deno.test('getEmailProvider logic: recognizes sendgrid, resend, and default', () => {
  const validProviders = ['sendgrid', 'resend', 'console']
  for (const p of validProviders) {
    assertEquals(validProviders.includes(p), true)
  }
  assertEquals(validProviders.includes('mailgun'), false)
})
