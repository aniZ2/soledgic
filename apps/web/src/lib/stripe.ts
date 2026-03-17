// Soledgic: Stripe SDK wrapper for Next.js (server-side)
// Handles customer creation, checkout sessions, billing portal, and invoice queries.

import Stripe from 'stripe'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (_stripe) return _stripe

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured')
  }

  _stripe = new Stripe(secretKey, {
    apiVersion: '2025-02-24.acacia',
    typescript: true,
  })
  return _stripe
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim())
}

// ============================================================================
// Customer management
// ============================================================================

export async function findOrCreateCustomer(params: {
  email: string
  name: string
  organizationId: string
  existingCustomerId?: string | null
}): Promise<Stripe.Customer> {
  const stripe = getStripe()

  // If we already have a customer ID, verify it still exists
  if (params.existingCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(params.existingCustomerId)
      if (!existing.deleted) return existing as Stripe.Customer
    } catch {
      // Customer was deleted or ID is invalid — create a new one
    }
  }

  return stripe.customers.create({
    email: params.email,
    name: params.name,
    metadata: {
      soledgic_organization_id: params.organizationId,
    },
  })
}

// ============================================================================
// Checkout Session (for new subscriptions)
// ============================================================================

export async function createCheckoutSession(params: {
  customerId: string
  priceId: string
  successUrl: string
  cancelUrl: string
  organizationId: string
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe()

  return stripe.checkout.sessions.create({
    customer: params.customerId,
    mode: 'subscription',
    line_items: [{ price: params.priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: {
      soledgic_organization_id: params.organizationId,
    },
  })
}

// ============================================================================
// Billing Portal (self-service management)
// ============================================================================

export async function createBillingPortalSession(params: {
  customerId: string
  returnUrl: string
}): Promise<Stripe.BillingPortal.Session> {
  const stripe = getStripe()

  return stripe.billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl,
  })
}

// ============================================================================
// Subscription management
// ============================================================================

export async function cancelSubscription(
  subscriptionId: string,
  cancelAtPeriodEnd = true
): Promise<Stripe.Subscription> {
  const stripe = getStripe()

  if (cancelAtPeriodEnd) {
    return stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    })
  }

  return stripe.subscriptions.cancel(subscriptionId)
}

export async function resumeSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription> {
  const stripe = getStripe()

  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: false,
  })
}

// ============================================================================
// Invoices & Payment Methods
// ============================================================================

export async function listInvoices(
  customerId: string,
  limit = 12
): Promise<Stripe.Invoice[]> {
  const stripe = getStripe()

  const result = await stripe.invoices.list({
    customer: customerId,
    limit,
  })
  return result.data
}

export async function listPaymentMethods(
  customerId: string
): Promise<Stripe.PaymentMethod[]> {
  const stripe = getStripe()

  const result = await stripe.paymentMethods.list({
    customer: customerId,
    type: 'card',
  })
  return result.data
}

// ============================================================================
// Invoice Items (for metered/overage billing)
// ============================================================================

export async function createInvoiceItem(params: {
  customerId: string
  amount: number
  currency: string
  description: string
  metadata?: Record<string, string>
}): Promise<Stripe.InvoiceItem> {
  const stripe = getStripe()

  return stripe.invoiceItems.create({
    customer: params.customerId,
    amount: params.amount,
    currency: params.currency.toLowerCase(),
    description: params.description,
    metadata: params.metadata,
  })
}
