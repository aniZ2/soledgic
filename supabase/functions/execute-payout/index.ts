// Soledgic Processor Adapter
// Executes payouts across multiple payment rails while keeping ledger logic consistent
// Supports: FINIX, STRIPE_CONNECT, PLAID_TRANSFER, WISE, MANUAL_BANK_FILE
// SECURITY HARDENED VERSION

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { 
  createHandler, 
  jsonResponse, 
  errorResponse, 
  validateApiKey,
  hashApiKey,
  LedgerContext,
  getClientIp,
  createAuditLogAsync,
  isProduction
} from '../_shared/utils.ts'

// ============================================================================
// TYPES
// ============================================================================

type PayoutRail = 'finix' | 'stripe_connect' | 'plaid_transfer' | 'wise' | 'manual' | 'crypto'

interface PayoutRequest {
  action: 'execute' | 'batch_execute' | 'get_status' | 'configure_rail' | 'list_rails' | 'generate_batch_file'
  payout_id?: string
  payout_ids?: string[]
  rail?: PayoutRail
  rail_config?: RailConfig
}

interface RailConfig {
  rail: PayoutRail
  enabled: boolean
  credentials?: Record<string, string>
  settings?: Record<string, any>
}

interface PayoutResult {
  success: boolean
  payout_id: string
  rail: PayoutRail
  external_id?: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  error?: string
  metadata?: Record<string, any>
}

interface CreatorPayoutDetails {
  payout_id: string
  creator_id: string
  creator_name: string
  amount: number
  currency: string
  payout_method?: {
    rail: PayoutRail
    account_id?: string
    bank_account?: {
      routing_number: string
      account_number: string
      account_type: 'checking' | 'savings'
    }
    email?: string
    wallet_address?: string
  }
}

interface OrganizationFinixSettings {
  identity_id?: string | null
  merchant_id?: string | null
  source_id?: string | null
}

// ============================================================================
// PAYMENT RAIL INTERFACE
// ============================================================================

interface PaymentRail {
  name: PayoutRail
  execute(payout: CreatorPayoutDetails, config: RailConfig): Promise<PayoutResult>
  getStatus(externalId: string, config: RailConfig): Promise<PayoutResult>
  validateConfig(config: RailConfig): { valid: boolean; errors: string[] }
}

// ============================================================================
// STRIPE CONNECT RAIL
// ============================================================================

class StripeConnectRail implements PaymentRail {
  name: PayoutRail = 'stripe_connect'

  async execute(payout: CreatorPayoutDetails, config: RailConfig): Promise<PayoutResult> {
    const stripeKey = config.credentials?.secret_key || Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeKey) {
      return { success: false, payout_id: payout.payout_id, rail: this.name, status: 'failed', error: 'Stripe key not configured' }
    }

    const connectedAccountId = payout.payout_method?.account_id
    if (!connectedAccountId) {
      return { success: false, payout_id: payout.payout_id, rail: this.name, status: 'failed', error: 'No Stripe Connect account ID' }
    }

    try {
      // Create transfer to connected account
      const response = await fetch('https://api.stripe.com/v1/transfers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          amount: String(Math.round(payout.amount * 100)), // Convert to cents
          currency: payout.currency.toLowerCase(),
          destination: connectedAccountId,
          transfer_group: payout.payout_id,
          'metadata[soledgic_payout_id]': payout.payout_id,
          'metadata[creator_id]': payout.creator_id,
        }),
      })

      const data = await response.json()

      if (data.error) {
        return {
          success: false,
          payout_id: payout.payout_id,
          rail: this.name,
          status: 'failed',
          error: data.error.message,
        }
      }

      return {
        success: true,
        payout_id: payout.payout_id,
        rail: this.name,
        external_id: data.id,
        status: 'completed',
        metadata: { stripe_transfer_id: data.id },
      }
    } catch (err: any) {
      return { success: false, payout_id: payout.payout_id, rail: this.name, status: 'failed', error: err.message }
    }
  }

  async getStatus(externalId: string, config: RailConfig): Promise<PayoutResult> {
    const stripeKey = config.credentials?.secret_key || Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeKey) {
      return {
        success: false,
        payout_id: '',
        rail: this.name,
        external_id: externalId,
        status: 'failed',
        error: 'Stripe key not configured',
      }
    }
    
    const response = await fetch(`https://api.stripe.com/v1/transfers/${externalId}`, {
      headers: { 'Authorization': `Bearer ${stripeKey}` },
    })

    const data = await response.json()
    
    return {
      success: !data.error,
      payout_id: data.metadata?.soledgic_payout_id || '',
      rail: this.name,
      external_id: externalId,
      status: data.reversed ? 'failed' : 'completed',
    }
  }

  validateConfig(config: RailConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    if (!config.credentials?.secret_key && !Deno.env.get('STRIPE_SECRET_KEY')) {
      errors.push('Stripe secret key required')
    }
    return { valid: errors.length === 0, errors }
  }
}

