// Soledgic Auto-Email Service
// Sends monthly creator statements automatically after period close
// Triggered by: cron job on 1st of month, or manually via API
// SECURITY HARDENED VERSION

import { 
  createHandler,
  getCorsHeaders,
  getSupabaseClient,
  validateApiKey,
  jsonResponse,
  errorResponse,
  validateId,
  getClientIp,
  LedgerContext
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface EmailRequest {
  action: 'send_monthly_statements' | 'send_single_statement' | 'preview' | 'get_queue' | 'configure'
  ledger_id?: string
  creator_id?: string
  year?: number
  month?: number
  email_config?: EmailConfig
}

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

interface StatementEmail {
  to: string
  to_name: string
  subject: string
  body: string
  pdf_base64: string
  pdf_filename: string
}

interface EmailProvider {
  send(email: StatementEmail): Promise<{ success: boolean; messageId?: string; error?: string }>
}

class SendGridProvider implements EmailProvider {
  constructor(private apiKey: string, private fromEmail: string, private fromName: string) {}

  async send(email: StatementEmail) {
    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: email.to, name: email.to_name }] }],
          from: { email: this.fromEmail, name: this.fromName },
          subject: email.subject,
          content: [{ type: 'text/plain', value: email.body }, { type: 'text/html', value: email.body.replace(/\n/g, '<br>') }],
          attachments: [{ content: email.pdf_base64, filename: email.pdf_filename, type: 'application/pdf', disposition: 'attachment' }],
        }),
      })
      return response.ok ? { success: true, messageId: response.headers.get('x-message-id') || undefined } : { success: false, error: await response.text() }
    } catch (err: any) { return { success: false, error: err.message } }
  }
}

class ResendProvider implements EmailProvider {
  constructor(private apiKey: string, private fromEmail: string) {}

  async send(email: StatementEmail) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: this.fromEmail, to: email.to, subject: email.subject, text: email.body, attachments: [{ content: email.pdf_base64, filename: email.pdf_filename }] }),
      })
      const data = await response.json()
      return response.ok ? { success: true, messageId: data.id } : { success: false, error: data.message }
    } catch (err: any) { return { success: false, error: err.message } }
  }
}

class ConsoleProvider implements EmailProvider {
  async send(email: StatementEmail) {
    console.log(`EMAIL: To ${email.to_name} <${email.to}>, Subject: ${email.subject}`)
    return { success: true, messageId: `console_${Date.now()}` }
  }
}

function getEmailProvider(config: any): EmailProvider {
  const provider = Deno.env.get('EMAIL_PROVIDER') || 'console'
  switch (provider) {
    case 'sendgrid': return new SendGridProvider(Deno.env.get('SENDGRID_API_KEY')!, config.from_email || Deno.env.get('FROM_EMAIL')!, config.from_name || 'Soledgic')
    case 'resend': return new ResendProvider(Deno.env.get('RESEND_API_KEY')!, config.from_email || Deno.env.get('FROM_EMAIL')!)
    default: return new ConsoleProvider()
  }
}

function formatTemplate(template: string, vars: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(vars)) result = result.replace(new RegExp(`{{${key}}}`, 'g'), value)
  return result
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const VALID_ACTIONS = ['send_monthly_statements', 'send_single_statement', 'preview', 'get_queue', 'configure']

