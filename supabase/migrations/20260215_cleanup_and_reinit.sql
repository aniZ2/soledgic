-- Full cleanup and reinitialization for Booklyverse test ledger
-- This deletes all data (except immutable audit_log) and recreates base accounts

DO $$
DECLARE
  v_ledger_id UUID;
BEGIN
  -- Find the Booklyverse ledger
  SELECT id INTO v_ledger_id FROM ledgers
  WHERE api_key_hash = encode(sha256('sk_live_28b75b47565bed2c5c6acaa3ffe3038f0dc897a57c83a1f2'::bytea), 'hex');

  IF v_ledger_id IS NULL THEN
    RAISE NOTICE 'Ledger not found, skipping cleanup';
    RETURN;
  END IF;

  RAISE NOTICE 'Cleaning up ledger %', v_ledger_id;

  -- Delete invoice_payments
  DELETE FROM invoice_payments WHERE invoice_id IN (
    SELECT id FROM invoices WHERE ledger_id = v_ledger_id
  );

  -- Delete entries
  DELETE FROM entries WHERE account_id IN (
    SELECT id FROM accounts WHERE ledger_id = v_ledger_id
  );

  -- Delete invoices
  DELETE FROM invoices WHERE ledger_id = v_ledger_id;

  -- Delete transactions
  DELETE FROM transactions WHERE ledger_id = v_ledger_id;

  -- Delete accounts
  DELETE FROM accounts WHERE ledger_id = v_ledger_id;

  RAISE NOTICE 'Data deleted, recreating base accounts';

  -- Recreate base accounts
  INSERT INTO accounts (ledger_id, account_type, entity_type, name)
  VALUES
    (v_ledger_id, 'cash', 'platform', 'Cash'),
    (v_ledger_id, 'platform_revenue', 'platform', 'Platform Revenue'),
    (v_ledger_id, 'accounts_receivable', 'platform', 'Accounts Receivable'),
    (v_ledger_id, 'accounts_payable', 'platform', 'Accounts Payable'),
    (v_ledger_id, 'revenue', 'platform', 'Revenue'),
    (v_ledger_id, 'expense', 'platform', 'Expenses');

  RAISE NOTICE 'Base accounts recreated for ledger %', v_ledger_id;
END $$;
