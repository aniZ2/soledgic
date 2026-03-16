import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'
import {
  normalizePaymentProviderName,
  getPaymentProvider,
} from '../payment-provider.ts'

// ==========================================================================
// normalizePaymentProviderName
// ==========================================================================

Deno.test('normalizePaymentProviderName: "card" returns "card"', () => {
  assertEquals(normalizePaymentProviderName('card'), 'card')
})

Deno.test('normalizePaymentProviderName: "processor" returns "card"', () => {
  assertEquals(normalizePaymentProviderName('processor'), 'card')
})

Deno.test('normalizePaymentProviderName: "primary" returns "card"', () => {
  assertEquals(normalizePaymentProviderName('primary'), 'card')
})

Deno.test('normalizePaymentProviderName: case-insensitive', () => {
  assertEquals(normalizePaymentProviderName('CARD'), 'card')
  assertEquals(normalizePaymentProviderName('Processor'), 'card')
  assertEquals(normalizePaymentProviderName('PRIMARY'), 'card')
})

Deno.test('normalizePaymentProviderName: trims whitespace', () => {
  assertEquals(normalizePaymentProviderName('  card  '), 'card')
})

Deno.test('normalizePaymentProviderName: unknown returns null', () => {
  assertEquals(normalizePaymentProviderName('stripe'), null)
  assertEquals(normalizePaymentProviderName(''), null)
  assertEquals(normalizePaymentProviderName(null), null)
  assertEquals(normalizePaymentProviderName(undefined), null)
})

// ==========================================================================
// getPaymentProvider — factory returns valid provider
// ==========================================================================

Deno.test('getPaymentProvider: returns a provider with correct interface', () => {
  const provider = getPaymentProvider('card')
  assertEquals(typeof provider.createPaymentIntent, 'function')
  assertEquals(typeof provider.capturePayment, 'function')
  assertEquals(typeof provider.refund, 'function')
  assertEquals(typeof provider.getPaymentStatus, 'function')
})

// ==========================================================================
// CardPaymentProvider — config validation (no base URL)
// ==========================================================================

Deno.test('createPaymentIntent: fails when base URL is not configured', async () => {
  // Clear env vars to ensure no base URL
  const origBaseUrl = Deno.env.get('PROCESSOR_BASE_URL')
  const origUsername = Deno.env.get('PROCESSOR_USERNAME')
  const origPassword = Deno.env.get('PROCESSOR_PASSWORD')
  Deno.env.delete('PROCESSOR_BASE_URL')
  Deno.env.delete('PROCESSOR_USERNAME')
  Deno.env.delete('PROCESSOR_PASSWORD')

  try {
    const provider = getPaymentProvider('card', { processor: { baseUrl: '' } })
    const result = await provider.createPaymentIntent({
      amount: 1000,
      currency: 'USD',
      metadata: {},
      payment_method_id: 'pm_123',
    })
    assertEquals(result.success, false)
    assertEquals(result.provider, 'card')
    assertEquals(result.error, 'Payment processor base URL is not configured')
  } finally {
    if (origBaseUrl) Deno.env.set('PROCESSOR_BASE_URL', origBaseUrl)
    if (origUsername) Deno.env.set('PROCESSOR_USERNAME', origUsername)
    if (origPassword) Deno.env.set('PROCESSOR_PASSWORD', origPassword)
  }
})

Deno.test('createPaymentIntent: fails when credentials are missing', async () => {
  const origUsername = Deno.env.get('PROCESSOR_USERNAME')
  const origPassword = Deno.env.get('PROCESSOR_PASSWORD')
  Deno.env.delete('PROCESSOR_USERNAME')
  Deno.env.delete('PROCESSOR_PASSWORD')

  try {
    const provider = getPaymentProvider('card', {
      processor: {
        baseUrl: 'https://api.sandbox.example.com',
        username: '',
        password: '',
      },
    })
    const result = await provider.createPaymentIntent({
      amount: 1000,
      currency: 'USD',
      metadata: {},
      payment_method_id: 'pm_123',
    })
    assertEquals(result.success, false)
    assertEquals(result.error, 'Payment processor credentials are not configured')
  } finally {
    if (origUsername) Deno.env.set('PROCESSOR_USERNAME', origUsername)
    if (origPassword) Deno.env.set('PROCESSOR_PASSWORD', origPassword)
  }
})

