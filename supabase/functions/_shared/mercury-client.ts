// SERVICE_ID: SVC_MERCURY_CLIENT
//
// Mercury bank API client for ACH payout execution.
// Handles: recipient management, ACH transfers, transaction status.
//
// Auth: Bearer token (Read+Write API key with IP whitelist).
// Env vars: MERCURY_API_KEY, MERCURY_ACCOUNT_ID

const MERCURY_BASE_URL = 'https://api.mercury.com/api/v1'

function getApiKey(): string {
  const key = Deno.env.get('MERCURY_API_KEY')
  if (!key) throw new Error('MERCURY_API_KEY not configured')
  return key
}

function getAccountId(): string {
  const id = Deno.env.get('MERCURY_ACCOUNT_ID')
  if (!id) throw new Error('MERCURY_ACCOUNT_ID not configured')
  return id
}

async function mercuryFetch(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url = `${MERCURY_BASE_URL}${path}`
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${getApiKey()}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  const data = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, data }
}

// ── Recipients ──────────────────────────────────────────────

export interface MercuryRecipient {
  id: string
  name: string
  emails: string[]
  paymentMethod: string // 'ach' | 'domesticWire' | etc
  electronicRoutingInfo?: {
    accountNumber: string
    routingNumber: string
    bankName?: string
    electronicAccountType: 'businessChecking' | 'businessSavings' | 'personalChecking' | 'personalSavings'
  }
}

export interface CreateRecipientInput {
  name: string
  email: string
  accountNumber: string
  routingNumber: string
  accountType?: 'businessChecking' | 'personalChecking' | 'businessSavings' | 'personalSavings'
}

export async function createRecipient(input: CreateRecipientInput): Promise<{ success: boolean; recipientId?: string; error?: string }> {
  const { ok, data } = await mercuryFetch('/recipients', {
    method: 'POST',
    body: {
      name: input.name,
      emails: [input.email],
      paymentMethod: 'ach',
      electronicRoutingInfo: {
        accountNumber: input.accountNumber,
        routingNumber: input.routingNumber,
        electronicAccountType: input.accountType || 'personalChecking',
      },
    },
  })

  if (!ok) {
    const errMsg = typeof data === 'object' && data ? (data as Record<string, unknown>).message || JSON.stringify(data) : 'Failed to create recipient'
    return { success: false, error: String(errMsg) }
  }

  const recipientId = (data as Record<string, unknown>)?.id
  return { success: true, recipientId: String(recipientId) }
}

export async function getRecipient(recipientId: string): Promise<MercuryRecipient | null> {
  const { ok, data } = await mercuryFetch(`/recipients/${recipientId}`)
  if (!ok) return null
  return data as MercuryRecipient
}

export async function listRecipients(): Promise<MercuryRecipient[]> {
  const { ok, data } = await mercuryFetch('/recipients')
  if (!ok) return []
  return (Array.isArray(data) ? data : (data as Record<string, unknown>)?.recipients || []) as MercuryRecipient[]
}

// ── Transactions (ACH Send) ─────────────────────────────────

export interface MercuryTransaction {
  id: string
  status: string // 'pending' | 'sent' | 'cancelled' | 'failed'
  amount: number
  createdAt: string
  postedAt: string | null
  failedAt: string | null
  note: string | null
}

export interface SendACHInput {
  recipientId: string
  amountDollars: number  // major units (e.g. 100.00)
  description: string
  idempotencyKey?: string
}

export async function sendACH(input: SendACHInput): Promise<{ success: boolean; transactionId?: string; status?: string; error?: string }> {
  const accountId = getAccountId()

  const headers: Record<string, string> = {}
  if (input.idempotencyKey) {
    headers['Idempotency-Key'] = input.idempotencyKey
  }

  const { ok, data } = await mercuryFetch(`/account/${accountId}/transactions`, {
    method: 'POST',
    body: {
      recipientId: input.recipientId,
      amount: input.amountDollars,
      note: input.description,
    },
  })

  if (!ok) {
    const errMsg = typeof data === 'object' && data ? (data as Record<string, unknown>).message || JSON.stringify(data) : 'ACH transfer failed'
    return { success: false, error: String(errMsg) }
  }

  const txn = data as Record<string, unknown>
  return {
    success: true,
    transactionId: String(txn.id || ''),
    status: String(txn.status || 'pending'),
  }
}

export async function getTransactionStatus(transactionId: string): Promise<MercuryTransaction | null> {
  const accountId = getAccountId()
  const { ok, data } = await mercuryFetch(`/account/${accountId}/transactions/${transactionId}`)
  if (!ok) return null
  return data as MercuryTransaction
}

// ── Account Balance ─────────────────────────────────────────

export async function getAccountBalance(): Promise<{ available: number; current: number } | null> {
  const accountId = getAccountId()
  const { ok, data } = await mercuryFetch(`/account/${accountId}`)
  if (!ok) return null
  const account = data as Record<string, unknown>
  return {
    available: Number(account.availableBalance || 0),
    current: Number(account.currentBalance || 0),
  }
}