const handler = createHandler(
  { endpoint: 'send-statements', requireAuth: true, rateLimit: true },
  async (req: Request, supabase: SupabaseClient, ledger: LedgerContext | null, body: EmailRequest) => {
    // Also allow cron jobs
    const isCron = req.headers.get('x-cron-secret') === Deno.env.get('CRON_SECRET')
    
    if (!ledger && !isCron) {
      return errorResponse('Unauthorized', 401, req)
    }

    if (!body.action || !VALID_ACTIONS.includes(body.action)) {
      return errorResponse(`Invalid action: must be one of ${VALID_ACTIONS.join(', ')}`, 400, req)
    }

    let ledgerId: string | undefined = ledger?.id || (body.ledger_id ? validateId(body.ledger_id, 100) || undefined : undefined)

    switch (body.action) {
      case 'configure': {
        if (!ledgerId || !body.email_config) {
          return errorResponse('ledger_id and email_config required', 400, req)
        }

        const { error } = await supabase
          .from('ledgers')
          .update({ email_config: body.email_config, updated_at: new Date().toISOString() })
          .eq('id', ledgerId)
        if (error) return errorResponse(error.message, 500, req)

        return jsonResponse({ success: true, message: 'Email configuration saved' }, 200, req)
      }

      case 'send_monthly_statements': {
        const now = new Date()
        const year = body.year || (now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear())
        const month = body.month || (now.getMonth() === 0 ? 12 : now.getMonth())

        let query = supabase.from('ledgers').select('id, business_name, email_config')
        if (ledgerId) query = query.eq('id', ledgerId)
        else query = query.not('email_config', 'is', null)

        const { data: ledgers } = await query
        if (!ledgers?.length) return errorResponse('No ledgers with email config found', 400, req)

        const results: any[] = []

        for (const ledgerItem of ledgers) {
          const config = ledgerItem.email_config as EmailConfig
          if (!config?.enabled) continue

          const { data: creators } = await supabase
            .from('accounts')
            .select('id, entity_id, name, metadata')
            .eq('ledger_id', ledgerItem.id)
            .eq('account_type', 'creator_balance')
          if (!creators?.length) { 
            results.push({ ledger_id: ledgerItem.id, status: 'skipped', reason: 'No creators' })
            continue 
          }

          const emailProvider = getEmailProvider(config)
          const startDate = `${year}-${String(month).padStart(2, '0')}-01`
          const endDate = new Date(year, month, 0).toISOString().split('T')[0]

          for (const creator of creators) {
            const creatorEmail = creator.metadata?.email
            if (!creatorEmail) { 
              results.push({ ledger_id: ledgerItem.id, creator_id: creator.entity_id, status: 'skipped', reason: 'No email' })
              continue 
            }

            const pdfResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-pdf`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
              body: JSON.stringify({ report_type: 'creator_statement', creator_id: creator.entity_id, start_date: startDate, end_date: endDate, ledger_id: ledgerItem.id }),
            })
            const pdfData = await pdfResponse.json()
            if (!pdfData.success) { 
              results.push({ ledger_id: ledgerItem.id, creator_id: creator.entity_id, status: 'error', error: 'PDF failed' })
              continue 
            }

            const templateVars = { 
              creator_name: creator.name, 
              month: MONTH_NAMES[month - 1], 
              year: String(year), 
              business_name: ledgerItem.business_name || 'Platform' 
            }
            const email: StatementEmail = {
              to: creatorEmail, 
              to_name: creator.name,
              subject: formatTemplate(config.subject_template || 'Your {{month}} {{year}} Earnings Statement', templateVars),
              body: formatTemplate(config.body_template || `Hi {{creator_name}},\n\nPlease find attached your earnings statement for {{month}} {{year}}.\n\nBest,\n{{business_name}}`, templateVars),
              pdf_base64: pdfData.data, 
              pdf_filename: pdfData.filename,
            }

            const sendResult = await emailProvider.send(email)
            supabase.from('email_log').insert({ 
              ledger_id: ledgerItem.id, 
              creator_id: creator.entity_id, 
              email_type: 'monthly_statement', 
              recipient_email: creatorEmail, 
              subject: email.subject, 
              status: sendResult.success ? 'sent' : 'failed', 
              message_id: sendResult.messageId, 
              error: sendResult.error, 
              period_year: year, 
              period_month: month 
            }).then(() => {}).catch(() => {})
            
            results.push({ 
              ledger_id: ledgerItem.id, 
              creator_id: creator.entity_id, 
              email: creatorEmail, 
              status: sendResult.success ? 'sent' : 'failed', 
              message_id: sendResult.messageId, 
              error: sendResult.error 
            })
          }
        }

        return jsonResponse({ 
          success: true, 
          summary: { 
            sent: results.filter(r => r.status === 'sent').length, 
            failed: results.filter(r => r.status === 'failed').length, 
            skipped: results.filter(r => r.status === 'skipped').length 
          }, 
          results 
        }, 200, req)
      }

      case 'send_single_statement': {
        if (!ledgerId) return errorResponse('ledger_id required', 400, req)
        const creatorId = body.creator_id ? validateId(body.creator_id, 100) : null
        if (!creatorId) return errorResponse('Invalid creator_id', 400, req)

        const now = new Date()
        const year = body.year || now.getFullYear()
        const month = body.month || now.getMonth() + 1

        const { data: ledgerData } = await supabase
          .from('ledgers')
          .select('id, business_name, email_config')
          .eq('id', ledgerId)
          .single()
        if (!ledgerData) return errorResponse('Ledger not found', 404, req)

        const { data: creator } = await supabase
          .from('accounts')
          .select('id, entity_id, name, metadata')
          .eq('ledger_id', ledgerId)
          .eq('entity_id', creatorId)
          .eq('account_type', 'creator_balance')
          .single()
        if (!creator) return errorResponse('Creator not found', 404, req)

        const creatorEmail = creator.metadata?.email
        if (!creatorEmail) return errorResponse('Creator has no email on file', 400, req)

        const config = (ledgerData.email_config as EmailConfig) || {}
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`
        const endDate = new Date(year, month, 0).toISOString().split('T')[0]

        const pdfResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-pdf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
          body: JSON.stringify({ report_type: 'creator_statement', creator_id: creatorId, start_date: startDate, end_date: endDate, ledger_id: ledgerId }),
        })
        const pdfData = await pdfResponse.json()
        if (!pdfData.success) return errorResponse('Failed to generate PDF', 500, req)

        const templateVars = { 
          creator_name: creator.name, 
          month: MONTH_NAMES[month - 1], 
          year: String(year), 
          business_name: ledgerData.business_name || 'Platform' 
        }
        const emailProvider = getEmailProvider(config)
        const email: StatementEmail = {
          to: creatorEmail, 
          to_name: creator.name,
          subject: formatTemplate(config.subject_template || 'Your {{month}} {{year}} Earnings Statement', templateVars),
          body: formatTemplate(config.body_template || `Hi {{creator_name}},\n\nPlease find attached your earnings statement.\n\nBest,\n{{business_name}}`, templateVars),
          pdf_base64: pdfData.data, 
          pdf_filename: pdfData.filename,
        }

        const sendResult = await emailProvider.send(email)
        supabase.from('email_log').insert({ 
          ledger_id: ledgerId, 
          creator_id: creatorId, 
          email_type: 'manual_statement', 
          recipient_email: creatorEmail, 
          subject: email.subject, 
          status: sendResult.success ? 'sent' : 'failed', 
          message_id: sendResult.messageId, 
          error: sendResult.error, 
          period_year: year, 
          period_month: month 
        }).then(() => {}).catch(() => {})

        return jsonResponse({ 
          success: sendResult.success, 
          message_id: sendResult.messageId, 
          error: sendResult.error 
        }, sendResult.success ? 200 : 500, req)
      }

      case 'preview': {
        if (!ledgerId) return errorResponse('ledger_id required', 400, req)
        const creatorId = body.creator_id ? validateId(body.creator_id, 100) : null
        if (!creatorId) return errorResponse('Invalid creator_id', 400, req)

        const now = new Date()
        const year = body.year || now.getFullYear()
        const month = body.month || now.getMonth() + 1

        const { data: ledgerData } = await supabase
          .from('ledgers')
          .select('id, business_name, email_config')
          .eq('id', ledgerId)
          .single()
        const { data: creator } = await supabase
          .from('accounts')
          .select('id, entity_id, name, metadata')
          .eq('ledger_id', ledgerId)
          .eq('entity_id', creatorId)
          .single()

        if (!ledgerData || !creator) return errorResponse('Ledger or creator not found', 404, req)

        const config = (ledgerData.email_config as EmailConfig) || {}
        const templateVars = { 
          creator_name: creator.name, 
          month: MONTH_NAMES[month - 1], 
          year: String(year), 
          business_name: ledgerData.business_name || 'Platform' 
        }

        return jsonResponse({
          success: true,
          preview: {
            to: creator.metadata?.email || '(no email)',
            to_name: creator.name,
            subject: formatTemplate(config.subject_template || 'Your {{month}} {{year}} Earnings Statement', templateVars),
            body: formatTemplate(config.body_template || `Hi {{creator_name}},\n\nPlease find attached your earnings statement.\n\nBest,\n{{business_name}}`, templateVars),
          }
        }, 200, req)
      }

      case 'get_queue': {
        if (!ledgerId) return errorResponse('ledger_id required', 400, req)

        const { data: logs } = await supabase
          .from('email_log')
          .select('*')
          .eq('ledger_id', ledgerId)
          .order('created_at', { ascending: false })
          .limit(100)
        return jsonResponse({ success: true, emails: logs || [] }, 200, req)
      }

      default:
        return errorResponse(`Unknown action: ${body.action}`, 400, req)
    }
  }
)

Deno.serve(handler)
