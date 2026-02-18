// Soledgic Edge Function: Billing Management API
// POST /billing
//
// Subscription billing is disabled by default. This endpoint currently serves
// usage-based overage billing summaries for the dashboard.
//
// Auth:
// - JWT (Supabase Auth) via Authorization: Bearer <user_jwt>
// - Uses service-role Supabase client for queries, but enforces org membership.

import {
  createHandler,
  jsonResponse,
  errorResponse,
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface BillingRequest {
  action:
    | 'get_subscription'
    | 'get_usage'
    | 'get_plans'
    | 'get_invoices'
    | 'get_payment_methods'
    | 'create_checkout_session'
    | 'create_portal_session'
    | 'update_subscription'
    | 'cancel_subscription'
    | 'resume_subscription'
    | 'add_payment_method'
    | 'set_default_payment_method'
    | 'report_usage'
  organization_id?: string
}

function currentBillingPeriodUtc(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0))
  return { start, end }
}

function disabledSubscriptionBilling(req: Request, requestId: string) {
  return errorResponse('Subscription billing is disabled', 410, req, requestId)
}

async function countLiveLedgers(supabase: SupabaseClient, orgId: string): Promise<number> {
  const { count } = await supabase
    .from('ledgers')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('livemode', true)
    .eq('status', 'active')
  return count || 0
}

async function countActiveMembers(supabase: SupabaseClient, orgId: string): Promise<number> {
  const { count } = await supabase
    .from('organization_members')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('status', 'active')
  return count || 0
}