// ============================================================================
// FINIX RAIL
// ============================================================================

class FinixRail implements PaymentRail {
  name: PayoutRail = 'finix'

  private resolveConfig(config: RailConfig) {
    const username = config.credentials?.username || Deno.env.get('FINIX_USERNAME')
    const password = config.credentials?.password || Deno.env.get('FINIX_PASSWORD')
    const apiVersion = config.settings?.api_version || Deno.env.get('FINIX_API_VERSION') || '2022-02-01'
    const envRaw = config.settings?.environment || Deno.env.get('FINIX_ENV') || 'sandbox'
    const envNormalized = String(envRaw).toLowerCase().trim()
    const env =
      envNormalized === 'production' || envNormalized === 'prod' || envNormalized === 'live'
        ? 'production'
        : 'sandbox'
    const baseUrl = (
      config.settings?.base_url ||
      Deno.env.get('FINIX_BASE_URL') ||
      (env === 'production'
        ? 'https://finix.live-payments-api.com'
        : 'https://finix.sandbox-payments-api.com')
    ).replace(/\/$/, '')

    let configError: string | null = null
    if (env === 'production' && baseUrl.includes('sandbox')) {
      configError = 'Finix misconfiguration: production environment cannot use sandbox base URL'
    }
    if (env === 'sandbox' && baseUrl.includes('live-payments')) {
      configError = 'Finix misconfiguration: sandbox environment cannot use live base URL'
    }

    return { username, password, apiVersion, baseUrl, configError }
  }

  private parseError(data: any, fallback: string) {
    return (
      data?.error ||
      data?.message ||
      data?._embedded?.errors?.[0]?.message ||
      fallback
    )
  }

  private mapStatus(state: string | undefined): PayoutResult['status'] {
    const normalized = (state || '').toUpperCase()
    if (['SUCCEEDED', 'SETTLED', 'COMPLETED'].includes(normalized)) return 'completed'
    if (['FAILED', 'CANCELED', 'REJECTED', 'DECLINED', 'RETURNED'].includes(normalized)) return 'failed'
    if (['PROCESSING', 'PENDING', 'CREATED', 'SENT'].includes(normalized)) return 'processing'
    return 'pending'
  }

  async execute(payout: CreatorPayoutDetails, config: RailConfig): Promise<PayoutResult> {
    const { username, password, apiVersion, baseUrl, configError } = this.resolveConfig(config)
    if (configError) {
      return {
        success: false,
        payout_id: payout.payout_id,
        rail: this.name,
        status: 'failed',
        error: configError,
      }
    }
    if (!username || !password) {
      return {
        success: false,
        payout_id: payout.payout_id,
        rail: this.name,
        status: 'failed',
        error: 'Finix credentials not configured',
      }
    }

    const destination =
      payout.payout_method?.account_id ||
      config.settings?.default_destination ||
      null

    if (!destination) {
      return {
        success: false,
        payout_id: payout.payout_id,
        rail: this.name,
        status: 'failed',
        error: 'No Finix destination account/identity configured',
      }
    }

    const source = config.settings?.source || Deno.env.get('FINIX_SOURCE_ID') || undefined
    const merchant = config.settings?.merchant || Deno.env.get('FINIX_MERCHANT_ID') || undefined
    const transfersPath = config.settings?.transfers_path || '/transfers'

    const payload: Record<string, unknown> = {
      amount: Math.round(payout.amount * 100),
      currency: payout.currency.toUpperCase(),
      destination,
      tags: {
        soledgic_payout_id: payout.payout_id,
        creator_id: payout.creator_id,
      },
    }
    if (source) payload.source = source
    if (merchant) payload.merchant = merchant

    try {
      const response = await fetch(`${baseUrl}${transfersPath}`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${username}:${password}`)}`,
          'Finix-Version': apiVersion,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        return {
          success: false,
          payout_id: payout.payout_id,
          rail: this.name,
          status: 'failed',
          error: this.parseError(data, `Finix transfer failed (${response.status})`),
        }
      }

      return {
        success: true,
        payout_id: payout.payout_id,
        rail: this.name,
        external_id: data?.id,
        status: this.mapStatus(data?.state || data?.status),
        metadata: { finix_transfer_id: data?.id },
      }
    } catch (err: any) {
      return {
        success: false,
        payout_id: payout.payout_id,
        rail: this.name,
        status: 'failed',
        error: err.message,
      }
    }
  }

