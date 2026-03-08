import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'
import {
  getProcessorWebhookAdapter,
  type ProcessorWebhookInboxRow,
} from '../processor-webhook-adapters.ts'

function makeRow(overrides: Partial<ProcessorWebhookInboxRow> = {}): ProcessorWebhookInboxRow {
  return {
    id: 'row-1',
    received_at: '2025-01-01T00:00:00Z',
    ledger_id: null,
    event_id: 'evt-1',
    event_type: 'transfer.created',
    resource_id: 'TR123',
    livemode: true,
    headers: {},
    payload: {},
    attempts: 0,
    ...overrides,
  }
}

// ============================================================================
// getProcessorWebhookAdapter
// ============================================================================

Deno.test('getProcessorWebhookAdapter: returns generic adapter by default', () => {
  const adapter = getProcessorWebhookAdapter()
  assertEquals(adapter.name, 'generic_json')
})

// ============================================================================
// GenericJsonAdapter.normalize
// ============================================================================

Deno.test('normalize: extracts basic fields from row', () => {
  const adapter = getProcessorWebhookAdapter()
  const row = makeRow({
    event_id: 'evt-abc',
    event_type: 'transfer.created',
    resource_id: 'TR456',
    livemode: true,
    ledger_id: 'ledger-1',
  })

  const events = adapter.normalize(row)
  assertEquals(events.length, 1)
  assertEquals(events[0].source_event_id, 'evt-abc')
  assertEquals(events[0].source_event_type, 'transfer.created')
  assertEquals(events[0].resource_id, 'TR456')
  assertEquals(events[0].livemode, true)
  assertEquals(events[0].ledger_id, 'ledger-1')
})

Deno.test('normalize: falls back to inbox ID when event_id is null', () => {
  const adapter = getProcessorWebhookAdapter()
  const row = makeRow({ event_id: null })

  const events = adapter.normalize(row)
  assertEquals(events[0].source_event_id, 'inbox:row-1')
})

Deno.test('normalize: classifies charge events by default', () => {
  const adapter = getProcessorWebhookAdapter()
  const row = makeRow({ event_type: 'transfer.created' })

  const events = adapter.normalize(row)
  assertEquals(events[0].kind, 'charge')
})

Deno.test('normalize: classifies dispute events', () => {
  const adapter = getProcessorWebhookAdapter()
  const row = makeRow({ event_type: 'dispute.created' })

  const events = adapter.normalize(row)
  assertEquals(events[0].kind, 'dispute')
})

Deno.test('normalize: classifies refund events by event type', () => {
  const adapter = getProcessorWebhookAdapter()
  const row = makeRow({ event_type: 'refund.created' })

  const events = adapter.normalize(row)
  assertEquals(events[0].kind, 'refund')
})

Deno.test('normalize: classifies reversal from embedded transfer type', () => {
  const adapter = getProcessorWebhookAdapter()
  const row = makeRow({
    event_type: 'transfer.created',
    payload: {
      _embedded: {
        transfers: [{ type: 'REVERSAL', id: 'TR789', amount: 500 }],
      },
    },
  })

  const events = adapter.normalize(row)
  assertEquals(events[0].kind, 'refund')
})

Deno.test('normalize: classifies book_transfer from FEE/ADJUSTMENT types', () => {
  const adapter = getProcessorWebhookAdapter()

  for (const type of ['FEE', 'ADJUSTMENT', 'CUSTOM']) {
    const row = makeRow({
      event_type: 'transfer.created',
      payload: {
        _embedded: {
          transfers: [{ type, id: 'TR000', amount: 100 }],
        },
      },
    })
    const events = adapter.normalize(row)
    assertEquals(events[0].kind, 'book_transfer', `Expected book_transfer for type ${type}`)
  }
})

Deno.test('normalize: extracts amount from embedded resource', () => {
  const adapter = getProcessorWebhookAdapter()
  const row = makeRow({
    payload: {
      _embedded: {
        transfers: [{ amount: 2500, currency: 'USD', state: 'SUCCEEDED', id: 'TR111' }],
      },
    },
  })

  const events = adapter.normalize(row)
  assertEquals(events[0].amount_minor_units, 2500)
  assertEquals(events[0].currency, 'USD')
  assertEquals(events[0].status, 'completed')
})

Deno.test('normalize: maps various status values', () => {
  const adapter = getProcessorWebhookAdapter()

  const statusTests: Array<[string, string]> = [
    ['SUCCEEDED', 'completed'],
    ['SETTLED', 'completed'],
    ['FAILED', 'failed'],
    ['CANCELED', 'failed'],
    ['PENDING', 'processing'],
    ['PROCESSING', 'processing'],
  ]

  for (const [input, expected] of statusTests) {
    const row = makeRow({ payload: { state: input } })
    const events = adapter.normalize(row)
    assertEquals(events[0].status, expected, `Status ${input} should map to ${expected}`)
  }
})

Deno.test('normalize: extracts tags from metadata', () => {
  const adapter = getProcessorWebhookAdapter()
  const row = makeRow({
    payload: {
      metadata: {
        soledgic_payout_id: 'payout-1',
        custom_field: 'value',
      },
    },
  })

  const events = adapter.normalize(row)
  assertEquals(events[0].tags['custom_field'], 'value')
  assertEquals(events[0].kind, 'payout') // tagged as payout via soledgic_payout_id
})

Deno.test('normalize: extracts occurred_at from various payload shapes', () => {
  const adapter = getProcessorWebhookAdapter()
  const timestamp = '2025-06-15T10:30:00.000Z'
  const row = makeRow({ payload: { created_at: timestamp } })

  const events = adapter.normalize(row)
  assertEquals(events[0].occurred_at, timestamp)
})

Deno.test('normalize: handles numeric timestamps', () => {
  const adapter = getProcessorWebhookAdapter()
  const row = makeRow({ payload: { timestamp: 1718444400 } }) // seconds

  const events = adapter.normalize(row)
  assertEquals(typeof events[0].occurred_at, 'string')
})

Deno.test('normalize: preserves raw payload', () => {
  const adapter = getProcessorWebhookAdapter()
  const payload = { test: 'data', nested: { value: 1 } }
  const row = makeRow({ payload })

  const events = adapter.normalize(row)
  assertEquals(events[0].raw, payload)
})
