// Soledgic Edge Function: Health Check
// POST /health-check
// Run ledger health checks manually or via cron
// SECURITY HARDENED VERSION v2 - Uses createHandler

import { 
  createHandler,
  jsonResponse,
  errorResponse,
  validateId,
  validateApiKey,
  LedgerContext,
  timingSafeEqual,
  getSupabaseClient,
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface HealthCheckRequest {
  action: 'run' | 'status' | 'history' | 'run_all'
  ledger_id?: string
}

const handler = createHandler(
  { endpoint: 'health-check', requireAuth: false, rateLimit: true },
  async (req: Request, supabase: SupabaseClient, _ledger: LedgerContext | null, body: HealthCheckRequest, context) => {
    // Check for cron secret (for scheduled runs)
    const cronSecret = req.headers.get('x-cron-secret')
    const expectedSecret = Deno.env.get('CRON_SECRET')
    const isCronJob = cronSecret && expectedSecret && timingSafeEqual(cronSecret, expectedSecret)

    // Manually validate API key since requireAuth is false
    const apiKey = req.headers.get('x-api-key')
    let ledger: LedgerContext | null = null
    
    if (apiKey) {
      ledger = await validateApiKey(supabase, apiKey, context.requestId)
    }

    // Must have either valid API key or cron secret
    if (!ledger && !isCronJob) {
      return errorResponse('Unauthorized', 401, req, context.requestId)
    }

    const action = body?.action || 'status'

    switch (action) {
      case 'run': {
        const targetLedger = body?.ledger_id ? validateId(body.ledger_id, 100) : ledger?.id
        
        if (!targetLedger) {
          return errorResponse('No ledger specified', 400, req, context.requestId)
        }

        const { data, error } = await supabase.rpc('run_ledger_health_check', {
          p_ledger_id: targetLedger
        })

        if (error) {
          console.error(`[${context.requestId}] Health check error:`, error)
          return errorResponse('Health check failed', 500, req, context.requestId)
        }

        // If critical, send alert
        if (data?.status === 'critical') {
          await sendAlert(supabase, targetLedger, data)
        }

        return jsonResponse({ success: true, data }, 200, req, context.requestId)
      }

      case 'run_all': {
        if (!isCronJob) {
          return errorResponse('Unauthorized', 403, req, context.requestId)
        }

        const { data, error } = await supabase.rpc('run_all_health_checks')
        if (error) {
          console.error(`[${context.requestId}] Run all health checks error:`, error)
          return errorResponse('Health checks failed', 500, req, context.requestId)
        }

        // Send alerts for any critical ledgers
        for (const result of data?.results || []) {
          if (result.result?.status === 'critical') {
            await sendAlert(supabase, result.ledger_id, result.result)
          }
        }

        // Log the cron run
        supabase.from('audit_log').insert({
          action: 'health_check_cron',
          entity_type: 'system',
          actor_type: 'system',
          actor_id: 'cron',
          request_id: context.requestId,
          request_body: {
            ledger_count: data?.ledger_count,
            critical_count: data?.results?.filter((r: any) => r.result?.status === 'critical').length || 0,
            warning_count: data?.results?.filter((r: any) => r.result?.status === 'warning').length || 0,
          }
        }).then(() => {}).catch(() => {})

        return jsonResponse({ success: true, data }, 200, req, context.requestId)
      }

      case 'status': {
        const targetLedger = body?.ledger_id ? validateId(body.ledger_id, 100) : ledger?.id
        if (!targetLedger) {
          return errorResponse('No ledger specified', 400, req, context.requestId)
        }

        const { data, error } = await supabase.rpc('get_quick_health_status', {
          p_ledger_id: targetLedger
        })

        if (error) {
          console.error(`[${context.requestId}] Health status error:`, error)
          return errorResponse('Failed to get status', 500, req, context.requestId)
        }
        return jsonResponse({ success: true, data }, 200, req, context.requestId)
      }

      case 'history': {
        const targetLedger = body?.ledger_id ? validateId(body.ledger_id, 100) : ledger?.id
        if (!targetLedger) {
          return errorResponse('No ledger specified', 400, req, context.requestId)
        }

        const { data: results, error } = await supabase
          .from('health_check_results')
          .select('id, check_type, run_at, status, total_checks, passed_checks, warning_checks, failed_checks')
          .eq('ledger_id', targetLedger)
          .order('run_at', { ascending: false })
          .limit(30)

        if (error) {
          console.error(`[${context.requestId}] Health history error:`, error)
          return errorResponse('Failed to get history', 500, req, context.requestId)
        }
        return jsonResponse({ success: true, data: results }, 200, req, context.requestId)
      }

      default:
        return errorResponse(`Unknown action: ${action}`, 400, req, context.requestId)
    }
  }
)

async function sendAlert(supabase: SupabaseClient, ledgerId: string, result: any) {
  const { data: ledgerData } = await supabase
    .from('ledgers')
    .select('business_name, organization_id')
    .eq('id', ledgerId)
    .single()

  if (!ledgerData) return

  const { data: org } = await supabase
    .from('organizations')
    .select('billing_email, owner_id')
    .eq('id', ledgerData.organization_id)
    .single()

  if (!org?.billing_email) return

  supabase.from('audit_log').insert({
    ledger_id: ledgerId,
    action: 'health_check_alert',
    entity_type: 'health_check',
    entity_id: result.result_id,
    actor_type: 'system',
    request_body: {
      status: result.status,
      failed_checks: result.summary?.failed,
      email_sent_to: org.billing_email,
    }
  }).then(() => {}).catch(() => {})

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (resendKey) {
    const failedChecks = result.checks
      ?.filter((c: any) => c.status === 'failed')
      ?.map((c: any) => `- ${c.description}: ${JSON.stringify(c.details)}`)
      ?.join('\n') || 'See dashboard for details'

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: Deno.env.get('FROM_EMAIL') || 'alerts@soledgic.com',
        to: org.billing_email,
        subject: `🚨 Health Check Alert: ${ledgerData.business_name}`,
        text: `Your ledger "${ledgerData.business_name}" has critical health check failures:\n\n${failedChecks}\n\nPlease review at your Soledgic dashboard.`
      })
    }).catch(console.error)
  }
}

Deno.serve(handler)
