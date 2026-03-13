import { jsonResponse } from './utils.ts'

export type JsonObject = Record<string, unknown>

export function getResourceSegments(req: Request, resourceName: string): string[] {
  const url = new URL(req.url)
  const pathParts = url.pathname.split('/').filter(Boolean)
  const resourceIndex = pathParts.findIndex((part) => part === resourceName)
  return resourceIndex >= 0 ? pathParts.slice(resourceIndex + 1) : []
}

export function asJsonObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as JsonObject
}

export function getBooleanParam(url: URL, name: string): boolean | undefined {
  const raw = url.searchParams.get(name)
  if (raw === null) return undefined
  if (raw === 'true' || raw === '1') return true
  if (raw === 'false' || raw === '0') return false
  return undefined
}

export function getNumberParam(url: URL, name: string): number | undefined {
  const raw = url.searchParams.get(name)
  if (!raw) return undefined

  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

export async function transformJsonResponse(
  req: Request,
  requestId: string,
  response: Response,
  transform?: (source: JsonObject) => JsonObject,
): Promise<Response> {
  const text = await response.text()
  let data: JsonObject = {}

  if (text) {
    try {
      const parsed = JSON.parse(text)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        data = parsed as JsonObject
      } else {
        data = { data: parsed as unknown }
      }
    } catch {
      data = { success: false, error: text }
    }
  }

  const payload = response.ok && transform ? transform(data) : data
  return jsonResponse(payload, response.status, req, requestId)
}

export function mapParticipantSummary(row: JsonObject) {
  return {
    id: row.creator_id,
    name: row.name,
    tier: row.tier,
    ledger_balance: row.ledger_balance,
    held_amount: row.held_amount,
    available_balance: row.available_balance,
  }
}

export function mapParticipantCreateResponse(data: JsonObject): JsonObject {
  const creator = asJsonObject(data.creator) || {}
  return {
    success: data.success,
    participant: {
      id: creator.id,
      account_id: creator.account_id,
      display_name: creator.display_name ?? null,
      email: creator.email ?? null,
      default_split_percent: creator.default_split_percent,
      payout_preferences: creator.payout_preferences ?? {},
      created_at: creator.created_at,
    },
  }
}

export function mapParticipantDetailResponse(data: JsonObject): JsonObject {
  const participant = asJsonObject(data.data) || {}
  return {
    success: data.success,
    participant: {
      id: participant.creator_id,
      name: participant.name,
      tier: participant.tier,
      custom_split_percent: participant.custom_split,
      ledger_balance: participant.ledger_balance,
      held_amount: participant.held_amount,
      available_balance: participant.available_balance,
      holds: Array.isArray(participant.holds) ? participant.holds : [],
    },
  }
}

export function mapPayoutEligibilityResponse(data: JsonObject): JsonObject {
  return {
    success: data.success,
    eligibility: {
      participant_id: data.creator_id,
      eligible: data.eligible,
      available_balance: data.available_balance,
      issues: data.issues ?? [],
      requirements: data.requirements ?? {},
    },
  }
}

export function mapWalletAccount(account: unknown) {
  if (!account || typeof account !== 'object' || Array.isArray(account)) {
    return null
  }

  const row = account as JsonObject
  return {
    id: row.id,
    participant_id: row.entity_id,
    name: row.name,
    is_active: row.is_active,
    created_at: row.created_at,
  }
}

export function mapWalletResponse(data: JsonObject, participantId: string): JsonObject {
  return {
    success: data.success,
    wallet: {
      participant_id: participantId,
      balance: data.balance,
      wallet_exists: data.wallet_exists,
      account: mapWalletAccount(data.account),
    },
  }
}

export function mapWalletEntriesResponse(data: JsonObject): JsonObject {
  return {
    success: data.success,
    entries: Array.isArray(data.transactions) ? data.transactions : [],
    total: data.total ?? 0,
    limit: data.limit ?? 25,
    offset: data.offset ?? 0,
  }
}

export function mapWalletMutationResponse(
  data: JsonObject,
  participantId: string,
  key: 'deposit' | 'withdrawal',
): JsonObject {
  return {
    success: data.success,
    [key]: {
      participant_id: participantId,
      transaction_id: data.transaction_id,
      balance: data.balance,
    },
  }
}

export function mapTransferResponse(data: JsonObject, body: JsonObject): JsonObject {
  return {
    success: data.success,
    transfer: {
      transaction_id: data.transaction_id,
      from_participant_id: body.from_participant_id ?? null,
      to_participant_id: body.to_participant_id ?? null,
      from_balance: data.from_balance,
      to_balance: data.to_balance,
    },
  }
}

export function mapHoldRow(row: JsonObject) {
  return {
    id: row.entry_id,
    participant_id: row.recipient_id,
    participant_name: row.recipient_name,
    amount: row.amount,
    currency: row.currency,
    held_since: row.held_since,
    days_held: row.days_held,
    hold_reason: row.hold_reason,
    hold_until: row.hold_until,
    ready_for_release: row.ready_for_release,
    release_status: row.release_status,
    transaction_reference: row.transaction_ref,
    product_name: row.product_name,
    venture_id: row.venture_id,
    connected_account_ready: row.has_connected_account,
  }
}

export function mapHoldListResponse(data: JsonObject): JsonObject {
  return {
    success: data.success,
    holds: Array.isArray(data.data)
      ? data.data.map((row) => mapHoldRow(asJsonObject(row) || {}))
      : [],
    count: data.count ?? 0,
  }
}

export function mapHoldSummaryResponse(data: JsonObject): JsonObject {
  return {
    success: data.success,
    summary: data.summary ?? {},
  }
}

export function mapHoldReleaseResponse(data: JsonObject): JsonObject {
  return {
    success: data.success,
    release: {
      id: data.release_id,
      hold_id: data.entry_id,
      executed: data.executed,
      transfer_id: data.transfer_id,
      transfer_status: data.transfer_status,
      amount: data.amount,
      currency: data.currency,
    },
  }
}

export function mapCheckoutSessionResponse(data: JsonObject): JsonObject {
  return {
    success: data.success,
    checkout_session: {
      id: data.session_id ?? data.payment_id ?? data.payment_intent_id,
      mode: data.mode,
      provider: data.provider ?? null,
      client_secret: data.client_secret ?? null,
      checkout_url: data.checkout_url ?? null,
      payment_id: data.payment_id ?? null,
      payment_intent_id: data.payment_intent_id ?? null,
      status: data.status ?? null,
      requires_action: Boolean(data.requires_action),
      amount: data.amount,
      currency: data.currency,
      expires_at: data.expires_at ?? null,
      breakdown: data.breakdown ?? null,
    },
  }
}

export function mapPayoutResponse(data: JsonObject): JsonObject {
  const breakdown = asJsonObject(data.breakdown) || {}
  return {
    success: data.success,
    payout: {
      id: data.transaction_id,
      transaction_id: data.transaction_id,
      gross_amount: breakdown.gross_payout ?? null,
      fees: breakdown.fees ?? null,
      net_amount: breakdown.net_to_creator ?? null,
      previous_balance: data.previous_balance ?? null,
      new_balance: data.new_balance ?? null,
    },
  }
}

export function mapRefundResponse(data: JsonObject): JsonObject {
  return {
    success: data.success,
    refund: {
      id: data.transaction_id,
      transaction_id: data.transaction_id,
      refunded_amount: data.refunded_amount,
      breakdown: data.breakdown ?? null,
      is_full_refund: data.is_full_refund ?? null,
    },
  }
}
