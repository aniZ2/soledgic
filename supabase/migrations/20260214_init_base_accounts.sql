-- Initialize base platform accounts for the Booklyverse test ledger
-- These accounts are required for record_sale_atomic and other functions

DO $$
DECLARE
  v_ledger_id UUID;
BEGIN
  -- Find the Booklyverse ledger
  SELECT id INTO v_ledger_id FROM ledgers
  WHERE api_key_hash = encode(sha256('sk_live_28b75b47565bed2c5c6acaa3ffe3038f0dc897a57c83a1f2'::bytea), 'hex');

  IF v_ledger_id IS NULL THEN
    RAISE NOTICE 'Ledger not found, skipping account initialization';
    RETURN;
  END IF;

  -- Create cash account if it doesn't exist
  INSERT INTO accounts (ledger_id, account_type, entity_type, name)
  SELECT v_ledger_id, 'cash', 'platform', 'Cash'
  WHERE NOT EXISTS (
    SELECT 1 FROM accounts WHERE ledger_id = v_ledger_id AND account_type = 'cash'
  );

  -- Create platform_revenue account if it doesn't exist
  INSERT INTO accounts (ledger_id, account_type, entity_type, name)
  SELECT v_ledger_id, 'platform_revenue', 'platform', 'Platform Revenue'
  WHERE NOT EXISTS (
    SELECT 1 FROM accounts WHERE ledger_id = v_ledger_id AND account_type = 'platform_revenue'
  );

  -- Create accounts_receivable account if it doesn't exist
  INSERT INTO accounts (ledger_id, account_type, entity_type, name)
  SELECT v_ledger_id, 'accounts_receivable', 'platform', 'Accounts Receivable'
  WHERE NOT EXISTS (
    SELECT 1 FROM accounts WHERE ledger_id = v_ledger_id AND account_type = 'accounts_receivable'
  );

  -- Create accounts_payable account if it doesn't exist
  INSERT INTO accounts (ledger_id, account_type, entity_type, name)
  SELECT v_ledger_id, 'accounts_payable', 'platform', 'Accounts Payable'
  WHERE NOT EXISTS (
    SELECT 1 FROM accounts WHERE ledger_id = v_ledger_id AND account_type = 'accounts_payable'
  );

  -- Create revenue account if it doesn't exist
  INSERT INTO accounts (ledger_id, account_type, entity_type, name)
  SELECT v_ledger_id, 'revenue', 'platform', 'Revenue'
  WHERE NOT EXISTS (
    SELECT 1 FROM accounts WHERE ledger_id = v_ledger_id AND account_type = 'revenue'
  );

  -- Create expense account if it doesn't exist
  INSERT INTO accounts (ledger_id, account_type, entity_type, name)
  SELECT v_ledger_id, 'expense', 'platform', 'Expenses'
  WHERE NOT EXISTS (
    SELECT 1 FROM accounts WHERE ledger_id = v_ledger_id AND account_type = 'expense'
  );

  RAISE NOTICE 'Base accounts initialized for ledger %', v_ledger_id;
END $$;
