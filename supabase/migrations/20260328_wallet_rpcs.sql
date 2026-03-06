-- Soledgic: Wallet RPCs — atomic deposit, transfer, withdraw, and balance equation update
-- Each function is wrapped in a DO+EXECUTE block to work around Supabase CLI's
-- statement splitter which bundles bare CREATE FUNCTION + REVOKE/GRANT into one
-- prepared statement.

-- ============================================================================
-- wallet_deposit_atomic
-- ============================================================================
-- Deposits funds into a user wallet. Get-or-creates the wallet account.
-- user_wallet is credit-normal (platform liability): CREDIT increases balance.
-- Double-entry: DEBIT cash (increase asset), CREDIT user_wallet (increase liability).

DO $do_deposit$
BEGIN
  EXECUTE $fn$
CREATE OR REPLACE FUNCTION public.wallet_deposit_atomic(
  p_ledger_id     UUID,
  p_user_id       TEXT,
  p_amount        BIGINT,
  p_reference_id  TEXT,
  p_description   TEXT DEFAULT NULL,
  p_metadata      JSONB DEFAULT '{}'
)
RETURNS TABLE (
  out_transaction_id   UUID,
  out_wallet_account_id UUID,
  out_wallet_balance   NUMERIC(14,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $deposit$
DECLARE
  v_tx_id             UUID;
  v_wallet_account_id UUID;
  v_cash_account_id   UUID;
  v_wallet_balance    NUMERIC(14,2);
  v_amount_major      NUMERIC(14,2);
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Deposit amount must be positive: %', p_amount;
  END IF;

  v_amount_major := p_amount / 100.0;

  -- Get-or-create wallet account
  SELECT id INTO v_wallet_account_id
  FROM public.accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'user_wallet'
    AND entity_id = p_user_id;

  IF v_wallet_account_id IS NULL THEN
    INSERT INTO public.accounts (ledger_id, account_type, entity_id, entity_type, name)
    VALUES (p_ledger_id, 'user_wallet', p_user_id, 'customer', 'User Wallet')
    RETURNING id INTO v_wallet_account_id;
  END IF;

  -- Get cash account
  SELECT id INTO v_cash_account_id
  FROM public.accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'cash'
    AND entity_id IS NULL
  LIMIT 1;

  IF v_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'Cash account not initialized for ledger %', p_ledger_id;
  END IF;

  -- Create transaction
  INSERT INTO public.transactions (
    ledger_id, transaction_type, reference_id, reference_type,
    description, amount, currency, status, metadata
  ) VALUES (
    p_ledger_id, 'deposit', p_reference_id, 'wallet',
    COALESCE(p_description, 'Wallet deposit for user ' || p_user_id),
    v_amount_major, 'USD', 'completed',
    jsonb_build_object(
      'user_id', p_user_id,
      'operation', 'wallet_deposit',
      'amount_cents', p_amount
    ) || p_metadata
  )
  RETURNING id INTO v_tx_id;

  -- Double-entry: DEBIT cash (increase asset), CREDIT user_wallet (increase liability)
  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_cash_account_id, 'debit', v_amount_major);

  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_wallet_account_id, 'credit', v_amount_major);

  -- Record internal transfer
  INSERT INTO public.internal_transfers (
    ledger_id, transaction_id, from_account_id, to_account_id,
    amount, currency, transfer_type, description, executed_at
  ) VALUES (
    p_ledger_id, v_tx_id, v_cash_account_id, v_wallet_account_id,
    v_amount_major, 'USD', 'wallet_deposit',
    COALESCE(p_description, 'Wallet deposit'), NOW()
  );

  -- Read wallet balance (updated by trigger)
  SELECT balance INTO v_wallet_balance
  FROM public.accounts
  WHERE id = v_wallet_account_id;

  -- Balance invariant check
  PERFORM 1 FROM (
    SELECT
      SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END) AS debits,
      SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END) AS credits
    FROM public.entries e
    WHERE e.transaction_id = v_tx_id
  ) AS totals
  WHERE totals.debits != totals.credits;

  IF FOUND THEN
    RAISE EXCEPTION 'CRITICAL: Double-entry validation failed for transaction %', v_tx_id;
  END IF;

  RETURN QUERY SELECT v_tx_id, v_wallet_account_id, v_wallet_balance;

