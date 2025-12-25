-- Void all old invoices that were created before today
-- These are stale test data that's causing AR discrepancies

UPDATE invoices
SET status = 'void',
    voided_at = NOW(),
    void_reason = 'Data cleanup: stale test invoice'
WHERE status IN ('sent', 'partial', 'overdue')
  AND created_at < CURRENT_DATE
