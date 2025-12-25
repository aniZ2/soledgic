-- Step 2: Mark invoices as void if their transaction has been reversed or doesn't exist
UPDATE invoices i
SET status = 'void',
    voided_at = NOW(),
    void_reason = 'Data cleanup: transaction reversed or missing'
WHERE i.status IN ('sent', 'partial', 'overdue')
  AND i.transaction_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.id = i.transaction_id
      AND t.status = 'completed'
      AND t.reversed_by IS NULL
  )
