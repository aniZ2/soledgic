// Soledgic Test Client
// Wrapper for API calls in tests - matches actual Edge Function APIs
// SECURITY: All API keys must come from environment variables, never hardcoded

export class SoledgicTestClient {
  private apiKey: string
  private anonKey: string
  private baseUrl: string

  constructor(apiKey: string, anonKey: string, baseUrl?: string) {
    this.apiKey = apiKey
    this.anonKey = anonKey
    const resolved = baseUrl || process.env.SOLEDGIC_URL || ''
    if (!resolved) {
      throw new Error('SOLEDGIC_URL environment variable is required. Set it in .env.test')
    }
    this.baseUrl = resolved
  }

  async request(endpoint: string, body: any, _deadline?: number): Promise<any> {
    // Retry budget: total retry time capped at 60s so it never outruns test timeouts
    const deadline = _deadline ?? Date.now() + 60_000
    const url = `${this.baseUrl}/${endpoint}`
    const bodyStr = JSON.stringify(body)

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'Authorization': `Bearer ${this.anonKey}`,
      },
      body: bodyStr,
    })

    const data = await res.json()

    // Retry on rate limit (429) only if we have budget remaining
    if (res.status === 429) {
      const remaining = deadline - Date.now()
      if (remaining > 2000) {
        const retryAfter = Number(data.retry_after || 10)
        const waitMs = Math.min(retryAfter * 1000, remaining - 1000)
        await new Promise(resolve => setTimeout(resolve, waitMs))
        return this.request(endpoint, body, deadline)
      }
      // No budget left — throw instead of hanging
      const error: any = new Error(`Rate limited on ${endpoint} and retry budget exhausted`)
      error.status = 429
      error.code = 'RATE_LIMITED'
      error.details = data
      throw error
    }

    if (!res.ok && !data.success) {
      const error: any = new Error(data.error || `HTTP ${res.status}`)
      error.status = res.status
      error.code = data.code
      error.details = data
      throw error
    }

    return data
  }

  async requestGet(endpoint: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/${endpoint}`, {
      method: 'GET',
      headers: {
        'x-api-key': this.apiKey,
        'Authorization': `Bearer ${this.anonKey}`,
      },
    })

    const data = await res.json()
    
    if (!res.ok && !data.success) {
      const error: any = new Error(data.error || `HTTP ${res.status}`)
      error.status = res.status
      error.code = data.code
      error.details = data
      throw error
    }

    return data
  }

  // Sales
  async recordSale(params: {
    referenceId: string
    creatorId: string
    amount: number
    description?: string
    transactionDate?: string
    metadata?: Record<string, any>
  }) {
    return this.request('record-sale', {
      reference_id: params.referenceId,
      creator_id: params.creatorId,
      amount: params.amount,
      description: params.description,
      transaction_date: params.transactionDate,
      metadata: params.metadata,
    })
  }

  // Bulk import
  async bulkImport(sales: Array<{
    referenceId: string
    creatorId: string
    amount: number
    description?: string
    transactionDate?: string
  }>, options?: { batchId?: string }) {
    const results = {
      imported: 0,
      failed: 0,
      duplicates: 0,
      errors: [] as Array<{ referenceId: string; error: string }>,
      duplicateIds: [] as string[],
    }

    for (const sale of sales) {
      try {
        await this.recordSale(sale)
        results.imported++
      } catch (error: any) {
        const msg = error.message?.toLowerCase() || ''
        if (msg.includes('duplicate') || msg.includes('reference_id')) {
          results.duplicates++
          results.duplicateIds.push(sale.referenceId)
        } else {
          results.failed++
          results.errors.push({ referenceId: sale.referenceId, error: error.message })
        }
      }
    }

    return results
  }

  // Payouts - matches process-payout Edge Function
  async processPayout(params: {
    creatorId: string
    referenceId: string
    amount?: number
    description?: string
  }) {
    return this.request('process-payout', {
      creator_id: params.creatorId,
      reference_id: params.referenceId,
      amount: params.amount,
      description: params.description,
    })
  }

  // Balances - get-balances doesn't require action
  async getBalances() {
    return this.request('get-balances', {})
  }

  async getCreatorBalance(creatorId: string) {
    return this.request('get-balances', { creator_id: creatorId })
  }

  // Reports
  async getTrialBalance() {
    return this.request('generate-report', { report_type: 'trial_balance' })
  }

  async getProfitLoss(startDate?: string, endDate?: string) {
    return this.request('generate-report', {
      report_type: 'profit_loss',
      start_date: startDate,
      end_date: endDate,
    })
  }

  // Periods
  async closePeriod(year: number, month: number) {
    return this.request('close-period', {
      action: 'close',
      year,
      month,
    })
  }

  async getPeriodStatus(year: number, month: number) {
    return this.request('close-period', {
      action: 'status',
      year,
      month,
    })
  }

  // Reconciliation
  async reconcile(params: {
    action: 'match' | 'unmatch' | 'auto_match' | 'list_unmatched'
    transactionId?: string
    bankTransactionId?: string
    bankTransactions?: Array<{ id: string; amount: number; description: string; date: string }>
  }) {
    return this.request('reconcile', params)
  }

  // Reverse/void - matches reverse-transaction Edge Function
  async reverseTransaction(transactionId: string, reason: string) {
    return this.request('reverse-transaction', {
      transaction_id: transactionId,
      reason,
    })
  }

  async voidTransaction(transactionId: string, reason: string) {
    // Same endpoint, just different handling based on transaction state
    return this.request('reverse-transaction', {
      transaction_id: transactionId,
      reason,
    })
  }

  // Frozen statements
  async verifyFrozenStatements(periodId: string) {
    return this.request('frozen-statements', {
      action: 'verify',
      period_id: periodId,
    })
  }

  async listFrozenStatements(periodId: string) {
    return this.request('frozen-statements', {
      action: 'list',
      period_id: periodId,
    })
  }

  // Transactions
  async getTransactions(filters?: { type?: string; creatorId?: string }) {
    return this.request('generate-report', {
      report_type: 'transaction_history',
      transaction_type: filters?.type,
      creator_id: filters?.creatorId,
    })
  }

  async getTransactionCount() {
    const result = await this.getTransactions()
    return result.transactions?.length || 0
  }

  // ============================================================================
  // INVOICING
  // ============================================================================

  async createInvoice(params: {
    customerName: string
    customerEmail?: string
    customerId?: string
    lineItems: Array<{ description: string; quantity: number; unitPrice: number }>
    dueDate?: string
    notes?: string
    terms?: string
  }) {
    return this.request('invoices', {
      customer_name: params.customerName,
      customer_email: params.customerEmail,
      customer_id: params.customerId,
      line_items: params.lineItems.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unitPrice,
      })),
      due_date: params.dueDate,
      notes: params.notes,
      terms: params.terms,
    })
  }

  async getInvoice(invoiceId: string) {
    return this.requestGet(`invoices/${invoiceId}`)
  }

  async listInvoices(filters?: { status?: string; customerId?: string; limit?: number }) {
    const params = new URLSearchParams()
    if (filters?.status) params.set('status', filters.status)
    if (filters?.customerId) params.set('customer_id', filters.customerId)
    if (filters?.limit) params.set('limit', String(filters.limit))
    return this.requestGet(`invoices?${params.toString()}`)
  }

  async sendInvoice(invoiceId: string) {
    return this.request(`invoices/${invoiceId}/send`, {})
  }

  async recordInvoicePayment(invoiceId: string, params: {
    amount: number
    paymentMethod?: string
    referenceId?: string
    notes?: string
  }) {
    return this.request(`invoices/${invoiceId}/record-payment`, {
      amount: params.amount,
      payment_method: params.paymentMethod,
      reference_id: params.referenceId,
      notes: params.notes,
    })
  }

  async voidInvoice(invoiceId: string, reason: string) {
    return this.request(`invoices/${invoiceId}/void`, { reason })
  }

  // ============================================================================
  // REPORTS - BALANCE SHEET & AGING
  // ============================================================================

  async getBalanceSheet(asOfDate?: string) {
    const params = asOfDate ? `?as_of_date=${asOfDate}` : ''
    return this.requestGet(`balance-sheet${params}`)
  }

  async getARaging(asOfDate?: string) {
    const params = asOfDate ? `?as_of_date=${asOfDate}` : ''
    return this.requestGet(`ar-aging${params}`)
  }

  async getAPaging(asOfDate?: string) {
    const params = asOfDate ? `?as_of_date=${asOfDate}` : ''
    return this.requestGet(`ap-aging${params}`)
  }

  // ============================================================================
  // REFUNDS
  // ============================================================================

  async recordRefund(params: {
    originalSaleReference: string
    amount?: number
    reason: string
    refundFrom?: 'both' | 'platform_only' | 'creator_only'
    mode?: 'ledger_only' | 'processor_refund'
    processorPaymentId?: string
    externalRefundId?: string
    idempotencyKey?: string
    metadata?: Record<string, any>
  }) {
    return this.request('record-refund', {
      original_sale_reference: params.originalSaleReference,
      amount: params.amount,
      reason: params.reason,
      refund_from: params.refundFrom,
      mode: params.mode,
      processor_payment_id: params.processorPaymentId,
      external_refund_id: params.externalRefundId,
      idempotency_key: params.idempotencyKey,
      metadata: params.metadata,
    })
  }

  // ============================================================================
  // PAYOUT EXECUTION
  // ============================================================================

  async executePayout(params: {
    action: 'execute' | 'batch_execute' | 'list_rails' | 'configure_rail'
    payoutId?: string
    payoutIds?: string[]
    rail?: string
  }) {
    return this.request('execute-payout', {
      action: params.action,
      payout_id: params.payoutId,
      payout_ids: params.payoutIds,
      rail: params.rail,
    })
  }

  // ============================================================================
  // WEBHOOKS
  // ============================================================================

  async createWebhookEndpoint(params: {
    url: string
    events: string[]
    description?: string
  }) {
    return this.request('webhooks', {
      action: 'create',
      url: params.url,
      events: params.events,
      description: params.description,
    })
  }

  async listWebhookEndpoints() {
    return this.request('webhooks', { action: 'list' })
  }

  async listWebhookDeliveries(endpointId?: string) {
    return this.request('webhooks', {
      action: 'deliveries',
      endpoint_id: endpointId,
    })
  }

  // ============================================================================
  // CREATORS
  // ============================================================================

  async createCreator(params: {
    creatorId: string
    displayName: string
    email?: string
    defaultSplitPercent?: number
  }) {
    return this.request('create-creator', {
      creator_id: params.creatorId,
      display_name: params.displayName,
      email: params.email,
      default_split_percent: params.defaultSplitPercent,
    })
  }

  async deleteCreator(creatorId: string) {
    return this.request('delete-creator', {
      creator_id: creatorId,
    })
  }

  // ============================================================================
  // EXPENSES
  // ============================================================================

  async recordExpense(params: {
    referenceId: string
    amount: number
    description: string
    category?: string
    vendorName?: string
    receiptUrl?: string
    metadata?: Record<string, any>
  }) {
    return this.request('record-expense', {
      reference_id: params.referenceId,
      amount: params.amount,
      description: params.description,
      category: params.category,
      vendor_name: params.vendorName,
      receipt_url: params.receiptUrl,
      metadata: params.metadata,
    })
  }

  // ============================================================================
  // PROVENANCE REPORT
  // ============================================================================

  async getProvenanceReport(startDate?: string, endDate?: string) {
    return this.request('generate-report', {
      report_type: 'provenance',
      start_date: startDate,
      end_date: endDate,
    })
  }

  // ============================================================================
  // TEST UTILITIES
  // ============================================================================

  async cleanupTestData() {
    return this.request('test-cleanup', {})
  }
}

// ============================================================================
// SERVICE ROLE CLIENT — for internal functions (reconcile, inbox processing)
// ============================================================================

export class SoledgicServiceClient {
  private serviceRoleKey: string
  private baseUrl: string

  constructor(serviceRoleKey: string, baseUrl?: string) {
    this.serviceRoleKey = serviceRoleKey
    const resolved = baseUrl || process.env.SOLEDGIC_URL || ''
    if (!resolved) {
      throw new Error('SOLEDGIC_URL environment variable is required. Set it in .env.test')
    }
    this.baseUrl = resolved
  }

  async request(endpoint: string, body: any): Promise<any> {
    const res = await fetch(`${this.baseUrl}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.serviceRoleKey}`,
      },
      body: JSON.stringify(body),
    })

    const data = await res.json()

    if (!res.ok && !data.success) {
      const error: any = new Error(data.error || `HTTP ${res.status}`)
      error.status = res.status
      error.details = data
      throw error
    }

    return data
  }

  async reconcileCheckouts(params?: { limit?: number; dryRun?: boolean }) {
    return this.request('reconcile-checkout-ledger', {
      limit: params?.limit ?? 20,
      dry_run: params?.dryRun ?? false,
    })
  }

  async processProcessorInbox(params?: { limit?: number; dryRun?: boolean }) {
    return this.request('process-processor-inbox', {
      limit: params?.limit ?? 25,
      dry_run: params?.dryRun ?? false,
    })
  }
}

export function createServiceClient(): SoledgicServiceClient | null {
  const serviceKey = cleanSecret(process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!serviceKey) return null
  return new SoledgicServiceClient(serviceKey)
}

// ============================================================================
// SECURITY: API keys MUST be loaded from environment variables
// ============================================================================
// 
// Set these in your CI/CD environment or local .env.test file:
//   TEST_API_KEY_BOOKLYVERSE=sk_test_...
//   TEST_API_KEY_ACME=sk_test_...
//
// NEVER hardcode API keys in source code!
// ============================================================================

function isPlaceholder(value: string): boolean {
  const v = value.trim().toLowerCase()
  if (!v) return true
  return (
    v.includes('replace_with') ||
    v.includes('your_') ||
    v === 'sk_test_replace_with_local_key' ||
    v === 'sk_test_your_booklyverse_test_key_here' ||
    v === 'sk_test_your_acme_test_key_here'
  )
}

function cleanSecret(value: string | undefined): string {
  const normalized = (value || '').trim()
  return isPlaceholder(normalized) ? '' : normalized
}

export const TEST_KEYS = {
  booklyverse: cleanSecret(process.env.TEST_API_KEY_BOOKLYVERSE),
  acme: cleanSecret(process.env.TEST_API_KEY_ACME),
}

// Supabase anon key for Authorization header
const SUPABASE_ANON_KEY = cleanSecret(process.env.SUPABASE_ANON_KEY)

// Create test client
export function createTestClient(key: keyof typeof TEST_KEYS = 'booklyverse') {
  const apiKey = TEST_KEYS[key]
  if (!apiKey) {
    throw new Error(
      `Missing test API key for "${key}". ` +
      `Set TEST_API_KEY_${key.toUpperCase()} environment variable.\n\n` +
      `Example:\n` +
      `  export TEST_API_KEY_${key.toUpperCase()}=sk_test_real_key_here\n\n` +
      `Or add to your .env.test file:\n` +
      `  TEST_API_KEY_${key.toUpperCase()}=sk_test_real_key_here`
    )
  }
  if (!SUPABASE_ANON_KEY) {
    throw new Error(
      `Missing SUPABASE_ANON_KEY environment variable.\n\n` +
      `Add to your .env.test file:\n` +
      `  SUPABASE_ANON_KEY=eyJ...`
    )
  }
  return new SoledgicTestClient(apiKey, SUPABASE_ANON_KEY)
}
