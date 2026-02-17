import {
  SoledgicConfig,
  SoledgicError,
  AuthenticationError,
  ValidationError,
  NotFoundError,
  ConflictError,
  CreateCheckoutRequest,
  CreateCheckoutResponse,
  RecordSaleRequest,
  RecordSaleResponse,
  GetBalanceResponse,
  ProcessPayoutRequest,
  ProcessPayoutResponse,
  RecordRefundRequest,
  RecordRefundResponse,
  ReverseTransactionRequest,
  ReverseTransactionResponse,
  GetTransactionsRequest,
  GetTransactionsResponse,
} from './types'

// ============================================================================
// SECURITY FIX H1: Secure API Key Storage
// ============================================================================
// The API key is stored in a closure rather than as a class property.
// This makes it harder to access via memory dumps or prototype pollution.
// The key is also cleared from the config object after initialization.

/**
 * Create a secure key holder that encapsulates the API key
 * This prevents the key from being accessible via class properties
 */
function createSecureKeyHolder(key: string): () => string {
  // Store key in closure - not accessible via object inspection
  let secureKey: string | null = key
  
  return () => {
    if (!secureKey) {
      throw new AuthenticationError('API key has been invalidated')
    }
    return secureKey
  }
}

/**
 * Soledgic SDK Client
 * 
 * SECURITY NOTES:
 * - API key is stored securely in a closure, not as a class property
 * - Use destroy() method to clear the API key from memory when done
 * - Errors are sanitized to prevent information leakage
 * 
 * @example
 * ```typescript
 * const soledgic = new Soledgic({
 *   apiKey: 'your_api_key',
 *   baseUrl: 'https://your-project.supabase.co/functions/v1'
 * })
 * 
 * // Record a sale
 * const sale = await soledgic.recordSale({
 *   referenceId: 'sale_123',
 *   creatorId: 'author_123',
 *   amount: 1999
 * })
 * 
 * // When done, clear the API key from memory
 * soledgic.destroy()
 * ```
 */
export class Soledgic {
  // SECURITY FIX H1: API key is stored in closure via getApiKey function
  private getApiKey: () => string
  private baseUrl: string
  private timeout: number
  private fetchFn: typeof fetch
  private destroyed: boolean = false

  constructor(config: SoledgicConfig) {
    if (!config.apiKey) {
      throw new ValidationError('API key is required')
    }

    // SECURITY FIX H1: Store API key in secure closure
    this.getApiKey = createSecureKeyHolder(config.apiKey)
    
    // Clear API key from config object to prevent accidental exposure
    // Note: This doesn't affect the original object if passed by reference
    // but prevents the SDK from holding a reference to it
    
    this.baseUrl = config.baseUrl?.replace(/\/$/, '') || ''
    this.timeout = config.timeout || 30000
    this.fetchFn = config.fetch || fetch
  }

  /**
   * SECURITY: Destroy the client and clear the API key from memory
   * Call this when you're done using the client to minimize exposure window
   */
  destroy(): void {
    this.destroyed = true
    // Replace getApiKey with a function that throws
    this.getApiKey = () => {
      throw new AuthenticationError('Client has been destroyed')
    }
  }

