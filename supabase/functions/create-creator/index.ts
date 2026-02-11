// Soledgic Edge Function: Create Creator
// POST /create-creator
// Pre-registers a creator with name, email, tax info, and payout preferences

import {
  createHandler,
  jsonResponse,
  errorResponse,
  validateId,
  validateString,
  LedgerContext,
  createAuditLogAsync,
  sanitizeForAudit
} from '../_shared/utils.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface CreateCreatorRequest {
  creator_id: string
  display_name?: string
  email?: string
  default_split_percent?: number
  tax_info?: {
    tax_id_type?: 'ssn' | 'ein' | 'itin'
    tax_id_last4?: string
    legal_name?: string
    business_type?: 'individual' | 'sole_proprietor' | 'llc' | 'corporation' | 'partnership'
    address?: {
      line1?: string
      line2?: string
      city?: string
      state?: string
      postal_code?: string
      country?: string
    }
  }
  payout_preferences?: {
    schedule?: 'manual' | 'weekly' | 'biweekly' | 'monthly'
    minimum_amount?: number // cents
    method?: 'finix' | 'stripe' | 'bank_transfer'
  }
  metadata?: Record<string, any>
}

const handler = createHandler(
  { endpoint: 'create-creator', requireAuth: true, rateLimit: true },
  async (req: Request, supabase: SupabaseClient, ledger: LedgerContext | null, body: CreateCreatorRequest, { requestId }) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req, requestId)
    }

    // Validate required fields
    const creatorId = validateId(body.creator_id, 100)
    if (!creatorId) {
      return errorResponse('Invalid creator_id: must be 1-100 alphanumeric characters', 400, req, requestId)
    }

    const displayName = body.display_name ? validateString(body.display_name, 255) : null
    const email = body.email ? validateString(body.email, 255) : null

    // Validate email format if provided
    if (email && !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return errorResponse('Invalid email format', 400, req, requestId)
    }

    // Validate split percent
    let splitPercent = 80 // default
    if (body.default_split_percent !== undefined) {
      if (typeof body.default_split_percent !== 'number' ||
          body.default_split_percent < 0 ||
          body.default_split_percent > 100) {
        return errorResponse('default_split_percent must be 0-100', 400, req, requestId)
      }
      splitPercent = body.default_split_percent
    }

    // Check if creator already exists
    const { data: existingAccount } = await supabase
      .from('accounts')
      .select('id')
      .eq('ledger_id', ledger.id)
      .eq('account_type', 'creator_balance')
      .eq('entity_id', creatorId)
      .single()

    if (existingAccount) {
      return errorResponse('Creator already exists', 409, req, requestId)
    }

    // Create creator account
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .insert({
        ledger_id: ledger.id,
        account_type: 'creator_balance',
        entity_type: 'creator',
        entity_id: creatorId,
        name: displayName || `Creator ${creatorId}`,
        metadata: {
          email: email,
          display_name: displayName,
          default_split_percent: splitPercent,
          tax_info: body.tax_info || null,
          payout_preferences: body.payout_preferences || { schedule: 'manual' },
          ...(body.metadata || {})
        }
      })
      .select()
      .single()

    if (accountError) {
      console.error('Failed to create creator account:', accountError)
      return errorResponse('Failed to create creator', 500, req, requestId)
    }

    // Create connected_account record if email provided (for Stripe Connect later)
    if (email) {
      await supabase
        .from('connected_accounts')
        .insert({
          ledger_id: ledger.id,
          entity_type: 'creator',
          entity_id: creatorId,
          display_name: displayName,
          email: email,
          payout_schedule: { interval: body.payout_preferences?.schedule || 'manual' }
        })
        .single()
    }

    // Audit log
    createAuditLogAsync(supabase, req, {
      ledger_id: ledger.id,
      action: 'creator.created',
      resource_type: 'account',
      resource_id: account.id,
      details: sanitizeForAudit({
        creator_id: creatorId,
        display_name: displayName,
        email: email ? `${email.substring(0, 3)}***` : null,
        split_percent: splitPercent,
        has_tax_info: !!body.tax_info
      }),
      request_id: requestId
    })

    return jsonResponse({
      success: true,
      creator: {
        id: creatorId,
        account_id: account.id,
        display_name: displayName,
        email: email,
        default_split_percent: splitPercent,
        payout_preferences: body.payout_preferences || { schedule: 'manual' },
        created_at: account.created_at
      }
    }, 201, req, requestId)
  }
)

Deno.serve(handler)
