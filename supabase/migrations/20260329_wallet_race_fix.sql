-- Soledgic: Wallet Race-Condition Fix
-- ============================================================================
-- Fixes concurrent wallet creation race in wallet_deposit_atomic and
-- wallet_transfer_atomic. Two concurrent first-time deposits for the same
-- user could both pass the SELECT-miss check and attempt INSERT, with one
-- throwing unique_violation that gets caught by the wrong handler (expects
-- duplicate reference_id).
--
-- Fix: add a unique index for (ledger_id, account_type, entity_id) WHERE
-- entity_id IS NOT NULL, then use ON CONFLICT DO NOTHING + re-select.
-- ============================================================================

-- ============================================================================
-- STEP 1: Unique index for entity-bearing accounts
-- ============================================================================
-- The existing partial unique index unique_ledger_account_type_no_entity
-- covers entity_id IS NULL. This covers the non-null case (wallets, creator
-- balances, etc).

CREATE UNIQUE INDEX IF NOT EXISTS unique_ledger_account_type_entity
ON public.accounts (ledger_id, account_type, entity_id)
WHERE entity_id IS NOT NULL;

-- ============================================================================
-- STEP 2: Replace wallet_deposit_atomic with race-safe wallet creation
-- ============================================================================

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

  -- Get-or-create wallet account (race-safe: ON CONFLICT DO NOTHING + re-select)
  SELECT id INTO v_wallet_account_id
  FROM public.accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'user_wallet'
    AND entity_id = p_user_id;

  IF v_wallet_account_id IS NULL THEN
    INSERT INTO public.accounts (ledger_id, account_type, entity_id, entity_type, name)
    VALUES (p_ledger_id, 'user_wallet', p_user_id, 'customer', 'User Wallet')
    ON CONFLICT (ledger_id, account_type, entity_id) WHERE entity_id IS NOT NULL
    DO NOTHING;

    -- Re-select: either we inserted or a concurrent tx did
    SELECT id INTO v_wallet_account_id
    FROM public.accounts
    WHERE ledger_id = p_ledger_id
      AND account_type = 'user_wallet'
      AND entity_id = p_user_id;
  END IF;

  IF v_wallet_account_id IS NULL THEN
    RAISE EXCEPTION 'Failed to get or create wallet account for user %', p_user_id;
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
    -- Idempotency: duplicate reference_id means this deposit was already processed
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
-- STEP 3: Replace wallet_transfer_atomic with race-safe recipient creation
-- ============================================================================

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

  -- Get-or-create recipient wallet (race-safe: ON CONFLICT DO NOTHING + re-select)
  SELECT id INTO v_to_account_id
  FROM public.accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'user_wallet'
    AND entity_id = p_to_user_id;

  IF v_to_account_id IS NULL THEN
    INSERT INTO public.accounts (ledger_id, account_type, entity_id, entity_type, name)
    VALUES (p_ledger_id, 'user_wallet', p_to_user_id, 'customer', 'User Wallet')
    ON CONFLICT (ledger_id, account_type, entity_id) WHERE entity_id IS NOT NULL
    DO NOTHING;

    -- Re-select: either we inserted or a concurrent tx did
    SELECT id INTO v_to_account_id
    FROM public.accounts
    WHERE ledger_id = p_ledger_id
      AND account_type = 'user_wallet'
      AND entity_id = p_to_user_id;
  END IF;

  IF v_to_account_id IS NULL THEN
    RAISE EXCEPTION 'Failed to get or create recipient wallet for user %', p_to_user_id;
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
    -- Idempotency: duplicate reference_id means this transfer was already processed
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
