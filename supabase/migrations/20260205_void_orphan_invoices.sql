-- Void invoices that have status sent/partial/overdue but whose transactions are reversed
-- This syncs the invoices table with the actual AR entries

UPDATE invoices
SET status = 'void',
    voided_at = NOW(),
    void_reason = 'Data cleanup: transaction was reversed'
WHERE status IN ('sent', 'partial', 'overdue')
  AND transaction_id IS NOT NULL
  AND transaction_id IN (
    SELECT id FROM transactions
    WHERE reversed_by IS NOT NULL
       OR status != 'completed'
  )