EXCEPTION
  WHEN unique_violation THEN
    SELECT t.id,
           (SELECT a.id FROM public.accounts a
            WHERE a.ledger_id = p_ledger_id
            AND a.account_type = 'user_wallet'
            AND a.entity_id = p_user_id),
           (SELECT a.balance FROM public.accounts a
            WHERE a.ledger_id = p_ledger_id
            AND a.account_type = 'user_wallet'
            AND a.entity_id = p_user_id)
    INTO v_tx_id, v_wallet_account_id, v_wallet_balance
    FROM public.transactions t
    WHERE t.ledger_id = p_ledger_id AND t.reference_id = p_reference_id;

    RETURN QUERY SELECT v_tx_id, v_wallet_account_id, v_wallet_balance;
END;
$deposit$
  $fn$;

  REVOKE ALL ON FUNCTION public.wallet_deposit_atomic(UUID, TEXT, BIGINT, TEXT, TEXT, JSONB) FROM public;
  REVOKE ALL ON FUNCTION public.wallet_deposit_atomic(UUID, TEXT, BIGINT, TEXT, TEXT, JSONB) FROM authenticated;
  GRANT EXECUTE ON FUNCTION public.wallet_deposit_atomic(UUID, TEXT, BIGINT, TEXT, TEXT, JSONB) TO service_role;
END;
$do_deposit$;

-- ============================================================================
-- wallet_transfer_atomic
-- ============================================================================
-- P2P transfer between two user wallets.
-- Double-entry: DEBIT from_wallet (decrease sender), CREDIT to_wallet (increase recipient).

DO $do_transfer$
BEGIN
  EXECUTE $fn$
CREATE OR REPLACE FUNCTION public.wallet_transfer_atomic(
  p_ledger_id     UUID,
  p_from_user_id  TEXT,
  p_to_user_id    TEXT,
  p_amount        BIGINT,
  p_reference_id  TEXT,
  p_description   TEXT DEFAULT NULL,
  p_metadata      JSONB DEFAULT '{}'
)
RETURNS TABLE (
  out_transaction_id UUID,
  out_from_balance   NUMERIC(14,2),
  out_to_balance     NUMERIC(14,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $transfer$
DECLARE
  v_tx_id            UUID;
  v_from_account_id  UUID;
  v_to_account_id    UUID;
  v_from_balance     NUMERIC(14,2);
  v_to_balance       NUMERIC(14,2);
  v_amount_major     NUMERIC(14,2);
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Transfer amount must be positive: %', p_amount;
  END IF;

  IF p_from_user_id = p_to_user_id THEN
    RAISE EXCEPTION 'Cannot transfer to self';
  END IF;

  v_amount_major := p_amount / 100.0;

  -- Get sender wallet (must exist). FOR UPDATE prevents concurrent balance checks
  -- from both passing before either deducts.
  SELECT id, balance INTO v_from_account_id, v_from_balance
  FROM public.accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'user_wallet'
    AND entity_id = p_from_user_id
  FOR UPDATE;

  IF v_from_account_id IS NULL THEN
    RAISE EXCEPTION 'Sender wallet not found for user %', p_from_user_id;
  END IF;

  -- Overdraft protection
  IF v_from_balance < v_amount_major THEN
    RAISE EXCEPTION 'Insufficient wallet balance: % < %', v_from_balance, v_amount_major;
  END IF;

  -- Get-or-create recipient wallet
  SELECT id INTO v_to_account_id
  FROM public.accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'user_wallet'
    AND entity_id = p_to_user_id;

  IF v_to_account_id IS NULL THEN
    INSERT INTO public.accounts (ledger_id, account_type, entity_id, entity_type, name)
    VALUES (p_ledger_id, 'user_wallet', p_to_user_id, 'customer', 'User Wallet')
    RETURNING id INTO v_to_account_id;
  END IF;

  -- Create transaction
  INSERT INTO public.transactions (
    ledger_id, transaction_type, reference_id, reference_type,
    description, amount, currency, status, metadata
  ) VALUES (
    p_ledger_id, 'transfer', p_reference_id, 'wallet',
    COALESCE(p_description, 'Wallet transfer from ' || p_from_user_id || ' to ' || p_to_user_id),
    v_amount_major, 'USD', 'completed',
    jsonb_build_object(
      'from_user_id', p_from_user_id,
      'to_user_id', p_to_user_id,
      'operation', 'wallet_transfer',
      'amount_cents', p_amount
    ) || p_metadata
  )
  RETURNING id INTO v_tx_id;

  -- Double-entry: DEBIT from_wallet (decrease sender), CREDIT to_wallet (increase recipient)
  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_from_account_id, 'debit', v_amount_major);

  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_to_account_id, 'credit', v_amount_major);

  -- Record internal transfer
  INSERT INTO public.internal_transfers (
    ledger_id, transaction_id, from_account_id, to_account_id,
    amount, currency, transfer_type, description, executed_at
  ) VALUES (
    p_ledger_id, v_tx_id, v_from_account_id, v_to_account_id,
    v_amount_major, 'USD', 'wallet_transfer',
    COALESCE(p_description, 'Wallet transfer'), NOW()
  );

  -- Read updated balances
  SELECT balance INTO v_from_balance
  FROM public.accounts WHERE id = v_from_account_id;

  SELECT balance INTO v_to_balance
  FROM public.accounts WHERE id = v_to_account_id;

  -- Balance invariant check
  PERFORM 1 FROM (
    SELECT
      SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END) AS debits,
      SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END) AS credits
    FROM public.entries e
    WHERE e.transaction_id = v_tx_id
  ) AS totals
  WHERE totals.debits != totals.credits;

  IF FOUND THEN
    RAISE EXCEPTION 'CRITICAL: Double-entry validation failed for transaction %', v_tx_id;
  END IF;

  RETURN QUERY SELECT v_tx_id, v_from_balance, v_to_balance;

