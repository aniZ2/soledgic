// Soledgic Edge Function: Configure Risk Policy
// POST /configure-risk-policy
// Manages risk policies for the signal engine

import {
  createHandler,
  jsonResponse,
  errorResponse,
  validateString,
  validateInteger,
  LedgerContext,
  getClientIp
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface PolicyRequest {
  action: 'create' | 'list' | 'delete'
  policy_type?: 'require_instrument' | 'budget_cap' | 'projection_guard'
  config?: Record<string, any>
  severity?: 'hard' | 'soft'
  priority?: number
  policy_id?: string  // For delete
}

const handler = createHandler(
  { endpoint: 'configure-risk-policy', requireAuth: true, rateLimit: true },
  async (
    req: Request,
    supabase: SupabaseClient,
    ledger: LedgerContext | null,
    body: PolicyRequest,
    context: { requestId: string }
  ) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, context.requestId)
    }

    const action = body.action
    if (!action || !['create', 'list', 'delete'].includes(action)) {
      return errorResponse('action is required (create, list, or delete)', 400, req, context.requestId)
    }

    // LIST: Return all policies for this ledger
    if (action === 'list') {
      const { data: policies, error } = await supabase
        .from('risk_policies')
        .select('*')
        .eq('ledger_id', ledger.id)
        .order('priority', { ascending: true })

      if (error) {
        console.error('Failed to list policies:', error)
        return errorResponse('Failed to list policies', 500, req, context.requestId)
      }

      return jsonResponse({
        success: true,
        ledger_id: ledger.id,
        policies: policies || []
      }, 200, req, context.requestId)
    }

    // DELETE: Remove a policy by ID
    if (action === 'delete') {
      if (!body.policy_id) {
        return errorResponse('policy_id is required for delete', 400, req, context.requestId)
      }

      const { error } = await supabase
        .from('risk_policies')
        .delete()
        .eq('id', body.policy_id)
        .eq('ledger_id', ledger.id)

      if (error) {
        console.error('Failed to delete policy:', error)
        return errorResponse('Failed to delete policy', 500, req, context.requestId)
      }

      // Audit log
      await supabase.from('audit_log').insert({
        ledger_id: ledger.id,
        action: 'delete_risk_policy',
        entity_type: 'risk_policy',
        entity_id: body.policy_id,
        actor_type: 'api',
        ip_address: getClientIp(req)
      }).catch(() => {})

      return jsonResponse({
        success: true,
        message: 'Policy deleted'
      }, 200, req, context.requestId)
    }

    // CREATE: Add a new policy
    const policyType = body.policy_type
    if (!policyType || !['require_instrument', 'budget_cap', 'projection_guard'].includes(policyType)) {
      return errorResponse('policy_type is required (require_instrument, budget_cap, or projection_guard)', 400, req, context.requestId)
    }

    const severity = body.severity || 'hard'
    if (!['hard', 'soft'].includes(severity)) {
      return errorResponse('severity must be hard or soft', 400, req, context.requestId)
    }

    const priority = body.priority ?? 100
    const config = body.config || {}

    // Validate config based on policy type
    if (policyType === 'require_instrument') {
      if (config.threshold_amount !== undefined && typeof config.threshold_amount !== 'number') {
        return errorResponse('config.threshold_amount must be a number (cents)', 400, req, context.requestId)
      }
    } else if (policyType === 'budget_cap') {
      if (!config.cap_amount || typeof config.cap_amount !== 'number') {
        return errorResponse('config.cap_amount is required (cents)', 400, req, context.requestId)
      }
    } else if (policyType === 'projection_guard') {
      if (config.min_coverage_ratio !== undefined &&
          (typeof config.min_coverage_ratio !== 'number' || config.min_coverage_ratio < 0 || config.min_coverage_ratio > 1)) {
        return errorResponse('config.min_coverage_ratio must be between 0 and 1', 400, req, context.requestId)
      }
    }

    const { data: policy, error } = await supabase
      .from('risk_policies')
      .insert({
        ledger_id: ledger.id,
        policy_type: policyType,
        config: config,
        severity: severity,
        priority: priority,
        is_active: true
      })
      .select('*')
      .single()

    if (error) {
      console.error('Failed to create policy:', error)
      return errorResponse('Failed to create policy', 500, req, context.requestId)
    }

    // Audit log
    await supabase.from('audit_log').insert({
      ledger_id: ledger.id,
      action: 'create_risk_policy',
      entity_type: 'risk_policy',
      entity_id: policy.id,
      actor_type: 'api',
      ip_address: getClientIp(req),
      request_body: { policy_type: policyType, severity, priority }
    }).catch(() => {})

    return jsonResponse({
      success: true,
      policy: policy
    }, 200, req, context.requestId)
  }
)

Deno.serve(handler)