  async getStatus(externalId: string, config: RailConfig): Promise<PayoutResult> {
    const { username, password, apiVersion, baseUrl, configError } = this.resolveConfig(config)
    if (configError) {
      return {
        success: false,
        payout_id: '',
        rail: this.name,
        external_id: externalId,
        status: 'failed',
        error: configError,
      }
    }
    if (!username || !password) {
      return {
        success: false,
        payout_id: '',
        rail: this.name,
        external_id: externalId,
        status: 'failed',
        error: 'Finix credentials not configured',
      }
    }

    const transfersPath = config.settings?.transfers_path || '/transfers'

    try {
      const response = await fetch(`${baseUrl}${transfersPath}/${externalId}`, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${btoa(`${username}:${password}`)}`,
          'Finix-Version': apiVersion,
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        return {
          success: false,
          payout_id: '',
          rail: this.name,
          external_id: externalId,
          status: 'failed',
          error: this.parseError(data, `Finix status request failed (${response.status})`),
        }
      }

      return {
        success: true,
        payout_id: data?.tags?.soledgic_payout_id || '',
        rail: this.name,
        external_id: externalId,
        status: this.mapStatus(data?.state || data?.status),
      }
    } catch (err: any) {
      return {
        success: false,
        payout_id: '',
        rail: this.name,
        external_id: externalId,
        status: 'failed',
        error: err.message,
      }
    }
  }

  validateConfig(config: RailConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    if (!config.credentials?.username && !Deno.env.get('FINIX_USERNAME')) {
      errors.push('Finix username required')
    }
    if (!config.credentials?.password && !Deno.env.get('FINIX_PASSWORD')) {
      errors.push('Finix password required')
    }
    return { valid: errors.length === 0, errors }
  }
}

// ============================================================================
// PLAID TRANSFER RAIL (USES VAULT FOR TOKENS)
// ============================================================================

class PlaidTransferRail implements PaymentRail {
  name: PayoutRail = 'plaid_transfer'

  async execute(payout: CreatorPayoutDetails, config: RailConfig): Promise<PayoutResult> {
    const clientId = config.credentials?.client_id || Deno.env.get('PLAID_CLIENT_ID')
    const secret = config.credentials?.secret || Deno.env.get('PLAID_SECRET')
    const env = config.settings?.environment || 'sandbox'

    if (!clientId || !secret) {
      return { success: false, payout_id: payout.payout_id, rail: this.name, status: 'failed', error: 'Plaid credentials not configured' }
    }

    const bankAccount = payout.payout_method?.bank_account
    if (!bankAccount) {
      return { success: false, payout_id: payout.payout_id, rail: this.name, status: 'failed', error: 'No bank account details' }
    }

    const baseUrl = env === 'production' 
      ? 'https://production.plaid.com'
      : 'https://sandbox.plaid.com'

    try {
      // SECURITY: Get access token from vault, not from request
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      )
      
      const { data: accessToken } = await supabase.rpc('get_plaid_token_from_vault', {
        p_connection_id: payout.payout_method?.account_id
      })
      
      if (!accessToken) {
        return { success: false, payout_id: payout.payout_id, rail: this.name, status: 'failed', error: 'Plaid connection not found' }
      }

      // Create transfer authorization first
      const authResponse = await fetch(`${baseUrl}/transfer/authorization/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          secret: secret,
          access_token: accessToken,
          account_id: bankAccount.account_number,
          type: 'debit',
          network: 'ach',
          amount: payout.amount.toFixed(2),
          ach_class: 'ppd',
          user: {
            legal_name: payout.creator_name,
          },
        }),
      })

      const authData = await authResponse.json()
      
      if (authData.error_code) {
        return { 
          success: false, 
          payout_id: payout.payout_id, 
          rail: this.name, 
          status: 'failed', 
          error: authData.error_message 
        }
      }

      // Execute the transfer
      const transferResponse = await fetch(`${baseUrl}/transfer/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          secret: secret,
          access_token: accessToken,
          account_id: bankAccount.account_number,
          authorization_id: authData.authorization.id,
          description: `Payout ${payout.payout_id}`,
        }),
      })

      const transferData = await transferResponse.json()

      if (transferData.error_code) {
        return {
          success: false,
          payout_id: payout.payout_id,
          rail: this.name,
          status: 'failed',
          error: transferData.error_message,
        }
      }

      return {
        success: true,
        payout_id: payout.payout_id,
        rail: this.name,
        external_id: transferData.transfer.id,
        status: 'processing',
        metadata: { plaid_transfer_id: transferData.transfer.id },
      }
    } catch (err: any) {
      return { success: false, payout_id: payout.payout_id, rail: this.name, status: 'failed', error: err.message }
    }
  }

  async getStatus(externalId: string, config: RailConfig): Promise<PayoutResult> {
    const clientId = config.credentials?.client_id || Deno.env.get('PLAID_CLIENT_ID')
    const secret = config.credentials?.secret || Deno.env.get('PLAID_SECRET')
    const env = config.settings?.environment || 'sandbox'
    const baseUrl = env === 'production' ? 'https://production.plaid.com' : 'https://sandbox.plaid.com'

    const response = await fetch(`${baseUrl}/transfer/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        secret: secret,
        transfer_id: externalId,
      }),
    })

    const data = await response.json()
    
    const statusMap: Record<string, PayoutResult['status']> = {
      pending: 'pending',
      posted: 'completed',
      settled: 'completed',
      cancelled: 'failed',
      failed: 'failed',
      returned: 'failed',
    }

    return {
      success: !data.error_code,
      payout_id: '',
      rail: this.name,
      external_id: externalId,
      status: statusMap[data.transfer?.status] || 'processing',
    }
  }

  validateConfig(config: RailConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    if (!config.credentials?.client_id && !Deno.env.get('PLAID_CLIENT_ID')) {
      errors.push('Plaid client ID required')
    }
    if (!config.credentials?.secret && !Deno.env.get('PLAID_SECRET')) {
      errors.push('Plaid secret required')
    }
    return { valid: errors.length === 0, errors }
  }
}