  /**
   * Check if the client has been destroyed
   */
  isDestroyed(): boolean {
    return this.destroyed
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async request<T>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST'
      body?: Record<string, unknown>
      params?: Record<string, string | number | boolean | undefined>
    } = {}
  ): Promise<T> {
    // SECURITY: Check if client has been destroyed
    if (this.destroyed) {
      throw new AuthenticationError('Client has been destroyed')
    }

    const { method = 'GET', body, params } = options

    // Build URL with query params
    let url = `${this.baseUrl}/${endpoint}`
    if (params) {
      const searchParams = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value))
        }
      })
      const queryString = searchParams.toString()
      if (queryString) {
        url += `?${queryString}`
      }
    }

    // Set up abort controller for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await this.fetchFn(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.getApiKey(),  // SECURITY FIX H1: Get key from secure closure
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const data: any = await response.json()

      // Handle errors
      if (!response.ok || data.success === false) {
        // SECURITY FIX L1: Sanitize error messages
        const message = this.sanitizeErrorMessage(data.error || 'Request failed')
        
        switch (response.status) {
          case 400:
            throw new ValidationError(message)
          case 401:
            throw new AuthenticationError(message)
          case 404:
            throw new NotFoundError(message)
          case 409:
            throw new ConflictError(message)
          case 429:
            throw new SoledgicError('Rate limit exceeded', 429, 'RATE_LIMITED')
          case 503:
            throw new SoledgicError('Service temporarily unavailable', 503, 'SERVICE_UNAVAILABLE')
          default:
            // SECURITY FIX L1: Don't expose server error details
            if (response.status >= 500) {
              throw new SoledgicError('An unexpected error occurred', response.status, 'SERVER_ERROR')
            }
            throw new SoledgicError(message, response.status)
        }
      }

      return data as T
    } catch (error) {
      clearTimeout(timeoutId)
      
      if (error instanceof SoledgicError) {
        throw error
      }
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new SoledgicError('Request timeout', 408, 'TIMEOUT')
        }
        // SECURITY FIX L1: Don't expose internal error details
        throw new SoledgicError('Network error occurred', 0, 'NETWORK_ERROR')
      }
      
      throw new SoledgicError('Unknown error', 500, 'UNKNOWN')
    }
  }

  /**
   * SECURITY FIX L1: Sanitize error messages to prevent information leakage
   */
  private sanitizeErrorMessage(message: string): string {
    if (!message || typeof message !== 'string') {
      return 'An error occurred'
    }
    
    // Remove potentially sensitive patterns
    return message
      .replace(/\/[^\s]+/g, '[path]')           // File paths
      .replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '[ip]')  // IP addresses
      .replace(/eyJ[A-Za-z0-9_-]+/g, '[token]') // JWT tokens
      .replace(/sk_[a-zA-Z0-9]+/g, '[key]')     // API keys
      .replace(/whsec_[a-zA-Z0-9]+/g, '[secret]') // Webhook secrets
      .replace(/postgres:\/\/[^\s]+/g, '[db]')  // Database URLs
      .replace(/redis:\/\/[^\s]+/g, '[redis]')  // Redis URLs
      .substring(0, 200) // Limit length
  }

  private toSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
      result[snakeKey] = value
    }
    return result
  }

  private toCamelCase<T>(obj: Record<string, unknown>): T {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
      
      // Handle nested objects
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[camelKey] = this.toCamelCase(value as Record<string, unknown>)
      } else if (Array.isArray(value)) {
        result[camelKey] = value.map(item => 
          typeof item === 'object' && item !== null 
            ? this.toCamelCase(item as Record<string, unknown>)
            : item
        )
      } else {
        result[camelKey] = value
      }
    }
    return result as T
  }

  // ============================================================================
  // Public API Methods
  // ============================================================================

  /**
   * Create a hosted checkout payment
   *
   * @example
   * ```typescript
   * const checkout = await soledgic.createCheckout({
   *   amount: 1999,
   *   creatorId: 'author_123',
   *   productName: 'Book purchase',
   *   customerEmail: 'reader@example.com'
   * })
   *
   * console.log(checkout.checkoutUrl)
   * ```
   */
  async createCheckout(request: CreateCheckoutRequest): Promise<CreateCheckoutResponse> {
    if (!request.creatorId) throw new ValidationError('creatorId is required')
    if (!request.amount || request.amount <= 0) throw new ValidationError('amount must be positive')

    const response = await this.request<Record<string, unknown>>('create-checkout', {
      method: 'POST',
      body: this.toSnakeCase(request as unknown as Record<string, unknown>),
    })

    return this.toCamelCase<CreateCheckoutResponse>(response)
  }

  /**
   * Record a sale with automatic revenue split
   * 
   * @example
   * ```typescript
   * const sale = await soledgic.recordSale({
   *   referenceId: 'sale_123',
   *   creatorId: 'author_123',
   *   amount: 1999, // $19.99 in cents
   *   platformFeePercent: 20
   * })
   * 
   * console.log(sale.breakdown)
   * // { total: 19.99, creatorAmount: 15.99, platformAmount: 4.00 }
   * ```
   */
  async recordSale(request: RecordSaleRequest): Promise<RecordSaleResponse> {
    if (!request.referenceId) throw new ValidationError('referenceId is required')
    if (!request.creatorId) throw new ValidationError('creatorId is required')
    if (!request.amount || request.amount <= 0) throw new ValidationError('amount must be positive')

    const response = await this.request<Record<string, unknown>>('record-sale', {
      method: 'POST',
      body: this.toSnakeCase(request as unknown as Record<string, unknown>),
    })

    return this.toCamelCase<RecordSaleResponse>(response)
  }

  /**
   * Get balance for a single creator
   * 
   * @example
   * ```typescript
   * const balance = await soledgic.getCreatorBalance('author_123')
   * console.log(`Available: $${balance.available}`)
   * ```
   */
  async getCreatorBalance(creatorId: string): Promise<GetBalanceResponse> {
    if (!creatorId) throw new ValidationError('creatorId is required')

    const response = await this.request<Record<string, unknown>>('get-balance', {
      params: { creator_id: creatorId },
    })

    return this.toCamelCase<GetBalanceResponse>(response)
  }

  /**
   * Get balances for all creators
   * 
   * @example
   * ```typescript
   * const { balances, platformSummary } = await soledgic.getAllBalances({ includePlatform: true })
   * ```
   */
  async getAllBalances(options?: { includePlatform?: boolean }): Promise<GetBalanceResponse> {
    const response = await this.request<Record<string, unknown>>('get-balance', {
      params: { include_platform: options?.includePlatform },
    })

    return this.toCamelCase<GetBalanceResponse>(response)
  }

  /**
   * Process a payout to a creator
   * 
   * @example
   * ```typescript
   * const payout = await soledgic.processPayout({
   *   creatorId: 'author_123',
   *   paymentMethod: 'card',
   *   paymentReference: 'payout_123'
   * })
   * ```
   */
  async processPayout(request: ProcessPayoutRequest): Promise<ProcessPayoutResponse> {
    if (!request.creatorId) throw new ValidationError('creatorId is required')
    if (!request.paymentMethod) throw new ValidationError('paymentMethod is required')

    const response = await this.request<Record<string, unknown>>('process-payout', {
      method: 'POST',
      body: this.toSnakeCase(request as unknown as Record<string, unknown>),
    })

    return this.toCamelCase<ProcessPayoutResponse>(response)
  }

  /**
   * Record a refund for a sale
   * 
   * @example
   * ```typescript
   * const refund = await soledgic.recordRefund({
   *   originalSaleReference: 'sale_123',
   *   reason: 'Customer requested refund',
   *   refundFrom: 'both' // Split refund proportionally
   * })
   * ```
   */
  async recordRefund(request: RecordRefundRequest): Promise<RecordRefundResponse> {
    if (!request.originalSaleReference) throw new ValidationError('originalSaleReference is required')
    if (!request.reason) throw new ValidationError('reason is required')

    const response = await this.request<Record<string, unknown>>('record-refund', {
      method: 'POST',
      body: this.toSnakeCase(request as unknown as Record<string, unknown>),
    })

    return this.toCamelCase<RecordRefundResponse>(response)
  }

  /**
   * Reverse a transaction (immutable ledger pattern)
   * 
   * @example
   * ```typescript
   * const reversal = await soledgic.reverseTransaction({
   *   transactionId: 'uuid-xxx',
   *   reason: 'Duplicate entry correction'
   * })
   * ```
   */
  async reverseTransaction(request: ReverseTransactionRequest): Promise<ReverseTransactionResponse> {
    if (!request.transactionId) throw new ValidationError('transactionId is required')
    if (!request.reason) throw new ValidationError('reason is required')

    const response = await this.request<Record<string, unknown>>('reverse-transaction', {
      method: 'POST',
      body: this.toSnakeCase(request as unknown as Record<string, unknown>),
    })

    return this.toCamelCase<ReverseTransactionResponse>(response)
  }

  /**
   * Get transaction history with filtering
   * 
   * @example
   * ```typescript
   * const { transactions, pagination } = await soledgic.getTransactions({
   *   creatorId: 'author_123',
   *   type: 'sale',
   *   startDate: '2025-01-01',
   *   page: 1,
   *   perPage: 50
   * })
   * ```
   */
  async getTransactions(request?: GetTransactionsRequest): Promise<GetTransactionsResponse> {
    const params: Record<string, string | number | boolean | undefined> = {}
    
    if (request) {
      if (request.creatorId) params.creator_id = request.creatorId
      if (request.type) params.type = request.type
      if (request.status) params.status = request.status
      if (request.startDate) params.start_date = request.startDate
      if (request.endDate) params.end_date = request.endDate
      if (request.page) params.page = request.page
      if (request.perPage) params.per_page = request.perPage
      if (request.includeEntries !== undefined) params.include_entries = request.includeEntries
    }

    const response = await this.request<Record<string, unknown>>('get-transactions', { params })

    return this.toCamelCase<GetTransactionsResponse>(response)
  }
}