const handler = createHandler(
  {
    endpoint: 'billing',
    requireAuth: false, // Uses JWT auth (Supabase Auth), not API keys.
    rateLimit: true,
  },
  async (req, supabase, _ledger, body: BillingRequest, { requestId }) => {
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return errorResponse('Unauthorized', 401, req, requestId)
    }

    const token = authHeader.slice('bearer '.length)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return errorResponse('Unauthorized', 401, req, requestId)
    }

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!membership) {
      return errorResponse('No organization found', 404, req, requestId)
    }

    const orgId = body.organization_id || membership.organization_id
    if (orgId !== membership.organization_id) {
      return errorResponse('Access denied', 403, req, requestId)
    }

    const isOwner = membership.role === 'owner'

    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, plan, status, trial_ends_at, max_ledgers, max_team_members, overage_ledger_price, overage_team_member_price, settings')
      .eq('id', orgId)
      .single()

    if (!org) {
      return errorResponse('Organization not found', 404, req, requestId)
    }

    switch (body.action) {
      case 'get_subscription':
      case 'get_usage': {
        const now = new Date()
        const { start, end } = currentBillingPeriodUtc(now)

        const [ledgerCount, memberCount] = await Promise.all([
          countLiveLedgers(supabase, orgId),
          countActiveMembers(supabase, orgId),
        ])

        const includedLedgers = typeof org.max_ledgers === 'number' ? org.max_ledgers : 1
        const includedMembers = typeof org.max_team_members === 'number' ? org.max_team_members : 1

        const overageLedgerPrice = typeof org.overage_ledger_price === 'number' ? org.overage_ledger_price : 2000
        const overageMemberPrice = typeof org.overage_team_member_price === 'number' ? org.overage_team_member_price : 2000

        const additionalLedgers = includedLedgers === -1 ? 0 : Math.max(0, ledgerCount - includedLedgers)
        const additionalMembers = includedMembers === -1 ? 0 : Math.max(0, memberCount - includedMembers)
        const estimatedMonthlyOverageCents = additionalLedgers * overageLedgerPrice + additionalMembers * overageMemberPrice

        const settingsObj = org?.settings && typeof org.settings === 'object' ? org.settings : {}
        const billingSettings = (settingsObj.billing || {}) as Record<string, any>

        const billingMethodIdRaw =
          typeof billingSettings?.payment_method_id === 'string' ? billingSettings.payment_method_id.trim() : ''
        const billingMethodConfigured = billingMethodIdRaw.length > 0
        const billingMethodLabel =
          typeof billingSettings?.payment_method_label === 'string' && billingSettings.payment_method_label.trim().length > 0
            ? billingSettings.payment_method_label.trim()
            : null
        // Shared-merchant model: processing is platform-managed (env-configured),
        // not configured per organization.
        const processorConnected = Boolean(
          Deno.env.get('PROCESSOR_BASE_URL') &&
            Deno.env.get('PROCESSOR_USERNAME') &&
            Deno.env.get('PROCESSOR_PASSWORD') &&
            Deno.env.get('PROCESSOR_MERCHANT_ID')
        )

        let lastCharge: Record<string, any> | null = null
        if (isOwner) {
          const { data: charge } = await supabase
            .from('billing_overage_charges')
            .select('period_start, period_end, amount_cents, status, attempts, last_attempt_at, processor_payment_id, error')
            .eq('organization_id', orgId)
            .order('period_start', { ascending: false })
            .limit(1)
            .maybeSingle()
          lastCharge = charge || null
        }

        if (body.action === 'get_usage') {
          return jsonResponse({
            success: true,
            data: {
              ledgers: ledgerCount,
              team_members: memberCount,
              period_start: start.toISOString(),
              period_end: end.toISOString(),
            },
          }, 200, req, requestId)
        }

        return jsonResponse({
          success: true,
          data: {
            subscription: null,
            organization: {
              id: org.id,
              name: org.name,
              plan: org.plan,
              status: org.status,
              trial_ends_at: org.trial_ends_at,
              max_ledgers: org.max_ledgers,
              max_team_members: org.max_team_members,
              current_ledger_count: ledgerCount,
              current_member_count: memberCount,
              included_ledgers: includedLedgers,
              included_team_members: includedMembers,
              overage_ledger_price: overageLedgerPrice,
              overage_team_member_price: overageMemberPrice,
            },
            usage: {
              ledgers: ledgerCount,
              team_members: memberCount,
              creators: 0,
              transactions: 0,
              api_calls: 0,
              period_start: start.toISOString(),
              period_end: end.toISOString(),
            },
            overage: {
              additional_ledgers: additionalLedgers,
              additional_team_members: additionalMembers,
              overage_ledger_price: overageLedgerPrice,
              overage_team_member_price: overageMemberPrice,
              estimated_monthly_cents: estimatedMonthlyOverageCents,
            },
            billing: {
              method_configured: billingMethodConfigured,
              method_label: billingMethodLabel,
              processor_connected: processorConnected,
              last_charge: lastCharge,
            },
            is_owner: isOwner,
          },
        }, 200, req, requestId)
      }

      case 'get_plans': {
        return jsonResponse({
          success: true,
          data: [
            {
              id: 'pro',
              name: 'Free',
              price_monthly: 0,
              max_ledgers: 1,
              max_team_members: 1,
              overage_ledger_price_monthly: 2000,
              overage_team_member_price_monthly: 2000,
              features: [
                'Payment processing',
                'Core finance features',
                '1 ledger included',
                '1 team member included',
                '$20/month per additional ledger',
                '$20/month per additional team member',
              ],
              price_id_monthly: null,
              contact_sales: false,
            },
          ],
        }, 200, req, requestId)
      }

      case 'get_invoices':
      case 'get_payment_methods': {
        return jsonResponse({ success: true, data: [] }, 200, req, requestId)
      }

      case 'create_checkout_session':
      case 'create_portal_session':
      case 'update_subscription':
      case 'cancel_subscription':
      case 'resume_subscription':
      case 'add_payment_method':
      case 'set_default_payment_method':
      case 'report_usage': {
        return disabledSubscriptionBilling(req, requestId)
      }

      default: {
        return errorResponse(`Unknown action: ${body.action}`, 400, req, requestId)
      }
    }
  }
)

Deno.serve(handler)
