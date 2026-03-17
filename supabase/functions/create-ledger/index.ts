// Soledgic Edge Function: Create Ledger
// POST /create-ledger
// Create a new ledger for a business (standard or marketplace mode)
// MIGRATED TO createHandler (no auth required - rate limited by IP)

import {
  createHandler,
  generateApiKey,
  hashApiKey,
  jsonResponse,
  errorResponse,
  validateEmail,
  validateString,
  getClientIp
} from '../_shared/utils.ts'

interface CreateLedgerRequest {
  business_name: string
  owner_email?: string
  ledger_mode?: 'standard' | 'marketplace' | 'platform'
  settings?: {
    default_tax_rate?: number
    fiscal_year_start?: string
    receipt_threshold?: number
    default_split_percent?: number
    platform_fee_percent?: number
    min_payout_amount?: number
    payout_schedule?: 'manual' | 'weekly' | 'monthly'
    tax_withholding_percent?: number
    currency?: string
  }
}

type LedgerMode = 'standard' | 'marketplace'

function getDefaultSettings(mode: LedgerMode, overrides?: CreateLedgerRequest['settings']) {
  if (mode === 'marketplace') {
    return {
      default_split_percent: overrides?.default_split_percent ?? 80,
      default_platform_fee_percent: overrides?.platform_fee_percent ?? 20,
      platform_fee_percent: overrides?.platform_fee_percent ?? 20,
      tax_withholding_percent: overrides?.tax_withholding_percent ?? 0,
      min_payout_amount: overrides?.min_payout_amount ?? 10.00,
      payout_schedule: overrides?.payout_schedule ?? 'manual',
      currency: overrides?.currency ?? 'USD',
      fiscal_year_start: overrides?.fiscal_year_start ?? '01-01'
    }
  } else {
    return {
      default_tax_rate: overrides?.default_tax_rate ?? 25,
      currency: overrides?.currency ?? 'USD',
      fiscal_year_start: overrides?.fiscal_year_start ?? '01-01',
      receipt_threshold: overrides?.receipt_threshold ?? 75
    }
  }
}

// Uses shared generateApiKey from utils.ts (slk_test_* / slk_live_* prefix)

const handler = createHandler(
  { 
    endpoint: 'create-ledger', 
    requireAuth: false,  // No auth required - rate limited by IP
    rateLimit: true 
  },
  async (req, supabase, _ledger, body: CreateLedgerRequest, { requestId }) => {
    const clientIp = getClientIp(req) || 'unknown'

    // Validate required fields
    const businessName = validateString(body.business_name, 200)
    const ownerEmail = body.owner_email ? validateEmail(body.owner_email) : null

    if (!businessName) {
      return errorResponse('Invalid business_name: required and max 200 characters', 400, req, requestId)
    }
    if (body.owner_email && !ownerEmail) {
      return errorResponse('Invalid owner_email: must be a valid email', 400, req, requestId)
    }

    // Accept the older "platform" alias, but normalize to the live schema value.
    const requestedMode = body.ledger_mode || 'standard'
    const ledgerMode: LedgerMode = requestedMode === 'platform' ? 'marketplace' : requestedMode
    if (!['standard', 'marketplace'].includes(ledgerMode)) {
      return errorResponse('ledger_mode must be "standard", "marketplace", or "platform"', 400, req, requestId)
    }

    // Build settings based on mode
    const settings = getDefaultSettings(ledgerMode, body.settings)
    const defaultCurrency = settings.currency || 'USD'

    // Generate API key and hash
    const apiKey = generateApiKey()
    const apiKeyHash = await hashApiKey(apiKey)

    // Create ledger with hash (no plaintext key stored)
    const { data: ledger, error: ledgerError } = await supabase
      .from('ledgers')
      .insert({
        business_name: businessName,
        ledger_mode: ledgerMode,
        api_key_hash: apiKeyHash,
        settings,
        status: 'active',
        default_currency: defaultCurrency,
        livemode: false,
      })
      .select('id, business_name, ledger_mode, status, created_at')
      .single()

    if (ledgerError) {
      console.error('Failed to create ledger:', ledgerError)
      return errorResponse('Failed to create ledger', 500, req, requestId)
    }

    // The live database bootstraps the default account set on ledger creation.
    // Duplicating that work here causes conflicts against newer schemas.

    // Audit log
    await supabase.from('audit_log').insert({
      ledger_id: ledger.id,
      action: 'create_ledger',
      entity_type: 'ledger',
      entity_id: ledger.id,
      actor_type: 'api',
      ip_address: clientIp,
      request_id: requestId,
      request_body: {
        business_name: businessName, 
        owner_email: ownerEmail,
        ledger_mode: ledgerMode,
      }
    })

    return jsonResponse({
      success: true,
      ledger: {
        id: ledger.id,
        business_name: ledger.business_name,
        ledger_mode: ledger.ledger_mode,
        api_key: apiKey,  // Return key ONLY on creation - not stored!
        status: ledger.status,
        created_at: ledger.created_at
      },
      warning: 'Save your API key securely - it cannot be retrieved again!'
    }, 201, req, requestId)
  }
)

Deno.serve(handler)