// ============================================================================
// MANUAL BANK FILE RAIL (NACHA/ACH file generation)
// ============================================================================

class ManualBankFileRail implements PaymentRail {
  name: PayoutRail = 'manual'

  async execute(payout: CreatorPayoutDetails, config: RailConfig): Promise<PayoutResult> {
    return {
      success: true,
      payout_id: payout.payout_id,
      rail: this.name,
      external_id: `manual_${payout.payout_id}`,
      status: 'pending',
      metadata: { 
        requires_batch_file: true,
        // SECURITY: Don't include full bank account in response
        bank_account_last4: payout.payout_method?.bank_account?.account_number?.slice(-4),
      },
    }
  }

  async getStatus(externalId: string, config: RailConfig): Promise<PayoutResult> {
    return { success: true, payout_id: '', rail: this.name, external_id: externalId, status: 'pending' }
  }

  validateConfig(config: RailConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    // NACHA is extremely strict. Defaults are OK for sandbox/dev demos but
    // should never be used in production.
    if (isProduction()) {
      const companyId = (config.settings?.company_id || '').toString().trim()
      const originatingDfi = (config.settings?.originating_dfi || '').toString().trim()
      const bankName = (config.settings?.bank_name || '').toString().trim()
      const companyName = (config.settings?.company_name || '').toString().trim()

      if (!companyId) errors.push('company_id is required for NACHA generation')
      if (!originatingDfi) errors.push('originating_dfi is required for NACHA generation')
      if (!bankName) errors.push('bank_name is required for NACHA generation')
      if (!companyName) errors.push('company_name is required for NACHA generation')
    }

    return { valid: errors.length === 0, errors }
  }

