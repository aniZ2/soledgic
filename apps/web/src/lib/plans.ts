export interface PlanConfig {
  name: string
  price_monthly: number // cents
  max_ledgers: number
  max_team_members: number
  overage_ledger_price_monthly?: number // cents
  overage_team_member_price_monthly?: number // cents
  features: string[]
  contact_sales?: boolean
}

// Snapshot of the prior multi-tier pricing model. Kept for future experiments.
export const FUTURE_PRICING_SUGGESTION: Record<string, PlanConfig> = {
  pro: {
    name: 'Pro',
    price_monthly: 4900,
    max_ledgers: 3,
    max_team_members: 1,
    features: [
      '3 ledgers',
      'API access',
      'Receipts & reconciliation',
      'Email support',
    ],
  },
  business: {
    name: 'Business',
    price_monthly: 24900,
    max_ledgers: 10,
    max_team_members: 10,
    features: [
      '10 ledgers',
      'Team members (up to 10)',
      'Priority support',
      'Everything in Pro',
    ],
  },
  scale: {
    name: 'Scale',
    price_monthly: 0,
    max_ledgers: -1,
    max_team_members: -1,
    contact_sales: true,
    features: [
      'Unlimited ledgers',
      'Unlimited team members',
      'Dedicated support',
      'SLA guarantee',
    ],
  },
}

// Active plans shown to customers today.
export const PLANS: Record<string, PlanConfig> = {
  pro: {
    name: 'Free',
    price_monthly: 0,
    max_ledgers: 1,
    max_team_members: 1,
    overage_ledger_price_monthly: 2000,
    overage_team_member_price_monthly: 2000,
    features: [
      'Payment processing',
      'Core finance features',
      '1 ledger included',
      '1 team member included',
      '$20/month per additional ledger',
      '$20/month per additional team member',
      'API access',
      'Receipts & reconciliation',
      'Email support',
    ],
  },
}

export function getPlanConfig(planId: string): PlanConfig | undefined {
  return PLANS[planId] ?? FUTURE_PRICING_SUGGESTION[planId]
}
