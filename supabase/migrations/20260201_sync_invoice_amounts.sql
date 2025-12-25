-- Step 3: Sync invoice amount_due with actual AR entries
-- For each invoice, recalculate based on actual ledger entries

WITH ar_balances AS (
  SELECT
    i.id as invoice_id,
    i.total_amount,
    COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0) * 100 as ar_debits_cents,
    COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0) * 100 as ar_credits_cents
  FROM invoices i
  LEFT JOIN transactions t ON t.id = i.transaction_id AND t.status = 'completed'
  LEFT JOIN accounts a ON a.ledger_id = i.ledger_id AND a.account_type = 'accounts_receivable'
  LEFT JOIN entries e ON e.transaction_id = t.id AND e.account_id = a.id
  WHERE i.status IN ('sent', 'partial', 'overdue')
  GROUP BY i.id, i.total_amount
)
UPDATE invoices i
SET amount_paid = ab.ar_credits_cents,
    amount_due = GREATEST(0, ab.ar_debits_cents - ab.ar_credits_cents),
    status = CASE
      WHEN ab.ar_debits_cents - ab.ar_credits_cents <= 0 THEN 'paid'
      WHEN ab.ar_credits_cents > 0 THEN 'partial'
      ELSE i.status
    END
FROM ar_balances ab
WHERE i.id = ab.invoice_id
  AND i.status IN ('sent', 'partial', 'overdue')