Deno.test('createPaymentIntent: rejects merchant override', async () => {
  const provider = getPaymentProvider('card', {
    processor: {
      baseUrl: 'https://api.sandbox.example.com',
      username: 'user',
      password: 'pass',
      merchantId: 'merch_1',
    },
  })
  const result = await provider.createPaymentIntent({
    amount: 1000,
    currency: 'USD',
    metadata: {},
    payment_method_id: 'pm_123',
    merchant_id: 'override_merch',
  } as any)
  assertEquals(result.success, false)
  assertEquals(result.error, 'Merchant override is not allowed')
})

Deno.test('createPaymentIntent: fails without payment_method_id or destination_id', async () => {
  const provider = getPaymentProvider('card', {
    processor: {
      baseUrl: 'https://api.sandbox.example.com',
      username: 'user',
      password: 'pass',
      merchantId: 'merch_1',
    },
  })
  const result = await provider.createPaymentIntent({
    amount: 1000,
    currency: 'USD',
    metadata: {},
  })
  assertEquals(result.success, false)
  assertEquals(result.error, 'payment_method_id or destination_id is required')
})

Deno.test('createPaymentIntent: fails without merchant for DEBIT flow', async () => {
  const provider = getPaymentProvider('card', {
    processor: {
      baseUrl: 'https://api.sandbox.example.com',
      username: 'user',
      password: 'pass',
      merchantId: '',
    },
  })
  const result = await provider.createPaymentIntent({
    amount: 1000,
    currency: 'USD',
    metadata: {},
    payment_method_id: 'pm_123',
  })
  assertEquals(result.success, false)
  assertEquals(result.error, 'Payment processor merchant is not configured')
})

Deno.test('capturePayment: returns not-supported', async () => {
  const provider = getPaymentProvider('card')
  const result = await provider.capturePayment('pi_123')
  assertEquals(result.success, false)
  assertEquals(result.error, 'Capture is not supported for this flow')
})

// ==========================================================================
// Refund — validation
// ==========================================================================

Deno.test('refund: fails without payment_intent_id', async () => {
  const provider = getPaymentProvider('card', {
    processor: {
      baseUrl: 'https://api.sandbox.example.com',
      username: 'user',
      password: 'pass',
    },
  })
  const result = await provider.refund({
    payment_intent_id: '',
    reason: 'duplicate',
  })
  assertEquals(result.success, false)
  assertEquals(result.error, 'payment_intent_id is required')
})

// ==========================================================================
// Config env mismatch — sandbox URL with production env
// ==========================================================================

Deno.test('createPaymentIntent: rejects sandbox URL in production env', async () => {
  const provider = getPaymentProvider('card', {
    processor: {
      baseUrl: 'https://api.sandbox.example.com',
      environment: 'production',
      username: 'user',
      password: 'pass',
    },
  })
  const result = await provider.createPaymentIntent({
    amount: 1000,
    currency: 'USD',
    metadata: {},
    payment_method_id: 'pm_123',
  })
  assertEquals(result.success, false)
  assertEquals(
    result.error,
    'Payment processor misconfiguration: production environment cannot use sandbox base URL',
  )
})

Deno.test('createPaymentIntent: rejects production URL in sandbox env', async () => {
  const provider = getPaymentProvider('card', {
    processor: {
      baseUrl: 'https://api.production.example.com',
      environment: 'sandbox',
      username: 'user',
      password: 'pass',
    },
  })
  const result = await provider.createPaymentIntent({
    amount: 1000,
    currency: 'USD',
    metadata: {},
    payment_method_id: 'pm_123',
  })
  assertEquals(result.success, false)
  assertEquals(
    result.error,
    'Payment processor misconfiguration: sandbox environment cannot use production base URL',
  )
})
