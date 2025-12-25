// Soledgic Edge Function: Create Ledger
// POST /create-ledger
// Create a new ledger for a business (standard or platform mode)
// MIGRATED TO createHandler (no auth required - rate limited by IP)

import { 
  createHandler,
  hashApiKey,
  jsonResponse,
  errorResponse,
  validateEmail,
  validateString,
  getClientIp
} from '../_shared/utils.ts'

interface CreateLedgerRequest {
  business_name: string
  owner_email: string
  ledger_mode?: 'standard' | 'platform'
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

function getDefaultSettings(mode: string, overrides?: CreateLedgerRequest['settings']) {
  if (mode === 'platform') {
    return {
      default_split_percent: overrides?.default_split_percent ?? 80,
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

// Generate secure random API key
function generateApiKey(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  return `sk_live_${hex}`
}

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
    const ownerEmail = validateEmail(body.owner_email)

    if (!businessName) {
      return errorResponse('Invalid business_name: required and max 200 characters', 400, req, requestId)
    }
    if (!ownerEmail) {
      return errorResponse('Invalid owner_email: must be a valid email', 400, req, requestId)
    }

    // Validate mode
    const ledgerMode = body.ledger_mode || 'standard'
    if (!['standard', 'platform'].includes(ledgerMode)) {
      return errorResponse('ledger_mode must be "standard" or "platform"', 400, req, requestId)
    }

    // Check if ledger with same name exists for this owner
    const { data: existing } = await supabase
      .from('ledgers')
      .select('id')
      .eq('owner_email', ownerEmail)
      .eq('business_name', businessName)
      .single()

    if (existing) {
      return jsonResponse({ 
        success: false, 
        error: `Ledger "${businessName}" already exists for this owner` 
      }, 409, req, requestId)
    }

    // Build settings based on mode
    const settings = getDefaultSettings(ledgerMode, body.settings)

    // Generate API key and hash
    const apiKey = generateApiKey()
    const apiKeyHash = await hashApiKey(apiKey)

    // Create ledger with hash (no plaintext key stored)
    const { data: ledger, error: ledgerError } = await supabase
      .from('ledgers')
      .insert({
        business_name: businessName,
        owner_email: ownerEmail,
        ledger_mode: ledgerMode,
        api_key_hash: apiKeyHash,
        settings,
        status: 'active'
      })
      .select('id, business_name, ledger_mode, status, created_at')
      .single()

    if (ledgerError) {
      console.error('Failed to create ledger:', ledgerError)
      return errorResponse('Failed to create ledger', 500, req, requestId)
    }

    // Create default accounts based on mode
    const accountsToCreate = ledgerMode === 'platform' 
      ? [
          { account_type: 'cash', name: 'Cash / Bank', entity_type: 'platform' },
          { account_type: 'platform_revenue', name: 'Platform Revenue', entity_type: 'platform' },
          { account_type: 'processing_fees', name: 'Processing Fees', entity_type: 'platform' },
        ]
      : [
          { account_type: 'cash', name: 'Cash / Bank', entity_type: 'business' },
          { account_type: 'revenue', name: 'Revenue', entity_type: 'business' },
          { account_type: 'expense', name: 'Operating Expenses', entity_type: 'business' },
        ]

    for (const acc of accountsToCreate) {
      await supabase.from('accounts').insert({
        ledger_id: ledger.id,
        ...acc,
        balance: 0,
        currency: 'USD'
      })
    }

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
        ledger_mode: ledgerMode
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
