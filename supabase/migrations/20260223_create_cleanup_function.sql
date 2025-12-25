-- Create a database function for test data cleanup
-- This is called by the test-cleanup edge function

CREATE OR REPLACE FUNCTION cleanup_ledger_data(p_ledger_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete in dependency order
  DELETE FROM invoice_payments WHERE invoice_id IN (SELECT id FROM invoices WHERE ledger_id = p_ledger_id);
  DELETE FROM entries WHERE account_id IN (SELECT id FROM accounts WHERE ledger_id = p_ledger_id);
  DELETE FROM invoices WHERE ledger_id = p_ledger_id;
  DELETE FROM transactions WHERE ledger_id = p_ledger_id;
  DELETE FROM accounts WHERE ledger_id = p_ledger_id;

  -- Recreate base accounts
  INSERT INTO accounts (ledger_id, account_type, entity_type, name) VALUES
    (p_ledger_id, 'cash', 'platform', 'Cash'),
    (p_ledger_id, 'platform_revenue', 'platform', 'Platform Revenue'),
    (p_ledger_id, 'accounts_receivable', 'platform', 'Accounts Receivable'),
    (p_ledger_id, 'accounts_payable', 'platform', 'Accounts Payable'),
    (p_ledger_id, 'revenue', 'platform', 'Revenue'),
    (p_ledger_id, 'expense', 'platform', 'Expenses');

  RETURN TRUE;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION cleanup_ledger_data(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_ledger_data(UUID) TO anon;
GRANT EXECUTE ON FUNCTION cleanup_ledger_data(UUID) TO service_role;
