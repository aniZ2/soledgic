-- Diagnostic Script for Soledgic Test Failures
-- Run this with: supabase db execute --file ./scripts/diagnose_ledger.sql

-- 1. Find the booklyverse ledger
SELECT id, business_name, status, created_at 
FROM ledgers 
WHERE business_name ILIKE '%booklyverse%' 
   OR business_name ILIKE '%test%'
ORDER BY created_at DESC
LIMIT 5;

-- 2. Check balance equation for all active ledgers
SELECT 
  l.business_name,
  b.*
FROM ledgers l
CROSS JOIN LATERAL check_balance_equation(l.id) b
WHERE l.status = 'active'
ORDER BY b.is_balanced, l.business_name;

-- 3. Count imbalanced transactions per ledger
SELECT 
  l.business_name,
  COUNT(i.*) as imbalanced_count
FROM ledgers l
LEFT JOIN LATERAL find_imbalanced_transactions(l.id) i ON true
WHERE l.status = 'active'
GROUP BY l.id, l.business_name
HAVING COUNT(i.*) > 0
ORDER BY imbalanced_count DESC;

-- 4. Show sample of imbalanced transactions (first 10)
SELECT 
  l.business_name,
  i.*
FROM ledgers l
CROSS JOIN LATERAL find_imbalanced_transactions(l.id) i
WHERE l.status = 'active'
ORDER BY i.created_at DESC
LIMIT 10;

-- 5. Check for orphaned entries
SELECT 
  l.business_name,
  COUNT(o.*) as orphaned_count
FROM ledgers l
LEFT JOIN LATERAL find_orphaned_entries(l.id) o ON true
WHERE l.status = 'active'
GROUP BY l.id, l.business_name
HAVING COUNT(o.*) > 0;

-- 6. Check invoice status distribution
SELECT 
  l.business_name,
  inv.status,
  COUNT(*) as count,
  SUM(inv.total_amount)/100.0 as total_amount,
  SUM(inv.amount_paid)/100.0 as total_paid,
  SUM(inv.amount_due)/100.0 as total_due
FROM ledgers l
JOIN invoices inv ON inv.ledger_id = l.id
WHERE l.status = 'active'
GROUP BY l.id, l.business_name, inv.status
ORDER BY l.business_name, inv.status;

-- 7. Compare AR from invoices vs entries
WITH ar_from_invoices AS (
  SELECT 
    l.id as ledger_id,
    l.business_name,
    SUM(inv.amount_due)/100.0 as ar_invoices
  FROM ledgers l
  LEFT JOIN invoices inv ON inv.ledger_id = l.id AND inv.status IN ('sent', 'partial', 'overdue')
  WHERE l.status = 'active'
  GROUP BY l.id, l.business_name
),
ar_from_entries AS (
  SELECT 
    l.id as ledger_id,
    SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END) as ar_entries
  FROM ledgers l
  JOIN accounts a ON a.ledger_id = l.id AND a.account_type = 'accounts_receivable'
  JOIN entries e ON e.account_id = a.id
  JOIN transactions t ON e.transaction_id = t.id AND t.status = 'completed'
  WHERE l.status = 'active'
  GROUP BY l.id
)
SELECT 
  ai.business_name,
  COALESCE(ai.ar_invoices, 0) as ar_from_invoices,
  COALESCE(ae.ar_entries, 0) as ar_from_entries,
  COALESCE(ai.ar_invoices, 0) - COALESCE(ae.ar_entries, 0) as difference
FROM ar_from_invoices ai
LEFT JOIN ar_from_entries ae ON ai.ledger_id = ae.ledger_id
ORDER BY ABS(COALESCE(ai.ar_invoices, 0) - COALESCE(ae.ar_entries, 0)) DESC;
