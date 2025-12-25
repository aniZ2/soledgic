-- Cleanup stale invoices that don't have corresponding AR entries
-- This fixes the discrepancy between AR aging report and balance sheet

-- Step 1: Mark invoices as void if they have status sent/partial/overdue but no transaction_id
UPDATE invoices
SET status = 'void',
    voided_at = NOW(),
    void_reason = 'Data cleanup: missing transaction'
WHERE status IN ('sent', 'partial', 'overdue')
  AND transaction_id IS NULL
