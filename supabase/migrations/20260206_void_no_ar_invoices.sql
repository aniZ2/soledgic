-- Void invoices that have no AR entries (the transaction exists but has no entries)
-- This could happen if a transaction was created but entries failed to insert

UPDATE invoices i
SET status = 'void',
    voided_at = NOW(),
    void_reason = 'Data cleanup: no AR entries found'
WHERE i.status IN ('sent', 'partial', 'overdue')
  AND i.transaction_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM entries e
    JOIN accounts a ON e.account_id = a.id
    WHERE e.transaction_id = i.transaction_id
      AND a.account_type = 'accounts_receivable'
      AND a.ledger_id = i.ledger_id
  )