  generateNACHAFile(payouts: CreatorPayoutDetails[], config: RailConfig): string {
    const bankNameRaw = (config.settings?.bank_name || 'BANK NAME').toString()
    const companyNameRaw = (config.settings?.company_name || 'SOLEDGIC').toString()
    const companyIdRaw = (config.settings?.company_id || '1234567890').toString()
    const originatingDfiRaw = (config.settings?.originating_dfi || '12345678').toString()

    if (isProduction()) {
      const { valid, errors } = this.validateConfig(config)
      if (!valid) {
        throw new Error(`Manual NACHA config invalid: ${errors.join(', ')}`)
      }
    }

    const companyName = companyNameRaw.substring(0, 16).padEnd(16)
    const companyId = companyIdRaw.padStart(10, '0')
    const originatingDFI = originatingDfiRaw.substring(0, 8)
    const batchNumber = (config.settings?.batch_number || '0000001').padStart(7, '0')
    const now = new Date()
    const effectiveDate = now.toISOString().slice(2, 10).replace(/-/g, '')
    const fileCreationDate = now.toISOString().slice(2, 10).replace(/-/g, '')
    const fileCreationTime = now.toTimeString().slice(0, 5).replace(':', '')

    const lines: string[] = []

    // File Header Record (1)
    lines.push(
      '1' +
      '01' +
      ' ' + originatingDFI.padStart(9, '0') +
      ' ' + companyId.padStart(9, '0').substring(0, 9) +
      fileCreationDate +
      fileCreationTime +
      'A' +
      '094' +
      '10' +
      '1' +
      bankNameRaw.substring(0, 23).padEnd(23) +
      companyName.padEnd(23) +
      ''.padEnd(8)
    )

    // Batch Header Record (5)
    lines.push(
      '5' +
      '220' +
      companyName +
      ''.padEnd(20) +
      companyId +
      'PPD' +
      'PAYOUT'.padEnd(10) +
      effectiveDate +
      effectiveDate +
      ''.padEnd(3) +
      '1' +
      originatingDFI +
      batchNumber
    )

    // Entry Detail Records (6)
    let entryHash = 0
    let totalAmount = 0
    let entryCount = 0

    for (const payout of payouts) {
      const bank = payout.payout_method?.bank_account
      if (!bank) continue

      const routingNumber = bank.routing_number.padStart(9, '0')
      entryHash += parseInt(routingNumber.slice(0, 8))
      const amountCents = Math.round(payout.amount * 100)
      totalAmount += amountCents
      entryCount++

      lines.push(
        '6' +
        '22' +
        routingNumber +
        bank.account_number.padEnd(17).slice(0, 17) +
        amountCents.toString().padStart(10, '0') +
        payout.creator_id.padEnd(15).slice(0, 15) +
        payout.creator_name.padEnd(22).slice(0, 22) +
        '  ' +
        '0' +
        originatingDFI +
        entryCount.toString().padStart(7, '0')
      )
    }

    // Batch Control Record (8)
    lines.push(
      '8' +
      '220' +
      entryCount.toString().padStart(6, '0') +
      (entryHash % 10000000000).toString().padStart(10, '0') +
      '0'.repeat(12) +
      totalAmount.toString().padStart(12, '0') +
      companyId +
      ''.padEnd(19) +
      ''.padEnd(6) +
      originatingDFI +
      batchNumber
    )

    // File Control Record (9)
    const batchCount = 1
    const blockCount = Math.ceil((lines.length + 1) / 10)

    lines.push(
      '9' +
      batchCount.toString().padStart(6, '0') +
      blockCount.toString().padStart(6, '0') +
      entryCount.toString().padStart(8, '0') +
      (entryHash % 10000000000).toString().padStart(10, '0') +
      '0'.repeat(12) +
      totalAmount.toString().padStart(12, '0') +
      ''.padEnd(39)
    )

    while (lines.length % 10 !== 0) {
      lines.push('9'.repeat(94))
    }

    return lines.join('\n')
  }
}

// ============================================================================
// RAIL REGISTRY
// ============================================================================

const RAILS: Record<PayoutRail, PaymentRail> = {
  finix: new FinixRail(),
  stripe_connect: new StripeConnectRail(),
  plaid_transfer: new PlaidTransferRail(),
  manual: new ManualBankFileRail(),
  wise: new ManualBankFileRail(),
  crypto: new ManualBankFileRail(),
}

