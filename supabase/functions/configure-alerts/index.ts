// Soledgic Edge Function: Configure Alerts
// POST /configure-alerts
//
// Manage alert configurations (Slack, email, webhook)
// for breach risk and other Shadow Ledger events

import {
  createHandler,
  jsonResponse,
  errorResponse,
  validateUrl,
  validateString,
  LedgerContext,
  getClientIp
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface ConfigureAlertsRequest {
  action: 'list' | 'create' | 'update' | 'delete' | 'test'
  config_id?: string

  // For create/update
  alert_type?: 'breach_risk' | 'projection_created' | 'instrument_invalidated'
  channel?: 'slack' | 'email' | 'webhook'
  config?: {
    webhook_url?: string  // For Slack
    channel?: string      // Slack channel name (optional)
    recipients?: string[] // For email
  }
  thresholds?: {
    coverage_ratio_below?: number  // Trigger when coverage drops below (default 0.5 = 50%)
    shortfall_above?: number       // Trigger when shortfall exceeds (default 0)
  }
  is_active?: boolean
}

// Validate Slack webhook URL format
function isValidSlackWebhook(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.hostname === 'hooks.slack.com' && parsed.pathname.startsWith('/services/')
  } catch {
    return false
  }
}

const handler = createHandler(
  { endpoint: 'configure-alerts', requireAuth: true, rateLimit: true },
  async (
    req: Request,
    supabase: SupabaseClient,
    ledger: LedgerContext | null,
    body: ConfigureAlertsRequest,
    context: { requestId: string }
  ) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, context.requestId)
    }

    switch (body.action) {
      case 'list': {
        const { data: configs, error } = await supabase
          .from('alert_configurations')
          .select('id, alert_type, channel, config, thresholds, is_active, last_triggered_at, trigger_count, created_at')
          .eq('ledger_id', ledger.id)
          .order('created_at', { ascending: false })

        if (error) {
          return errorResponse('Failed to fetch configurations', 500, req, context.requestId)
        }

        // Mask webhook URLs for security
        const maskedConfigs = configs?.map(c => ({
          ...c,
          config: {
            ...c.config,
            webhook_url: c.config?.webhook_url
              ? c.config.webhook_url.substring(0, 40) + '...'
              : undefined
          }
        }))

        return jsonResponse({
          success: true,
          data: maskedConfigs || []
        }, 200, req, context.requestId)
      }

      case 'create': {
        if (!body.alert_type || !body.channel) {
          return errorResponse('alert_type and channel are required', 400, req, context.requestId)
        }

        // Validate channel-specific config
        if (body.channel === 'slack') {
          if (!body.config?.webhook_url) {
            return errorResponse('Slack webhook_url is required', 400, req, context.requestId)
          }
          if (!isValidSlackWebhook(body.config.webhook_url)) {
            return errorResponse('Invalid Slack webhook URL. Must be hooks.slack.com/services/...', 400, req, context.requestId)
          }
        }

        if (body.channel === 'email') {
          if (!body.config?.recipients || body.config.recipients.length === 0) {
            return errorResponse('Email recipients are required', 400, req, context.requestId)
          }
        }

        // Validate thresholds
        const thresholds = body.thresholds || {}
        if (thresholds.coverage_ratio_below !== undefined) {
          if (thresholds.coverage_ratio_below < 0 || thresholds.coverage_ratio_below > 1) {
            return errorResponse('coverage_ratio_below must be between 0 and 1', 400, req, context.requestId)
          }
        }

        const { data: config, error } = await supabase
          .from('alert_configurations')
          .insert({
            ledger_id: ledger.id,
            alert_type: body.alert_type,
            channel: body.channel,
            config: body.config || {},
            thresholds: thresholds,
            is_active: body.is_active ?? true
          })
          .select('id, alert_type, channel, thresholds, is_active, created_at')
          .single()

        if (error) {
          if (error.code === '23505') {
            return errorResponse('Alert configuration already exists for this type/channel', 409, req, context.requestId)
          }
          console.error(`[${context.requestId}] Failed to create config:`, error.message)
          return errorResponse('Failed to create configuration', 500, req, context.requestId)
        }

        // Audit log
        await supabase.from('audit_log').insert({
          ledger_id: ledger.id,
          action: 'alert_config_created',
          entity_type: 'alert_configuration',
          entity_id: config.id,
          actor_type: 'api',
          ip_address: getClientIp(req),
          request_body: {
            alert_type: body.alert_type,
            channel: body.channel,
            thresholds
          }
        })

        return jsonResponse({
          success: true,
          message: 'Alert configuration created',
          data: config
        }, 201, req, context.requestId)
      }

      case 'update': {
        if (!body.config_id) {
          return errorResponse('config_id is required', 400, req, context.requestId)
        }

        const updates: Record<string, any> = { updated_at: new Date().toISOString() }

        if (body.config) {
          // Validate Slack webhook if updating
          if (body.config.webhook_url && !isValidSlackWebhook(body.config.webhook_url)) {
            return errorResponse('Invalid Slack webhook URL', 400, req, context.requestId)
          }
          updates.config = body.config
        }

        if (body.thresholds) {
          if (body.thresholds.coverage_ratio_below !== undefined) {
            if (body.thresholds.coverage_ratio_below < 0 || body.thresholds.coverage_ratio_below > 1) {
              return errorResponse('coverage_ratio_below must be between 0 and 1', 400, req, context.requestId)
            }
          }
          updates.thresholds = body.thresholds
        }

        if (body.is_active !== undefined) {
          updates.is_active = body.is_active
        }

        const { data: config, error } = await supabase
          .from('alert_configurations')
          .update(updates)
          .eq('id', body.config_id)
          .eq('ledger_id', ledger.id)
          .select('id, alert_type, channel, thresholds, is_active')
          .single()

        if (error) {
          return errorResponse('Failed to update configuration', 500, req, context.requestId)
        }

        return jsonResponse({
          success: true,
          message: 'Alert configuration updated',
          data: config
        }, 200, req, context.requestId)
      }

      case 'delete': {
        if (!body.config_id) {
          return errorResponse('config_id is required', 400, req, context.requestId)
        }

        const { error } = await supabase
          .from('alert_configurations')
          .delete()
          .eq('id', body.config_id)
          .eq('ledger_id', ledger.id)

        if (error) {
          return errorResponse('Failed to delete configuration', 500, req, context.requestId)
        }

        // Audit log
        await supabase.from('audit_log').insert({
          ledger_id: ledger.id,
          action: 'alert_config_deleted',
          entity_type: 'alert_configuration',
          entity_id: body.config_id,
          actor_type: 'api',
          ip_address: getClientIp(req)
        })

        return jsonResponse({
          success: true,
          message: 'Alert configuration deleted'
        }, 200, req, context.requestId)
      }

      case 'test': {
        if (!body.config_id) {
          return errorResponse('config_id is required', 400, req, context.requestId)
        }

        // Get the config
        const { data: config, error } = await supabase
          .from('alert_configurations')
          .select('id, channel, config')
          .eq('id', body.config_id)
          .eq('ledger_id', ledger.id)
          .single()

        if (error || !config) {
          return errorResponse('Configuration not found', 404, req, context.requestId)
        }

        // Test Slack webhook
        if (config.channel === 'slack' && config.config?.webhook_url) {
          const testMessage = {
            blocks: [
              {
                type: 'header',
                text: {
                  type: 'plain_text',
                  text: '✅ Soledgic Alert Test',
                  emoji: true
                }
              },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `This is a test alert from *${ledger.name || 'your ledger'}*.\n\nYour Slack integration is working correctly!`
                }
              },
              {
                type: 'context',
                elements: [
                  {
                    type: 'mrkdwn',
                    text: `⏰ Sent at ${new Date().toISOString()}`
                  }
                ]
              }
            ]
          }

          try {
            const response = await fetch(config.config.webhook_url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(testMessage)
            })

            if (response.ok) {
              return jsonResponse({
                success: true,
                message: 'Test alert sent successfully',
                channel: 'slack'
              }, 200, req, context.requestId)
            } else {
              const errorBody = await response.text()
              return jsonResponse({
                success: false,
                message: 'Failed to send test alert',
                error: errorBody,
                status: response.status
              }, 200, req, context.requestId)
            }
          } catch (err: any) {
            return jsonResponse({
              success: false,
              message: 'Failed to send test alert',
              error: err.message
            }, 200, req, context.requestId)
          }
        }

        return errorResponse('Test not supported for this channel', 400, req, context.requestId)
      }

      default:
        return errorResponse(`Unknown action: ${body.action}`, 400, req, context.requestId)
    }
  }
)

Deno.serve(handler)
