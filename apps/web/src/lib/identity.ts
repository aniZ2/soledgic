export interface IdentityProfile {
  id: string
  email: string
  fullName: string | null
  avatarUrl: string | null
  timezone: string
  dateFormat: string
  currency: string
  onboardingCompleted: boolean
  onboardingStep: number
}

export interface SharedTaxProfile {
  userId: string
  status: string
  legalName: string | null
  taxIdType: string | null
  taxIdLast4: string | null
  businessType: string | null
  address: {
    line1: string | null
    line2: string | null
    city: string | null
    state: string | null
    postalCode: string | null
    country: string | null
  }
  certifiedAt: string | null
}

export interface SharedPayoutProfile {
  userId: string
  status: string
  defaultMethod: string
  schedule: string
  minimumAmount: number
  currency: string
  country: string | null
  payoutsEnabled: boolean
}

export interface LinkedParticipantPortfolioItem {
  linkId: string
  participantId: string
  linkedUserId: string
  linkedAt: string | null
  ledgerId: string
  ledgerName: string | null
  organizationId: string | null
  organizationName: string | null
  ledgerGroupId: string | null
  livemode: boolean
  name: string | null
  email: string | null
  ledgerBalance: number
  heldAmount: number
  availableBalance: number
  currency: string
  linkSource: string | null
}

export interface IdentityPortfolioSummary {
  participantCount: number
  ledgerCount: number
  organizationCount: number
  totalsByCurrency: Array<{
    currency: string
    participantCount: number
    ledgerCount: number
    ledgerBalance: number
    heldAmount: number
    availableBalance: number
  }>
}

export function summarizeIdentityPortfolio(
  participants: LinkedParticipantPortfolioItem[],
): IdentityPortfolioSummary {
  const ledgerIds = new Set<string>()
  const organizationIds = new Set<string>()
  const currencyTotals = new Map<string, {
    currency: string
    participantCount: number
    ledgerIds: Set<string>
    ledgerBalance: number
    heldAmount: number
    availableBalance: number
  }>()

  for (const participant of participants) {
    if (participant.ledgerId) {
      ledgerIds.add(participant.ledgerId)
    }
    if (participant.organizationId) {
      organizationIds.add(participant.organizationId)
    }

    const currency = participant.currency || 'USD'
    const totals = currencyTotals.get(currency) || {
      currency,
      participantCount: 0,
      ledgerIds: new Set<string>(),
      ledgerBalance: 0,
      heldAmount: 0,
      availableBalance: 0,
    }

    totals.participantCount += 1
    if (participant.ledgerId) {
      totals.ledgerIds.add(participant.ledgerId)
    }
    totals.ledgerBalance += participant.ledgerBalance
    totals.heldAmount += participant.heldAmount
    totals.availableBalance += participant.availableBalance
    currencyTotals.set(currency, totals)
  }

  return {
    participantCount: participants.length,
    ledgerCount: ledgerIds.size,
    organizationCount: organizationIds.size,
    totalsByCurrency: Array.from(currencyTotals.values())
      .map((totals) => ({
        currency: totals.currency,
        participantCount: totals.participantCount,
        ledgerCount: totals.ledgerIds.size,
        ledgerBalance: Math.round(totals.ledgerBalance * 100) / 100,
        heldAmount: Math.round(totals.heldAmount * 100) / 100,
        availableBalance: Math.round(totals.availableBalance * 100) / 100,
      }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
  }
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function isParticipantId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{1,100}$/.test(value)
}