function normalizeRail(value?: string | null): PayoutRail | null {
  if (!value) return null
  switch (value) {
    case 'finix':
      return 'finix'
    case 'stripe':
    case 'stripe_connect':
      return 'stripe_connect'
    case 'plaid':
    case 'plaid_transfer':
      return 'plaid_transfer'
    case 'manual':
      return 'manual'
    case 'wise':
      return 'wise'
    case 'crypto':
      return 'crypto'
    default:
      return null
  }
}

function pickDefaultRail(configs: RailConfig[]): PayoutRail {
  const enabledRails = new Set(configs.filter(c => c.enabled).map(c => c.rail))
  if (enabledRails.has('finix')) return 'finix'
  if (enabledRails.has('stripe_connect')) return 'stripe_connect'
  if (enabledRails.has('plaid_transfer')) return 'plaid_transfer'
  if (enabledRails.has('manual')) return 'manual'
  // Finix is now the active default integration when no explicit rail is configured.
  return 'finix'
}

function mergePayoutRailsWithOrgFinix(
  configs: RailConfig[],
  orgFinix: OrganizationFinixSettings | null
): RailConfig[] {
  if (!orgFinix) return configs

  const finixSettingsPatch: Record<string, any> = {}
  if (orgFinix.merchant_id) finixSettingsPatch.merchant = orgFinix.merchant_id
  if (orgFinix.source_id) finixSettingsPatch.source = orgFinix.source_id

  if (Object.keys(finixSettingsPatch).length === 0) {
    return configs
  }

  const next = [...configs]
  const finixIndex = next.findIndex((cfg) => cfg.rail === 'finix')

  if (finixIndex >= 0) {
    next[finixIndex] = {
      ...next[finixIndex],
      settings: {
        ...(next[finixIndex].settings || {}),
        ...finixSettingsPatch,
      },
    }
    return next
  }

  next.push({
    rail: 'finix',
    enabled: true,
    settings: finixSettingsPatch,
  })

  return next
}

// ============================================================================
// INTERNAL PAYOUT EXECUTION (shared by single and batch)
// ============================================================================

