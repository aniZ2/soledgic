-- entry_method: Tracks HOW a transaction entered the ledger.
-- This is the provenance field that lets reconciliation and auditors
-- distinguish processor-verified transactions from manual entries.
--
-- Values:
--   'processor'      — Created by a processor-verified flow (checkout, webhook)
--   'manual'         — Entered manually via dashboard UI or API without processor verification
--   'system'         — Created by system automation (reconciler, auto-repair, scheduled job)
--   'import'         — Bulk-imported from CSV/bank feed

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS entry_method TEXT DEFAULT 'manual'
    CHECK (entry_method IN ('processor', 'manual', 'system', 'import'));

-- Backfill existing transactions:
-- Sales with a checkout reference or processor metadata are processor-verified
UPDATE transactions
  SET entry_method = 'processor'
  WHERE entry_method = 'manual'
    AND transaction_type IN ('sale', 'refund')
    AND (
      reference_id LIKE 'checkout_%'
      OR reference_id LIKE 'charge_%'
      OR reference_id LIKE 'refund_%'
      OR (metadata->>'processor_refund_executed')::boolean = true
      OR metadata->>'processor_transfer_id' IS NOT NULL
      OR metadata->>'auto_booked' IS NOT NULL
    );

-- System-generated entries (reconciler, auto-repair)
UPDATE transactions
  SET entry_method = 'system'
  WHERE entry_method = 'manual'
    AND (
      metadata->>'auto_repaired' IS NOT NULL
      OR metadata->>'reconciled' IS NOT NULL
      OR metadata->>'booked_from' = 'process_processor_inbox'
    );

-- Index for reconciliation queries that filter by entry_method
CREATE INDEX IF NOT EXISTS idx_transactions_entry_method
  ON transactions(ledger_id, entry_method, created_at DESC)
  WHERE entry_method = 'manual';

COMMENT ON COLUMN transactions.entry_method IS
  'Provenance: how this transaction entered the ledger (processor, manual, system, import)';