EXCEPTION
  WHEN unique_violation THEN
    SELECT t.id INTO v_tx_id
    FROM public.transactions t
    WHERE t.ledger_id = p_ledger_id AND t.reference_id = p_reference_id;

    SELECT balance INTO v_from_balance
    FROM public.accounts
    WHERE ledger_id = p_ledger_id
      AND account_type = 'user_wallet'
      AND entity_id = p_from_user_id;

    SELECT balance INTO v_to_balance
    FROM public.accounts
    WHERE ledger_id = p_ledger_id
      AND account_type = 'user_wallet'
      AND entity_id = p_to_user_id;

    RETURN QUERY SELECT v_tx_id, v_from_balance, v_to_balance;
END;
$transfer$
  $fn$;

  REVOKE ALL ON FUNCTION public.wallet_transfer_atomic(UUID, TEXT, TEXT, BIGINT, TEXT, TEXT, JSONB) FROM public;
  REVOKE ALL ON FUNCTION public.wallet_transfer_atomic(UUID, TEXT, TEXT, BIGINT, TEXT, TEXT, JSONB) FROM authenticated;
  GRANT EXECUTE ON FUNCTION public.wallet_transfer_atomic(UUID, TEXT, TEXT, BIGINT, TEXT, TEXT, JSONB) TO service_role;
END;
$do_transfer$;

-- ============================================================================
-- wallet_withdraw_atomic
-- ============================================================================
-- Withdraws funds from a user wallet back to cash (for external payout).
-- Double-entry: DEBIT user_wallet (decrease liability), CREDIT cash (decrease asset).

DO $do_withdraw$
BEGIN
  EXECUTE $fn$