async function executeSinglePayout(
  supabase: any,
  ledger: LedgerContext,
  payoutRails: RailConfig[],
  payoutId: string,
  rail?: PayoutRail,
  clientIp?: string | null,
  userAgent?: string | null
): Promise<PayoutResult> {
  // Get payout details
  const { data: payout, error: payoutError } = await supabase
    .from('transactions')
    .select(`
      id, amount, reference_id, description, metadata,
      entries!inner(account_id, accounts!inner(entity_id, name, metadata))
    `)
    .eq('id', payoutId)
    .eq('ledger_id', ledger.id)
    .eq('transaction_type', 'payout')
    .single()

  if (payoutError || !payout) {
    return {
      success: false,
      payout_id: payoutId,
      rail: 'manual',
      status: 'failed',
      error: 'Payout not found',
    }
  }

  const creatorEntry = (payout.entries as any[]).find(e => e.accounts?.entity_id)
  if (!creatorEntry) {
    return {
      success: false,
      payout_id: payoutId,
      rail: 'manual',
      status: 'failed',
      error: 'Creator not found for payout',
    }
  }

  const creatorMeta = creatorEntry.accounts.metadata || {}
  const payoutDetails: CreatorPayoutDetails = {
    payout_id: payout.id,
    creator_id: creatorEntry.accounts.entity_id,
    creator_name: creatorEntry.accounts.name,
    amount: payout.amount,
    currency: 'USD',
    payout_method: creatorMeta.payout_method,
  }

  const requestedRail = normalizeRail((rail as string | undefined) || creatorMeta.payout_method?.rail)
  const selectedRail = requestedRail || pickDefaultRail(payoutRails)
  const railImpl = RAILS[selectedRail]

  if (!railImpl) {
    return {
      success: false,
      payout_id: payoutId,
      rail: selectedRail,
      status: 'failed',
      error: `Unknown rail: ${selectedRail}`,
    }
  }

  const railConfig = payoutRails.find(r => r.rail === selectedRail) || { rail: selectedRail, enabled: true }
  if (railConfig.enabled === false) {
    return {
      success: false,
      payout_id: payoutId,
      rail: selectedRail,
      status: 'failed',
      error: `Rail '${selectedRail}' is disabled`,
    }
  }

  // Execute
  const result = await railImpl.execute(payoutDetails, railConfig)

  // Update transaction
  await supabase
    .from('transactions')
    .update({
      metadata: {
        ...payout.metadata,
        rail_used: selectedRail,
        external_id: result.external_id,
        rail_status: result.status,
        // SECURITY: Don't store full error in metadata
        rail_error: result.error?.substring(0, 100),
      },
    })
    .eq('id', payoutId)

  // Audit log with all security fields
  await supabase.from('audit_log').insert({
    ledger_id: ledger.id,
    action: 'payout_executed',
    entity_type: 'transaction',
    entity_id: payoutId,
    actor_type: 'api',
    ip_address: clientIp,
    user_agent: userAgent?.substring(0, 500),
    request_body: {
      rail: selectedRail,
      success: result.success,
      external_id: result.external_id,
    },
  })

  return result
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

const handler = createHandler(
  { endpoint: 'execute-payout', requireAuth: true, rateLimit: true },
  async (req: Request, supabase, ledger: LedgerContext | null, body: PayoutRequest) => {
    if (!ledger) {
      return errorResponse('Ledger not found', 401, req)
    }

    // Get ledger's configured rails
    const { data: ledgerFull } = await supabase
      .from('ledgers')
      .select('payout_rails')
      .eq('id', ledger.id)
      .single()

    const rawPayoutRails = (ledgerFull?.payout_rails as RailConfig[]) || []
    let organizationFinix: OrganizationFinixSettings | null = null
    if (ledger.organization_id) {
      const { data: orgRow } = await supabase
        .from('organizations')
        .select('settings')
        .eq('id', ledger.organization_id)
        .maybeSingle()

      organizationFinix = ((orgRow?.settings as any)?.finix || null) as OrganizationFinixSettings | null
    }

    const payoutRails = mergePayoutRailsWithOrgFinix(rawPayoutRails, organizationFinix)
    const clientIp = getClientIp(req)
    const userAgent = req.headers.get('user-agent')

    switch (body.action) {
      // ================================================================
      // EXECUTE SINGLE PAYOUT
      // ================================================================
      case 'execute': {
        if (!body.payout_id) {
          return errorResponse('payout_id required', 400, req)
        }

        const result = await executeSinglePayout(
          supabase,
          ledger,
          payoutRails,
          body.payout_id,
          body.rail,
          clientIp,
          userAgent
        )

        return jsonResponse(result, result.success ? 200 : 500, req)
      }

      // ================================================================
      // BATCH EXECUTE (direct internal calls, no HTTP recursion)
      // ================================================================
      case 'batch_execute': {
        if (!body.payout_ids?.length) {
          return errorResponse('payout_ids required', 400, req)
        }

        // Limit batch size
        if (body.payout_ids.length > 100) {
          return errorResponse('Maximum 100 payouts per batch', 400, req)
        }

        const results: PayoutResult[] = []

        // Execute each payout directly (no HTTP calls)
        for (const payoutId of body.payout_ids) {
          const result = await executeSinglePayout(
            supabase,
            ledger,
            payoutRails,
            payoutId,
            body.rail,
            clientIp,
            userAgent
          )
          results.push(result)
        }

        const succeeded = results.filter(r => r.success).length
        const failed = results.filter(r => !r.success).length

        return jsonResponse({
          success: failed === 0,
          summary: { total: results.length, succeeded, failed },
          results,
        }, 200, req)
      }

      // ================================================================
      // GENERATE BATCH FILE (stored securely with signed URL)
      // ================================================================
      case 'generate_batch_file': {
        if (!body.payout_ids?.length) {
          return errorResponse('payout_ids required', 400, req)
        }

        const { data: payouts } = await supabase
          .from('transactions')
          .select(`
            id, amount, reference_id,
            entries!inner(accounts!inner(entity_id, name, metadata))
          `)
          .in('id', body.payout_ids)
          .eq('ledger_id', ledger.id)
          .eq('transaction_type', 'payout')

        if (!payouts?.length) {
          return errorResponse('No payouts found', 404, req)
        }

        const payoutDetails: CreatorPayoutDetails[] = payouts.map(p => {
          const creatorEntry = (p.entries as any[]).find(e => e.accounts?.entity_id)
          return {
            payout_id: p.id,
            creator_id: creatorEntry?.accounts?.entity_id || '',
            creator_name: creatorEntry?.accounts?.name || '',
            amount: p.amount,
            currency: 'USD',
            payout_method: creatorEntry?.accounts?.metadata?.payout_method,
          }
        })

        const manualRail = RAILS.manual as ManualBankFileRail
        const railConfig = payoutRails.find(r => r.rail === 'manual') || { rail: 'manual' as PayoutRail, enabled: true }
        const nachaFile = manualRail.generateNACHAFile(payoutDetails, railConfig)

        // SECURITY: Store file in secure bucket instead of returning in response
        const filename = `nacha/${ledger.id}/${Date.now()}_payouts.ach`
        const encoder = new TextEncoder()
        const fileData = encoder.encode(nachaFile)

        // Upload to Supabase Storage (private bucket)
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('payout-files')  // Private bucket
          .upload(filename, fileData, {
            contentType: 'text/plain',
            upsert: false,
          })

        if (uploadError) {
          console.error('Failed to upload NACHA file:', uploadError)
          return errorResponse('Failed to generate batch file', 500, req)
        }

        // SECURITY FIX M3: Reduced expiration from 1 hour to 5 minutes
        // NACHA files contain sensitive bank account data - minimize exposure window
        const NACHA_URL_EXPIRY_SECONDS = 300  // 5 minutes
        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from('payout-files')
          .createSignedUrl(filename, NACHA_URL_EXPIRY_SECONDS)

        if (signedUrlError || !signedUrlData?.signedUrl) {
          console.error('Failed to create signed URL:', signedUrlError)
          return errorResponse('Failed to generate download link', 500, req)
        }

        // Audit log for batch file generation (security-sensitive action)
        await supabase.from('audit_log').insert({
          ledger_id: ledger.id,
          action: 'batch_file_generated',
          entity_type: 'payout_batch',
          actor_type: 'api',
          ip_address: clientIp,
          user_agent: userAgent?.substring(0, 500),
          request_body: {
            payout_count: payoutDetails.length,
            total_amount: payoutDetails.reduce((sum, p) => sum + p.amount, 0),
            file_path: filename,
            payout_ids: body.payout_ids,
          },
          risk_score: 40,  // Elevated risk - contains bank account data
        })

        return jsonResponse({
          success: true,
          file_type: 'nacha',
          filename: `payouts_${new Date().toISOString().split('T')[0]}.ach`,
          download_url: signedUrlData.signedUrl,
          expires_in_seconds: NACHA_URL_EXPIRY_SECONDS,
          payout_count: payoutDetails.length,
          total_amount: payoutDetails.reduce((sum, p) => sum + p.amount, 0),
          // SECURITY: No longer returning file content directly
          // SECURITY: URL expires in 5 minutes - download immediately
        }, 200, req)
      }

      // ================================================================
      // LIST AVAILABLE RAILS
      // ================================================================
      case 'list_rails': {
        const availableRails = Object.keys(RAILS).map(rail => ({
          rail,
          configured: !!payoutRails.find(r => r.rail === rail && r.enabled),
        }))

        return jsonResponse({
          success: true,
          rails: availableRails,
          configured: payoutRails,
        }, 200, req)
      }

      // ================================================================
      // CONFIGURE RAIL
      // ================================================================
      case 'configure_rail': {
        if (!body.rail_config) {
          return errorResponse('rail_config required', 400, req)
        }

        const railImpl = RAILS[body.rail_config.rail]
        if (!railImpl) {
          return errorResponse(`Unknown rail: ${body.rail_config.rail}`, 400, req)
        }

        const validation = railImpl.validateConfig(body.rail_config)
        if (!validation.valid) {
          return errorResponse(`Invalid config: ${validation.errors.join(', ')}`, 400, req)
        }

        const existingRails = rawPayoutRails.filter(r => r.rail !== body.rail_config!.rail)
        existingRails.push(body.rail_config)

        await supabase
          .from('ledgers')
          .update({ payout_rails: existingRails })
          .eq('id', ledger.id)

        return jsonResponse({ success: true, message: 'Rail configured' }, 200, req)
      }

      default:
        return errorResponse(`Unknown action: ${body.action}`, 400, req)
    }
  }
)

Deno.serve(handler)
