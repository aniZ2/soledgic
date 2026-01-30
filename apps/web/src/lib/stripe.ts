import Stripe from 'stripe'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-02-24.acacia',
      typescript: true,
    })
  }
  return _stripe
}

export interface PlanConfig {
  name: string
  stripe_price_id: string | null
  price_monthly: number // cents
  max_ledgers: number
  max_team_members: number
  features: string[]
  contact_sales?: boolean
}

export const PLANS: Record<string, PlanConfig> = {
  pro: {
    name: 'Pro',
    stripe_price_id: process.env.STRIPE_PRICE_PRO_MONTHLY || null,
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
    stripe_price_id: process.env.STRIPE_PRICE_BUSINESS_MONTHLY || null,
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
    stripe_price_id: null,
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