CREATE OR REPLACE FUNCTION public.wallet_withdraw_atomic(
  p_ledger_id     UUID,
  p_user_id       TEXT,
  p_amount        BIGINT,
  p_reference_id  TEXT,
  p_description   TEXT DEFAULT NULL,
  p_metadata      JSONB DEFAULT '{}'
)
RETURNS TABLE (
  out_transaction_id UUID,
  out_wallet_balance NUMERIC(14,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $withdraw$
DECLARE
  v_tx_id             UUID;
  v_wallet_account_id UUID;
  v_cash_account_id   UUID;
  v_wallet_balance    NUMERIC(14,2);
  v_amount_major      NUMERIC(14,2);
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Withdrawal amount must be positive: %', p_amount;
  END IF;

  v_amount_major := p_amount / 100.0;

  -- Get wallet account (must exist). FOR UPDATE serializes concurrent withdrawals
  -- so two balance checks can't both pass before either deducts.
  SELECT id, balance INTO v_wallet_account_id, v_wallet_balance
  FROM public.accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'user_wallet'
    AND entity_id = p_user_id
  FOR UPDATE;

  IF v_wallet_account_id IS NULL THEN
    RAISE EXCEPTION 'Wallet not found for user %', p_user_id;
  END IF;

  -- Overdraft protection
  IF v_wallet_balance < v_amount_major THEN
    RAISE EXCEPTION 'Insufficient wallet balance: % < %', v_wallet_balance, v_amount_major;
  END IF;

  -- Get cash account
  SELECT id INTO v_cash_account_id
  FROM public.accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'cash'
    AND entity_id IS NULL
  LIMIT 1;

  IF v_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'Cash account not initialized for ledger %', p_ledger_id;
  END IF;

  -- Create transaction
  INSERT INTO public.transactions (
    ledger_id, transaction_type, reference_id, reference_type,
    description, amount, currency, status, metadata
  ) VALUES (
    p_ledger_id, 'withdrawal', p_reference_id, 'wallet',
    COALESCE(p_description, 'Wallet withdrawal for user ' || p_user_id),
    v_amount_major, 'USD', 'completed',
    jsonb_build_object(
      'user_id', p_user_id,
      'operation', 'wallet_withdrawal',
      'amount_cents', p_amount
    ) || p_metadata
  )
  RETURNING id INTO v_tx_id;

  -- Double-entry: DEBIT user_wallet (decrease liability), CREDIT cash (decrease asset)
  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_wallet_account_id, 'debit', v_amount_major);

  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_cash_account_id, 'credit', v_amount_major);

  -- Record internal transfer
  INSERT INTO public.internal_transfers (
    ledger_id, transaction_id, from_account_id, to_account_id,
    amount, currency, transfer_type, description, executed_at
  ) VALUES (
    p_ledger_id, v_tx_id, v_wallet_account_id, v_cash_account_id,
    v_amount_major, 'USD', 'wallet_withdrawal',
    COALESCE(p_description, 'Wallet withdrawal'), NOW()
  );

  -- Read updated wallet balance
  SELECT balance INTO v_wallet_balance
  FROM public.accounts
  WHERE id = v_wallet_account_id;

  -- Balance invariant check
  PERFORM 1 FROM (
    SELECT
      SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END) AS debits,
      SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END) AS credits
    FROM public.entries e
    WHERE e.transaction_id = v_tx_id
  ) AS totals
  WHERE totals.debits != totals.credits;

  IF FOUND THEN
    RAISE EXCEPTION 'CRITICAL: Double-entry validation failed for transaction %', v_tx_id;
  END IF;

  RETURN QUERY SELECT v_tx_id, v_wallet_balance;

EXCEPTION
  WHEN unique_violation THEN
    SELECT t.id,
           (SELECT a.balance FROM public.accounts a
            WHERE a.ledger_id = p_ledger_id
            AND a.account_type = 'user_wallet'
            AND a.entity_id = p_user_id)
    INTO v_tx_id, v_wallet_balance
    FROM public.transactions t
    WHERE t.ledger_id = p_ledger_id AND t.reference_id = p_reference_id;

    RETURN QUERY SELECT v_tx_id, v_wallet_balance;
END;
$withdraw$
  $fn$;

  REVOKE ALL ON FUNCTION public.wallet_withdraw_atomic(UUID, TEXT, BIGINT, TEXT, TEXT, JSONB) FROM public;
  REVOKE ALL ON FUNCTION public.wallet_withdraw_atomic(UUID, TEXT, BIGINT, TEXT, TEXT, JSONB) FROM authenticated;
  GRANT EXECUTE ON FUNCTION public.wallet_withdraw_atomic(UUID, TEXT, BIGINT, TEXT, TEXT, JSONB) TO service_role;
