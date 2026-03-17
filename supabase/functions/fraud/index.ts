// SERVICE_ID: SVC_FRAUD_ROUTER
import {
  createHandler,
  errorResponse,
  LedgerContext,
} from '../_shared/utils.ts'
import {
  asJsonObject,
  getResourceSegments,
  respondWithResult,
} from '../_shared/treasury-resource.ts'
import {
  createFraudEvaluationResponse,
  createFraudPolicyResponse,
  deleteFraudPolicyResponse,
  getFraudEvaluationResponse,
  listFraudPoliciesResponse,
} from '../_shared/fraud-service.ts'
import { recordRiskSignal, type SignalType, type Severity } from '../_shared/risk-engine.ts'

const handler = createHandler(
  { endpoint: 'fraud', requireAuth: true, rateLimit: true },
  async (req, supabase, ledger: LedgerContext | null, body, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    const segments = getResourceSegments(req, 'fraud')

    if (segments.length === 0) {
      return errorResponse('Not found', 404, req, requestId)
    }

    if (segments.length === 2 && segments[0] === 'evaluations' && req.method === 'GET') {
      const result = await getFraudEvaluationResponse(req, supabase, ledger, segments[1], requestId)
      return respondWithResult(req, requestId, result)
    }

    if (segments.length === 1 && segments[0] === 'evaluations' && req.method === 'POST') {
      const payload = asJsonObject(body)
      if (!payload) {
        return errorResponse('Invalid JSON body', 400, req, requestId)
      }

      const result = await createFraudEvaluationResponse(req, supabase, ledger, payload, requestId)
      return respondWithResult(req, requestId, result)
    }

    if (segments.length === 1 && segments[0] === 'policies' && req.method === 'GET') {
      const result = await listFraudPoliciesResponse(req, supabase, ledger, requestId)
      return respondWithResult(req, requestId, result)
    }

    if (segments.length === 1 && segments[0] === 'policies' && req.method === 'POST') {
      const payload = asJsonObject(body)
      if (!payload) {
        return errorResponse('Invalid JSON body', 400, req, requestId)
      }

      const result = await createFraudPolicyResponse(req, supabase, ledger, payload, requestId)
      return respondWithResult(req, requestId, result)
    }

    if (segments.length === 2 && segments[0] === 'policies' && req.method === 'DELETE') {
      const result = await deleteFraudPolicyResponse(req, supabase, ledger, segments[1], requestId)
      return respondWithResult(req, requestId, result)
    }

    // POST /fraud/signals — Platform-submitted risk signals
    // Platforms (e.g. Booklyverse) call this to report behavioral signals
    // that Soledgic can't detect from transaction data alone.
    if (segments.length === 1 && segments[0] === 'signals' && req.method === 'POST') {
      const payload = asJsonObject(body)
      if (!payload) {
        return errorResponse('Invalid JSON body', 400, req, requestId)
      }

      const signalType = String(payload.signal_type || '') as SignalType
      const severity = String(payload.severity || 'medium') as Severity
      const entityType = String(payload.entity_type || 'creator')
      const entityId = String(payload.entity_id || '')
      const description = String(payload.description || '')

      const validSignalTypes = new Set([
        'velocity_spike', 'refund_abuse', 'rapid_topup_withdraw',
        'large_single_txn', 'failed_auth_burst', 'payout_velocity',
        'chargeback', 'duplicate_identity', 'geo_anomaly', 'custom',
      ])
      const validSeverities = new Set(['low', 'medium', 'high', 'critical'])

      if (!validSignalTypes.has(signalType)) {
        return errorResponse('Invalid signal_type', 400, req, requestId)
      }
      if (!validSeverities.has(severity)) {
        return errorResponse('Invalid severity (low/medium/high/critical)', 400, req, requestId)
      }
      if (!description) {
        return errorResponse('description is required', 400, req, requestId)
      }

      await recordRiskSignal(supabase, {
        ledgerId: ledger.id,
        organizationId: ledger.organization_id || '',
        signalType,
        severity,
        entityType,
        entityId,
        description,
        details: (payload.details && typeof payload.details === 'object' ? payload.details : {}) as Record<string, unknown>,
      })

      // If signal is about a creator, recalculate their risk score
      if (entityType === 'creator' && entityId) {
        void supabase.rpc('update_creator_risk_score', {
          p_ledger_id: ledger.id,
          p_creator_id: entityId,
        })
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return errorResponse('Not found', 404, req, requestId)
  },
)

Deno.serve(handler)
