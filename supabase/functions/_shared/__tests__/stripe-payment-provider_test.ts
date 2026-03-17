import { assertEquals, assertExists } from 'https://deno.land/std@0.224.0/testing/asserts.ts'
import { StripePaymentProvider } from '../stripe-payment-provider.ts'
import { resolvePaymentProviderBackend, getPaymentProvider } from '../payment-provider.ts'

// ==========================================================================
// resolvePaymentProviderBackend
// ==========================================================================

Deno.test('resolvePaymentProviderBackend: defaults to stripe', () => {
  const orig = Deno.env.get('PAYMENT_PROVIDER')
  Deno.env.delete('PAYMENT_PROVIDER')
  try {
    assertEquals(resolvePaymentProviderBackend(), 'stripe')
  } finally {
    if (orig) Deno.env.set('PAYMENT_PROVIDER', orig)
  }
})

Deno.test('resolvePaymentProviderBackend: respects "finix"', () => {
  const orig = Deno.env.get('PAYMENT_PROVIDER')
  Deno.env.set('PAYMENT_PROVIDER', 'finix')
  try {
    assertEquals(resolvePaymentProviderBackend(), 'finix')
  } finally {
    if (orig) Deno.env.set('PAYMENT_PROVIDER', orig)
    else Deno.env.delete('PAYMENT_PROVIDER')
  }
})

Deno.test('resolvePaymentProviderBackend: respects "stripe"', () => {
  const orig = Deno.env.get('PAYMENT_PROVIDER')
  Deno.env.set('PAYMENT_PROVIDER', 'stripe')
  try {
    assertEquals(resolvePaymentProviderBackend(), 'stripe')
  } finally {
    if (orig) Deno.env.set('PAYMENT_PROVIDER', orig)
    else Deno.env.delete('PAYMENT_PROVIDER')
  }
})

Deno.test('resolvePaymentProviderBackend: case-insensitive', () => {
  const orig = Deno.env.get('PAYMENT_PROVIDER')
  Deno.env.set('PAYMENT_PROVIDER', 'FINIX')
  try {
    assertEquals(resolvePaymentProviderBackend(), 'finix')
  } finally {
    if (orig) Deno.env.set('PAYMENT_PROVIDER', orig)
    else Deno.env.delete('PAYMENT_PROVIDER')
  }
})

// ==========================================================================
// getPaymentProvider factory — returns StripePaymentProvider when configured
// ==========================================================================

Deno.test('getPaymentProvider: returns StripePaymentProvider when PAYMENT_PROVIDER=stripe', () => {
  const orig = Deno.env.get('PAYMENT_PROVIDER')
  Deno.env.set('PAYMENT_PROVIDER', 'stripe')
  try {
    const provider = getPaymentProvider('card')
    assertEquals(typeof provider.createPaymentIntent, 'function')
    assertEquals(typeof provider.capturePayment, 'function')
    assertEquals(typeof provider.refund, 'function')
    assertEquals(typeof provider.getPaymentStatus, 'function')
  } finally {
    if (orig) Deno.env.set('PAYMENT_PROVIDER', orig)
    else Deno.env.delete('PAYMENT_PROVIDER')
  }
})

Deno.test('getPaymentProvider: returns CardPaymentProvider when PAYMENT_PROVIDER=finix', () => {
  const orig = Deno.env.get('PAYMENT_PROVIDER')
  Deno.env.set('PAYMENT_PROVIDER', 'finix')
  try {
    const provider = getPaymentProvider('card')
    assertEquals(typeof provider.createPaymentIntent, 'function')
  } finally {
    if (orig) Deno.env.set('PAYMENT_PROVIDER', orig)
    else Deno.env.delete('PAYMENT_PROVIDER')
  }
})

// ==========================================================================
// StripePaymentProvider — createPaymentIntent (charge flow)
// ==========================================================================

Deno.test('StripePaymentProvider: createPaymentIntent requires payment_method_id for charges', async () => {
  const provider = new StripePaymentProvider()
  const result = await provider.createPaymentIntent({
    amount: 1000,
    currency: 'USD',
    metadata: {},
  })
  assertEquals(result.success, false)
  assertEquals(result.provider, 'card')
  assertEquals(result.error, 'payment_method_id is required for charge flows')
})

// ==========================================================================
// StripePaymentProvider — createPaymentIntent fails without STRIPE_SECRET_KEY
// ==========================================================================

Deno.test('StripePaymentProvider: createPaymentIntent fails without secret key', async () => {
  const origKey = Deno.env.get('STRIPE_SECRET_KEY')
  Deno.env.delete('STRIPE_SECRET_KEY')
  try {
    const provider = new StripePaymentProvider()
    const result = await provider.createPaymentIntent({
      amount: 1000,
      currency: 'USD',
      metadata: {},
      payment_method_id: 'pm_test_123',
    })
    assertEquals(result.success, false)
    assertExists(result.error)
  } finally {
    if (origKey) Deno.env.set('STRIPE_SECRET_KEY', origKey)
  }
})

// ==========================================================================
// StripePaymentProvider — refund fails without secret key
// ==========================================================================

Deno.test('StripePaymentProvider: refund fails without secret key', async () => {
  const origKey = Deno.env.get('STRIPE_SECRET_KEY')
  Deno.env.delete('STRIPE_SECRET_KEY')
  try {
    const provider = new StripePaymentProvider()
    const result = await provider.refund({
      payment_intent_id: 'pi_test_123',
    })
    assertEquals(result.success, false)
    assertExists(result.error)
  } finally {
    if (origKey) Deno.env.set('STRIPE_SECRET_KEY', origKey)
  }
})

// ==========================================================================
// StripePaymentProvider — getPaymentStatus fails without secret key
// ==========================================================================

Deno.test('StripePaymentProvider: getPaymentStatus fails without secret key', async () => {
  const origKey = Deno.env.get('STRIPE_SECRET_KEY')
  Deno.env.delete('STRIPE_SECRET_KEY')
  try {
    const provider = new StripePaymentProvider()
    const result = await provider.getPaymentStatus('pi_test_123')
    assertEquals(result.success, false)
    assertExists(result.error)
  } finally {
    if (origKey) Deno.env.set('STRIPE_SECRET_KEY', origKey)
  }
})

// ==========================================================================
// StripePaymentProvider — capturePayment fails without secret key
// ==========================================================================

Deno.test('StripePaymentProvider: capturePayment fails without secret key', async () => {
  const origKey = Deno.env.get('STRIPE_SECRET_KEY')
  Deno.env.delete('STRIPE_SECRET_KEY')
  try {
    const provider = new StripePaymentProvider()
    const result = await provider.capturePayment('pi_test_123')
    assertEquals(result.success, false)
    assertExists(result.error)
  } finally {
    if (origKey) Deno.env.set('STRIPE_SECRET_KEY', origKey)
  }
})