END;
$do_withdraw$;

-- ============================================================================
-- check_balance_equation — add user_wallet to liability bucket
-- ============================================================================
-- Recreate the function with user_wallet included in the liability query
-- so the accounting equation (A = L + E + R - X) stays balanced.

DO $do_balance$
BEGIN
  EXECUTE $fn$
CREATE OR REPLACE FUNCTION check_balance_equation(p_ledger_id UUID)
RETURNS TABLE(
  total_assets NUMERIC,
  total_liabilities NUMERIC,
  total_equity NUMERIC,
  total_revenue NUMERIC,
  total_expenses NUMERIC,
  net_income NUMERIC,
  liabilities_plus_equity NUMERIC,
  is_balanced BOOLEAN,
  difference NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $balance_eq$
DECLARE
  v_total_assets NUMERIC := 0;
  v_total_liabilities NUMERIC := 0;
  v_total_equity NUMERIC := 0;
  v_total_revenue NUMERIC := 0;
  v_total_expenses NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(
    CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END
  ), 0)
  INTO v_total_assets
  FROM accounts a
  JOIN entries e ON e.account_id = a.id
  JOIN transactions t ON e.transaction_id = t.id AND t.status = 'completed'
  WHERE a.ledger_id = p_ledger_id
    AND a.account_type IN ('cash', 'accounts_receivable', 'inventory', 'prepaid_expense',
                           'fixed_asset', 'property', 'equipment');

  SELECT COALESCE(SUM(
    CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE -e.amount END
  ), 0)
  INTO v_total_liabilities
  FROM accounts a
  JOIN entries e ON e.account_id = a.id
  JOIN transactions t ON e.transaction_id = t.id AND t.status = 'completed'
  WHERE a.ledger_id = p_ledger_id
    AND a.account_type IN ('accounts_payable', 'creator_balance', 'payee_balance',
                           'accrued_expense', 'tax_payable', 'unearned_revenue',
                           'long_term_debt', 'notes_payable', 'deferred_tax',
                           'user_wallet');

  SELECT COALESCE(SUM(
    CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE -e.amount END
  ), 0)
  INTO v_total_equity
  FROM accounts a
  JOIN entries e ON e.account_id = a.id
  JOIN transactions t ON e.transaction_id = t.id AND t.status = 'completed'
  WHERE a.ledger_id = p_ledger_id
    AND a.account_type IN ('owner_equity', 'retained_earnings', 'common_stock',
                           'additional_paid_in_capital');

  SELECT COALESCE(SUM(
    CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE -e.amount END
  ), 0)
  INTO v_total_revenue
  FROM accounts a
  JOIN entries e ON e.account_id = a.id
  JOIN transactions t ON e.transaction_id = t.id AND t.status = 'completed'
  WHERE a.ledger_id = p_ledger_id
    AND a.account_type IN ('revenue', 'platform_revenue');

  SELECT COALESCE(SUM(
    CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END
  ), 0)
  INTO v_total_expenses
  FROM accounts a
  JOIN entries e ON e.account_id = a.id
  JOIN transactions t ON e.transaction_id = t.id AND t.status = 'completed'
  WHERE a.ledger_id = p_ledger_id
    AND a.account_type = 'expense';

  RETURN QUERY SELECT
    v_total_assets,
    v_total_liabilities,
    v_total_equity,
    v_total_revenue,
    v_total_expenses,
    (v_total_revenue - v_total_expenses) as net_income,
    (v_total_liabilities + v_total_equity + v_total_revenue - v_total_expenses) as liabilities_plus_equity,
    (ABS(v_total_assets - (v_total_liabilities + v_total_equity + v_total_revenue - v_total_expenses)) < 0.01) as is_balanced,
    (v_total_assets - (v_total_liabilities + v_total_equity + v_total_revenue - v_total_expenses)) as difference;
END;
$balance_eq$
  $fn$;
END;
$do_balance$;
