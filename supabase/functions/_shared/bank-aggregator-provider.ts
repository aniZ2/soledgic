// Soledgic: Bank Aggregator Provider Abstraction
// Vendor-agnostic interface for bank feed integrations.
// Implementation: Teller (behind "bank_aggregator" abstraction).
// Follows the same pattern as payment-provider.ts.

// ============================================================================
// TYPES
// ============================================================================

export interface ConnectConfigParams {
  ledgerId: string
}

export interface ConnectConfigResult {
  success: boolean
  applicationId?: string
  environment?: string
  error?: string
}

export interface StoreEnrollmentParams {
  accessToken: string
  enrollmentId: string
  institutionName?: string | null
}

export interface StoreEnrollmentResult {
  success: boolean
  accessToken: string
  enrollmentId: string
  error?: string
}

export interface SyncTransactionsParams {
  accessToken: string
  accountId: string
  fromId?: string | null
  startDate?: string | null
}

export interface BankAggregatorTransaction {
  transactionId: string
  accountId: string
  amount: number
  date: string
  name: string
  merchantName?: string | null
  category?: string[]
  pending: boolean
  raw?: Record<string, unknown>
}

export interface SyncTransactionsResult {
  success: boolean
  transactions: BankAggregatorTransaction[]
  lastId?: string | null
  hasMore: boolean
  error?: string
}

export interface BankAggregatorAccount {
  accountId: string
  enrollmentId: string
  name: string
  officialName?: string | null
  type: string
  subtype?: string | null
  mask?: string | null
  currentBalance?: number | null
  availableBalance?: number | null
  institutionName?: string | null
}

export interface GetAccountsParams {
  accessToken: string
}

export interface GetAccountsResult {
  success: boolean
  accounts: BankAggregatorAccount[]
  error?: string
}

export interface RemoveItemParams {
  accessToken: string
}

export interface RemoveItemResult {
  success: boolean
  error?: string
}

// ============================================================================
// INTERFACE
// ============================================================================

export interface BankAggregatorProvider {
  /** Return config needed by the frontend Connect widget. */
  getConnectConfig(params: ConnectConfigParams): ConnectConfigResult

  /** Validate and pass through an enrollment (Teller gives token directly). */
  validateEnrollment(params: StoreEnrollmentParams): StoreEnrollmentResult

  /** Fetch transactions for an account with from_id pagination. */
  syncTransactions(params: SyncTransactionsParams): Promise<SyncTransactionsResult>

  /** List all accounts accessible with the given token. */
  getAccounts(params: GetAccountsParams): Promise<GetAccountsResult>

  /** Get balances for a specific account. */
  getBalances(accessToken: string, accountId: string): Promise<{ current: number | null; available: number | null } | null>

  /** Revoke access to all accounts under this token. */
  removeItem(params: RemoveItemParams): Promise<RemoveItemResult>
}

// ============================================================================
// TELLER IMPLEMENTATION
// ============================================================================

class TellerBankAggregatorProvider implements BankAggregatorProvider {
  private readonly baseUrl = 'https://api.teller.io'
  private appId: string
  private environment: string

  constructor() {
    this.appId = Deno.env.get('BANK_AGGREGATOR_APP_ID') || ''
    this.environment = (Deno.env.get('BANK_AGGREGATOR_ENV') || 'sandbox').toLowerCase()
  }

