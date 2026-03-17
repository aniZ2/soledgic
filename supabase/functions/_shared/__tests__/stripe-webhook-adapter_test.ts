import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'
import { StripeWebhookAdapter } from '../stripe-webhook-adapter.ts'
import type { ProcessorWebhookInboxRow } from '../processor-webhook-adapters.ts'

function makeRow(overrides: Partial<ProcessorWebhookInboxRow> = {}): ProcessorWebhookInboxRow {
  return {
    id: 'row-1',
    received_at: '2026-01-01T00:00:00Z',
    ledger_id: null,
    event_id: 'evt_test_123',
    event_type: 'payment_intent.succeeded',
    resource_id: 'pi_test_abc',
    livemode: false,
    headers: {},
    payload: {},
    attempts: 0,
    ...overrides,
  }
}

const adapter = new StripeWebhookAdapter()

// ============================================================================
// Basic normalization
// ============================================================================

Deno.test('StripeWebhookAdapter: name is "stripe"', () => {
  assertEquals(adapter.name, 'stripe')
})

Deno.test('StripeWebhookAdapter: normalizes payment_intent.succeeded as charge/completed', () => {
  const row = makeRow({
    event_type: 'payment_intent.succeeded',
    payload: {
      id: 'evt_1',
      type: 'payment_intent.succeeded',
      livemode: false,
      created: 1700000000,
      data: {
        object: {
          id: 'pi_abc',
          status: 'succeeded',
          amount: 5000,
          currency: 'usd',
          metadata: { ledger_id: 'ledger-1' },
        },
      },
    },
  })

  const events = adapter.normalize(row)
  assertEquals(events.length, 1)
  assertEquals(events[0].kind, 'charge')
  assertEquals(events[0].status, 'completed')
  assertEquals(events[0].amount_minor_units, 5000)
  assertEquals(events[0].currency, 'USD')
  assertEquals(events[0].ledger_id, 'ledger-1')
  assertEquals(events[0].resource_id, 'pi_test_abc')
})

Deno.test('StripeWebhookAdapter: normalizes charge.refunded as refund/completed', () => {
  const row = makeRow({
    event_type: 'charge.refunded',
    resource_id: 'ch_test_ref',
    payload: {
      id: 'evt_2',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_test_ref',
          status: 'succeeded',
          amount_refunded: 2500,
          currency: 'usd',
          payment_intent: 'pi_original',
          metadata: {},
        },
      },
    },
  })

  const events = adapter.normalize(row)
  assertEquals(events[0].kind, 'refund')
  assertEquals(events[0].tags['_linked_payment_intent'], 'pi_original')
})

Deno.test('StripeWebhookAdapter: normalizes transfer.created as payout/processing', () => {
  const row = makeRow({
    event_type: 'transfer.created',
    resource_id: 'tr_test_123',
    payload: {
      id: 'evt_3',
      type: 'transfer.created',
      data: {
        object: {
          id: 'tr_test_123',
          amount: 10000,
          currency: 'usd',
          metadata: { soledgic_payout_id: 'payout-1' },
        },
      },
    },
  })

  const events = adapter.normalize(row)
  assertEquals(events[0].kind, 'payout')
  assertEquals(events[0].status, 'processing')
  assertEquals(events[0].amount_minor_units, 10000)
})

Deno.test('StripeWebhookAdapter: normalizes charge.dispute.created as dispute', () => {
  const row = makeRow({
    event_type: 'charge.dispute.created',
    resource_id: 'dp_test_1',
    payload: {
      id: 'evt_4',
      type: 'charge.dispute.created',
      data: {
        object: {
          id: 'dp_test_1',
          amount: 3000,
          currency: 'usd',
          charge: 'ch_disputed',
          payment_intent: 'pi_disputed',
          metadata: {},
        },
      },
    },
  })

  const events = adapter.normalize(row)
  assertEquals(events[0].kind, 'dispute')
  assertEquals(events[0].tags['_linked_charge'], 'ch_disputed')
  assertEquals(events[0].tags['_linked_payment_intent'], 'pi_disputed')
})

Deno.test('StripeWebhookAdapter: extracts ledger_id from soledgic_ledger_id tag', () => {
  const row = makeRow({
    event_type: 'payment_intent.succeeded',
    payload: {
      id: 'evt_5',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_xyz',
          metadata: { soledgic_ledger_id: 'ledger-abc' },
        },
      },
    },
  })

  const events = adapter.normalize(row)
  assertEquals(events[0].ledger_id, 'ledger-abc')
})

Deno.test('StripeWebhookAdapter: falls back to inbox ID when no event_id', () => {
  const row = makeRow({
    event_id: null,
    payload: {},
  })

  const events = adapter.normalize(row)
  assertEquals(events[0].source_event_id, 'inbox:row-1')
})

Deno.test('StripeWebhookAdapter: converts Unix timestamp to ISO', () => {
  const row = makeRow({
    payload: {
      id: 'evt_ts',
      type: 'payment_intent.succeeded',
      created: 1700000000,
      data: {
        object: {
          id: 'pi_ts',
          created: 1700000000,
        },
      },
    },
  })

  const events = adapter.normalize(row)
  assertEquals(events[0].occurred_at, '2023-11-14T22:13:20.000Z')
})

Deno.test('StripeWebhookAdapter: payment_intent.payment_failed → charge/failed', () => {
  const row = makeRow({
    event_type: 'payment_intent.payment_failed',
    payload: {
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: 'pi_fail',
          status: 'requires_payment_method',
          amount: 1000,
          currency: 'usd',
        },
      },
    },
  })

  const events = adapter.normalize(row)
  assertEquals(events[0].kind, 'charge')
  assertEquals(events[0].status, 'failed')
})

// ============================================================================
// Adapter factory integration
// ============================================================================

Deno.test('getProcessorWebhookAdapter: returns Stripe adapter when PAYMENT_PROVIDER=stripe', async () => {
  const { getProcessorWebhookAdapter } = await import('../processor-webhook-adapters.ts')
  const origProvider = Deno.env.get('PAYMENT_PROVIDER')
  const origAdapter = Deno.env.get('PROCESSOR_WEBHOOK_ADAPTER')
  Deno.env.set('PAYMENT_PROVIDER', 'stripe')
  Deno.env.delete('PROCESSOR_WEBHOOK_ADAPTER')
  try {
    const adapter = getProcessorWebhookAdapter()
    assertEquals(adapter.name, 'stripe')
  } finally {
    if (origProvider) Deno.env.set('PAYMENT_PROVIDER', origProvider)
    else Deno.env.delete('PAYMENT_PROVIDER')
    if (origAdapter) Deno.env.set('PROCESSOR_WEBHOOK_ADAPTER', origAdapter)
  }
})
