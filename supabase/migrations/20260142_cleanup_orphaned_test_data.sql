-- Soledgic: Cleanup orphaned transactions from pre-fix era
-- These are test data from stress tests that hit the C2 bug (non-atomic inserts)
-- Safe to delete as they are all from ledger 0a885204-e07a-48c1-97e9-495ac96a2581

-- Step 1: Delete unbalanced entries (they're from buggy trigger)
DELETE FROM entries 
WHERE transaction_id IN (
  SELECT id FROM transactions 
  WHERE reference_id LIKE 'first_light_%'
    AND ledger_id = '0a885204-e07a-48c1-97e9-495ac96a2581'
);

-- Step 2: Delete orphaned transactions (NO_ENTRIES - from stress tests)
DELETE FROM transactions 
WHERE id IN (
  SELECT t.id 
  FROM transactions t
  LEFT JOIN entries e ON e.transaction_id = t.id
  WHERE e.id IS NULL
    AND t.ledger_id = '0a885204-e07a-48c1-97e9-495ac96a2581'
    AND (t.reference_id LIKE 'stress_%' OR t.reference_id = 'pi_xxx')
);

-- Step 3: Delete the unbalanced first_light transactions
DELETE FROM transactions 
WHERE reference_id LIKE 'first_light_%'
  AND ledger_id = '0a885204-e07a-48c1-97e9-495ac96a2581';
