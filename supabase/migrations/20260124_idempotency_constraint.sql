-- Soledgic: Idempotency Fix for Record Sale
-- Adds unique constraint on (ledger_id, reference_id) to prevent race conditions
-- Date: December 23, 2024

-- Add unique constraint for idempotency
-- This prevents duplicate transactions from being created in race conditions
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_ledger_reference_unique 
  ON transactions(ledger_id, reference_id) 
  WHERE reference_id IS NOT NULL;

COMMENT ON INDEX idx_transactions_ledger_reference_unique IS 
  'Ensures idempotency - prevents duplicate transactions with same reference_id per ledger';

-- Also add an index for faster duplicate lookups
CREATE INDEX IF NOT EXISTS idx_transactions_reference_id_ledger 
  ON transactions(ledger_id, reference_id) 
  WHERE reference_id IS NOT NULL;
