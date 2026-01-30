import { getStripe, PLANS } from './stripe'
import { createClient } from '@/lib/supabase/server'

/**
 * Get or create a Stripe customer for an organization.
 * Stores the stripe_customer_id on the org row if newly created.
 */
export async function getOrCreateStripeCustomer(
  orgId: string,
  orgName: string,
  email: string
): Promise<string> {
  const supabase = await createClient()

  // Check if org already has a customer
  const { data: org } = await supabase
    .from('organizations')
    .select('stripe_customer_id')
    .eq('id', orgId)
    .single()

  if (org?.stripe_customer_id) {
    return org.stripe_customer_id
  }

  // Create new Stripe customer
  const customer = await getStripe().customers.create({
    name: orgName,
    email,
    metadata: { organization_id: orgId },
  })

  // Store on the org
  await supabase
    .from('organizations')
    .update({ stripe_customer_id: customer.id })
    .eq('id', orgId)

  return customer.id
}

/**
 * Reverse-lookup plan name from a Stripe price ID.
 */
export function planFromPriceId(priceId: string): string | null {
  for (const [planId, config] of Object.entries(PLANS)) {
    if (config.stripe_price_id === priceId) {
      return planId
    }
  }
  return null
}

/**
 * Fetch the user's organization with membership/role check.
 * Returns null if no active membership found.
 */
export async function getUserOrganization(userId: string) {
  const supabase = await createClient()

  const { data: membership } = await supabase
    .from('organization_members')
    .select(`
      role,
      organization:organizations(*)
    `)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single()

  if (!membership?.organization) {
    return null
  }

  return {
    organization: membership.organization as Record<string, any>,
    role: membership.role as string,
    isOwner: membership.role === 'owner',
  }
}