  /**
   * Make authenticated GET request to Teller API.
   * Teller uses HTTP Basic Auth: access_token as username, empty password.
   */
  private async get<T>(path: string, accessToken: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${btoa(accessToken + ':')}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}))
      throw new Error(
        (errorBody as { error?: { message?: string } }).error?.message ||
          `Teller API error: ${response.status}`,
      )
    }

    return response.json() as Promise<T>
  }

  /**
   * Make authenticated DELETE request to Teller API.
   */
  private async delete(path: string, accessToken: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Basic ${btoa(accessToken + ':')}`,
      },
      signal: AbortSignal.timeout(15000),
    })

    // Teller returns 204 No Content on success
    if (!response.ok && response.status !== 204) {
      const errorBody = await response.json().catch(() => ({}))
      throw new Error(
        (errorBody as { error?: { message?: string } }).error?.message ||
          `Teller API error: ${response.status}`,
      )
    }
  }

  getConnectConfig(_params: ConnectConfigParams): ConnectConfigResult {
    if (!this.appId) {
      return { success: false, error: 'BANK_AGGREGATOR_APP_ID not configured' }
    }

    return {
      success: true,
      applicationId: this.appId,
      environment: this.environment,
    }
  }

  validateEnrollment(params: StoreEnrollmentParams): StoreEnrollmentResult {
    // Teller gives the access token directly from Connect — no server-side exchange.
    // We just validate and pass through.
    if (!params.accessToken || !params.enrollmentId) {
      return { success: false, accessToken: '', enrollmentId: '', error: 'Missing accessToken or enrollmentId' }
    }

    return {
      success: true,
      accessToken: params.accessToken,
      enrollmentId: params.enrollmentId,
    }
  }

  async syncTransactions(params: SyncTransactionsParams): Promise<SyncTransactionsResult> {
    try {
      // Build query string for pagination/filtering
      const queryParams = new URLSearchParams()
      queryParams.set('count', '250') // Max per page
      if (params.fromId) {
        queryParams.set('from_id', params.fromId)
      }
      // Expand date range by 10 days to catch pending→posted date changes
      if (params.startDate) {
        const start = new Date(params.startDate)
        start.setDate(start.getDate() - 10)
        queryParams.set('start_date', start.toISOString().split('T')[0])
      }

      const path = `/accounts/${params.accountId}/transactions?${queryParams.toString()}`

      const transactions = await this.get<Array<{
        id: string
        account_id: string
        amount: string
        date: string
        description: string
        status: string
        type: string
        details?: {
          category?: string
          counterparty?: { name?: string }
        }
      }>>(path, params.accessToken)

      const mapped: BankAggregatorTransaction[] = transactions.map((t) => ({
        transactionId: t.id,
        accountId: t.account_id,
        // Teller amounts are strings; negative = debit, positive = credit
        amount: parseFloat(t.amount),
        date: t.date,
        name: t.description,
        merchantName: t.details?.counterparty?.name || null,
        category: t.details?.category ? [t.details.category] : [],
        pending: t.status === 'pending',
        raw: t as unknown as Record<string, unknown>,
      }))

      const lastId = mapped.length > 0 ? mapped[mapped.length - 1].transactionId : null

      return {
        success: true,
        transactions: mapped,
        lastId,
        // If we got exactly 250, there are likely more
        hasMore: transactions.length >= 250,
      }
    } catch (error: unknown) {
      return {
        success: false,
        transactions: [],
        hasMore: false,
        error: error instanceof Error ? error.message : 'Failed to sync transactions',
      }
    }
  }

  async getAccounts(params: GetAccountsParams): Promise<GetAccountsResult> {
    try {
      const accounts = await this.get<Array<{
        id: string
        enrollment_id: string
        name: string
        type: string
        subtype: string
        currency: string
        last_four: string
        status: string
        institution: {
          id: string
          name: string
        }
      }>>('/accounts', params.accessToken)

      return {
        success: true,
        accounts: accounts.map((a) => ({
          accountId: a.id,
          enrollmentId: a.enrollment_id,
          name: a.name,
          type: a.type,
          subtype: a.subtype,
          mask: a.last_four,
          institutionName: a.institution?.name || null,
          currentBalance: null, // fetched separately via getBalances
          availableBalance: null,
        })),
      }
    } catch (error: unknown) {
      return {
        success: false,
        accounts: [],
        error: error instanceof Error ? error.message : 'Failed to get accounts',
      }
    }
  }

  async getBalances(
    accessToken: string,
    accountId: string,
  ): Promise<{ current: number | null; available: number | null } | null> {
    try {
      const balances = await this.get<{
        account_id: string
        ledger: string | null
        available: string | null
      }>(`/accounts/${accountId}/balances`, accessToken)

      return {
        current: balances.ledger ? parseFloat(balances.ledger) : null,
        available: balances.available ? parseFloat(balances.available) : null,
      }
    } catch {
      return null
    }
  }

  async removeItem(params: RemoveItemParams): Promise<RemoveItemResult> {
    try {
      // DELETE /accounts removes all accounts for the enrollment
      await this.delete('/accounts', params.accessToken)
      return { success: true }
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove enrollment',
      }
    }
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let cachedProvider: BankAggregatorProvider | null = null

export function getBankAggregatorProvider(): BankAggregatorProvider {
  if (!cachedProvider) {
    cachedProvider = new TellerBankAggregatorProvider()
  }
  return cachedProvider
}
