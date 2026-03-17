// SERVICE_ID: SVC_TRANSACTION_GRAPH
// Soledgic: Transaction relationship graph
// Manages edges between financial events (charge→refund, charge→payout, charge→fee).
// Enables payout batch reconstruction and "where did this money come from" queries.

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ============================================================================
// TYPES
// ============================================================================

export type LinkType =
  | 'refund'          // refund → original sale
  | 'fee'             // fee deduction → parent charge
  | 'payout_item'     // charge → payout batch
  | 'dispute'         // dispute → original charge
  | 'split'           // platform fee split → sale
  | 'reversal'        // generic reversal → reversed txn
  | 'adjustment'      // adjustment → corrected txn
  | 'recurring_child' // recurring instance → parent

export interface TransactionLink {
  source_id: string
  target_id: string
  link_type: LinkType
  amount?: number
  metadata?: Record<string, unknown>
}

export interface GraphNode {
  transaction_id: string
  related_id: string
  link_type: string
  direction: 'outgoing' | 'incoming'
  depth: number
  amount: number | null
}

export interface PayoutBatchResult {
  batch_id: string
  item_count: number
  gross_amount: number
  fee_amount: number
  refund_amount: number
  net_amount: number
  bank_matched: boolean
  matched_bank_transaction_id: string | null
  already_exists?: boolean
}

// ============================================================================
// LINK MANAGEMENT
// ============================================================================

/**
 * Create a directed edge between two transactions.
 * Idempotent — duplicate links are ignored.
 */
export async function createLink(
  supabase: SupabaseClient,
  ledgerId: string,
  link: TransactionLink,
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('transaction_links')
    .upsert(
      {
        ledger_id: ledgerId,
        source_id: link.source_id,
        target_id: link.target_id,
        link_type: link.link_type,
        amount: link.amount ?? null,
        metadata: link.metadata ?? {},
      },
      { onConflict: 'ledger_id,source_id,target_id,link_type' },
    )

  if (error) return { success: false, error: error.message }
  return { success: true }
}

/**
 * Create multiple links in a single batch.
 */
export async function createLinks(
  supabase: SupabaseClient,
  ledgerId: string,
  links: TransactionLink[],
): Promise<{ success: boolean; created: number; error?: string }> {
  if (links.length === 0) return { success: true, created: 0 }

  const rows = links.map((link) => ({
    ledger_id: ledgerId,
    source_id: link.source_id,
    target_id: link.target_id,
    link_type: link.link_type,
    amount: link.amount ?? null,
    metadata: link.metadata ?? {},
  }))

  const { error } = await supabase
    .from('transaction_links')
    .upsert(rows, { onConflict: 'ledger_id,source_id,target_id,link_type' })

  if (error) return { success: false, created: 0, error: error.message }
  return { success: true, created: rows.length }
}

// ============================================================================
// GRAPH QUERIES
// ============================================================================

/**
 * Get all transactions related to a given transaction (bidirectional traversal).
 * Uses the recursive SQL function `get_transaction_graph`.
 */
export async function getTransactionGraph(
  supabase: SupabaseClient,
  ledgerId: string,
  transactionId: string,
  maxDepth = 3,
): Promise<{ nodes: GraphNode[]; error?: string }> {
  const { data, error } = await supabase.rpc('get_transaction_graph', {
    p_transaction_id: transactionId,
    p_ledger_id: ledgerId,
    p_max_depth: maxDepth,
  })

  if (error) return { nodes: [], error: error.message }
  return { nodes: (data as GraphNode[]) || [] }
}

/**
 * Get direct links from/to a transaction (non-recursive, single hop).
 */
export async function getDirectLinks(
  supabase: SupabaseClient,
  ledgerId: string,
  transactionId: string,
): Promise<{ outgoing: TransactionLink[]; incoming: TransactionLink[] }> {
  const [{ data: out }, { data: inc }] = await Promise.all([
    supabase
      .from('transaction_links')
      .select('source_id, target_id, link_type, amount, metadata')
      .eq('ledger_id', ledgerId)
      .eq('source_id', transactionId),
    supabase
      .from('transaction_links')
      .select('source_id, target_id, link_type, amount, metadata')
      .eq('ledger_id', ledgerId)
      .eq('target_id', transactionId),
  ])

  return {
    outgoing: (out || []) as TransactionLink[],
    incoming: (inc || []) as TransactionLink[],
  }
}

// ============================================================================
// PAYOUT BATCH RECONSTRUCTION
// ============================================================================

/**
 * Reconstruct a payout batch: find the charges that make up a processor payout
 * and match the net amount to a bank deposit.
 */
export async function reconstructPayoutBatch(
  supabase: SupabaseClient,
  ledgerId: string,
  processorPayoutId: string,
  arrivalDate: string,
  netAmount: number,
): Promise<{ result: PayoutBatchResult | null; error?: string }> {
  const { data, error } = await supabase.rpc('reconstruct_payout_batch', {
    p_ledger_id: ledgerId,
    p_payout_processor_id: processorPayoutId,
    p_arrival_date: arrivalDate,
    p_net_amount: netAmount,
  })

  if (error) return { result: null, error: error.message }
  return { result: data as PayoutBatchResult }
}

/**
 * Get a payout batch with its items.
 */
export async function getPayoutBatch(
  supabase: SupabaseClient,
  ledgerId: string,
  batchId: string,
): Promise<{
  batch: Record<string, unknown> | null
  items: Record<string, unknown>[]
  error?: string
}> {
  const [{ data: batch, error: batchErr }, { data: items }] = await Promise.all([
    supabase
      .from('payout_batches')
      .select('*')
      .eq('id', batchId)
      .eq('ledger_id', ledgerId)
      .single(),
    supabase
      .from('payout_batch_items')
      .select('*, transaction:transactions(id, description, amount, transaction_type, created_at)')
      .eq('batch_id', batchId)
      .eq('ledger_id', ledgerId)
      .order('created_at'),
  ])

  if (batchErr) return { batch: null, items: [], error: batchErr.message }
  return {
    batch: batch as Record<string, unknown>,
    items: (items || []) as Record<string, unknown>[],
  }
}

// ============================================================================
// AUTO-LINKING (called when transactions are created)
// ============================================================================

/**
 * Automatically create graph edges when a refund, fee, or payout is created.
 * Call this from checkout, refund, and payout handlers.
 */
export async function autoLinkTransaction(
  supabase: SupabaseClient,
  ledgerId: string,
  transaction: {
    id: string
    transaction_type: string
    reverses?: string | null
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  const links: TransactionLink[] = []

  // Refund → original sale (via reverses column)
  if (transaction.transaction_type === 'refund' && transaction.reverses) {
    links.push({
      source_id: transaction.id,
      target_id: transaction.reverses,
      link_type: 'refund',
    })
  }

  // Reversal → reversed transaction
  if (transaction.transaction_type === 'reversal' && transaction.reverses) {
    links.push({
      source_id: transaction.id,
      target_id: transaction.reverses,
      link_type: 'reversal',
    })
  }

  // Fee split → parent sale (via metadata.parent_transaction_id)
  const parentId = transaction.metadata?.parent_transaction_id as string | undefined
  if (parentId && (transaction.transaction_type === 'transfer' || transaction.transaction_type === 'adjustment')) {
    links.push({
      source_id: transaction.id,
      target_id: parentId,
      link_type: 'split',
    })
  }

  if (links.length > 0) {
    await createLinks(supabase, ledgerId, links)
  }
}
