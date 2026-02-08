-- ============================================================================
-- FIX: Recreate missing ledger initialization functions as no-ops
-- These were dropped but are still called by triggers
-- ============================================================================

-- Recreate initialize_expense_categories as no-op (expense_categories table doesn't exist)
CREATE OR REPLACE FUNCTION initialize_expense_categories(p_ledger_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- No-op: expense_categories table was never created
  NULL;
END;
$$;

-- Recreate initialize_expense_accounts as no-op
CREATE OR REPLACE FUNCTION initialize_expense_accounts(p_ledger_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- No-op: handled by get_or_create_ledger_account on demand
  NULL;
END;
$$;

-- Ensure initialize_ledger_accounts exists
CREATE OR REPLACE FUNCTION initialize_ledger_accounts(p_ledger_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode TEXT;
BEGIN
  -- Get ledger mode
  SELECT ledger_mode INTO v_mode FROM ledgers WHERE id = p_ledger_id;

  IF v_mode = 'marketplace' THEN
    -- Create marketplace accounts
    INSERT INTO accounts (ledger_id, account_type, entity_type, name, entity_id)
    VALUES
      (p_ledger_id, 'platform_revenue', 'platform', 'Platform Revenue', NULL),
      (p_ledger_id, 'creator_pool', 'reserve', 'Creator Pool', NULL),
      (p_ledger_id, 'processing_fees', 'reserve', 'Processing Fees', NULL),
      (p_ledger_id, 'tax_reserve', 'reserve', 'Tax Reserve', NULL),
      (p_ledger_id, 'refund_reserve', 'reserve', 'Refund Reserve', NULL),
      (p_ledger_id, 'cash', 'business', 'Operating Cash', NULL)
    ON CONFLICT DO NOTHING;
  ELSE
    -- Create standard mode accounts
    INSERT INTO accounts (ledger_id, account_type, entity_type, name, entity_id)
    VALUES
      (p_ledger_id, 'revenue', 'business', 'Revenue', NULL),
      (p_ledger_id, 'expense', 'business', 'Expenses', NULL),
      (p_ledger_id, 'cash', 'business', 'Cash', NULL),
      (p_ledger_id, 'accounts_receivable', 'business', 'Accounts Receivable', NULL),
      (p_ledger_id, 'accounts_payable', 'business', 'Accounts Payable', NULL),
      (p_ledger_id, 'owner_equity', 'business', 'Owner Equity', NULL),
      (p_ledger_id, 'tax_reserve', 'reserve', 'Tax Reserve', NULL)
    ON CONFLICT DO NOTHING;
  END IF;

EXCEPTION WHEN OTHERS THEN
  -- Log but don't fail
  RAISE NOTICE 'Could not initialize accounts for ledger %: %', p_ledger_id, SQLERRM;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION initialize_expense_categories(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION initialize_expense_categories(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION initialize_expense_accounts(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION initialize_expense_accounts(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION initialize_ledger_accounts(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION initialize_ledger_accounts(UUID) TO service_role;
