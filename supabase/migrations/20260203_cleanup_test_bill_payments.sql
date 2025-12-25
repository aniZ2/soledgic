-- Delete old bill payment transactions with test reference IDs
-- This prevents duplicate key errors in stress tests

DELETE FROM entries
WHERE transaction_id IN (
  SELECT id FROM transactions
  WHERE reference_id = 'CC-TXN-12345'
    AND transaction_type = 'bill_payment'
)
