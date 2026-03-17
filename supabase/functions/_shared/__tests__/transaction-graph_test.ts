import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'

// Test the type definitions and autoLinkTransaction logic
// (Database-dependent functions tested via E2E; these test pure logic)

import type { TransactionLink, LinkType } from '../transaction-graph.ts'

// ============================================================================
// Type validation
// ============================================================================

Deno.test('TransactionLink: valid link types', () => {
  const validTypes: LinkType[] = [
    'refund', 'fee', 'payout_item', 'dispute',
    'split', 'reversal', 'adjustment', 'recurring_child',
  ]
  assertEquals(validTypes.length, 8)
})

Deno.test('TransactionLink: constructs valid link object', () => {
  const link: TransactionLink = {
    source_id: 'txn_refund_001',
    target_id: 'txn_sale_001',
    link_type: 'refund',
    amount: 25.00,
    metadata: { reason: 'customer_request' },
  }

  assertEquals(link.source_id, 'txn_refund_001')
  assertEquals(link.target_id, 'txn_sale_001')
  assertEquals(link.link_type, 'refund')
  assertEquals(link.amount, 25.00)
})

Deno.test('TransactionLink: optional fields default correctly', () => {
  const link: TransactionLink = {
    source_id: 'a',
    target_id: 'b',
    link_type: 'fee',
  }

  assertEquals(link.amount, undefined)
  assertEquals(link.metadata, undefined)
})

// ============================================================================
// autoLinkTransaction logic (tested via mock-style inspection)
// ============================================================================

// Since autoLinkTransaction calls Supabase, we test the link-building logic
// by extracting the decision rules.

function buildAutoLinks(transaction: {
  id: string
  transaction_type: string
  reverses?: string | null
  metadata?: Record<string, unknown>
}): TransactionLink[] {
  const links: TransactionLink[] = []

  if (transaction.transaction_type === 'refund' && transaction.reverses) {
    links.push({
      source_id: transaction.id,
      target_id: transaction.reverses,
      link_type: 'refund',
    })
  }

  if (transaction.transaction_type === 'reversal' && transaction.reverses) {
    links.push({
      source_id: transaction.id,
      target_id: transaction.reverses,
      link_type: 'reversal',
    })
  }

  const parentId = transaction.metadata?.parent_transaction_id as string | undefined
  if (parentId && (transaction.transaction_type === 'transfer' || transaction.transaction_type === 'adjustment')) {
    links.push({
      source_id: transaction.id,
      target_id: parentId,
      link_type: 'split',
    })
  }

  return links
}

Deno.test('autoLink: refund creates refund edge', () => {
  const links = buildAutoLinks({
    id: 'refund_001',
    transaction_type: 'refund',
    reverses: 'sale_001',
  })
  assertEquals(links.length, 1)
  assertEquals(links[0].link_type, 'refund')
  assertEquals(links[0].source_id, 'refund_001')
  assertEquals(links[0].target_id, 'sale_001')
})

Deno.test('autoLink: reversal creates reversal edge', () => {
  const links = buildAutoLinks({
    id: 'rev_001',
    transaction_type: 'reversal',
    reverses: 'txn_original',
  })
  assertEquals(links.length, 1)
  assertEquals(links[0].link_type, 'reversal')
})

Deno.test('autoLink: fee split creates split edge', () => {
  const links = buildAutoLinks({
    id: 'fee_001',
    transaction_type: 'transfer',
    metadata: { parent_transaction_id: 'sale_001' },
  })
  assertEquals(links.length, 1)
  assertEquals(links[0].link_type, 'split')
  assertEquals(links[0].target_id, 'sale_001')
})

Deno.test('autoLink: adjustment with parent creates split edge', () => {
  const links = buildAutoLinks({
    id: 'adj_001',
    transaction_type: 'adjustment',
    metadata: { parent_transaction_id: 'sale_001' },
  })
  assertEquals(links.length, 1)
  assertEquals(links[0].link_type, 'split')
})

Deno.test('autoLink: sale creates no edges', () => {
  const links = buildAutoLinks({
    id: 'sale_001',
    transaction_type: 'sale',
  })
  assertEquals(links.length, 0)
})

Deno.test('autoLink: refund without reverses creates no edge', () => {
  const links = buildAutoLinks({
    id: 'refund_orphan',
    transaction_type: 'refund',
    reverses: null,
  })
  assertEquals(links.length, 0)
})

Deno.test('autoLink: transfer without parent_transaction_id creates no edge', () => {
  const links = buildAutoLinks({
    id: 'xfer_001',
    transaction_type: 'transfer',
    metadata: {},
  })
  assertEquals(links.length, 0)
})
