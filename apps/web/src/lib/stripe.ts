import Stripe from 'stripe'
export { FUTURE_PRICING_SUGGESTION, PLANS, getPlanConfig, type PlanConfig } from './plans'

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
