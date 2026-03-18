-- Fix: credit conversion must be atomic and double-entry balanced.
--
-- Previous implementation had:
--   1. Non-atomic (edge function with Promise.all, race condition)
--   2. Unbalanced entries (2 debits, 1 credit)
--
-- Correct accounting for conversion:
--   DR user_wallet          (credits leave — debit reduces asset)
--   CR user_spendable_balance (spendable goes up)
--
-- Liability was recognized at issuance. Conversion just moves value
-- from one user account to another. The liability account is NOT
-- touched during conversion — it was already settled conceptually
-- when the platform committed to the budget.
--
-- Wait — actually the liability IS still outstanding until the credits
-- are spent. The conversion changes the form (credits → dollars) but
-- the obligation remains. So:
--
--   DR user_wallet            $X  (credits leave wallet)
--   CR user_spendable_balance $X  (spendable goes up)
--
-- That's balanced: 1 debit, 1 credit, same amount. The liability
-- account is untouched — it gets settled when credits are actually
-- spent on creator content (in redeem_credits).

CREATE OR REPLACE FUNCTION public.convert_credits(
  p_ledger_id uuid,
  p_user_id text,
  p_amount_cents integer,
  p_min_conversion_cents integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id uuid;
  v_spendable_id uuid;
  v_wallet_balance numeric;
  v_amount numeric;
  v_txn_id uuid;
BEGIN
  v_amount := p_amount_cents / 100.0;

  -- Enforce minimum conversion
  IF p_amount_cents < p_min_conversion_cents THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Minimum conversion is %s cents', p_min_conversion_cents)
    );
  END IF;

  -- Get user wallet
  SELECT id INTO v_wallet_id
  FROM accounts
  WHERE ledger_id = p_ledger_id AND account_type = 'user_wallet' AND entity_id = p_user_id;

  IF v_wallet_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No credit balance found');
  END IF;

  -- Check wallet balance
  SELECT COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE -amount END), 0)
  INTO v_wallet_balance
  FROM entries e
  JOIN transactions t ON t.id = e.transaction_id
  WHERE e.account_id = v_wallet_id AND t.status = 'completed';

  IF v_wallet_balance < v_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient credit balance',
      'balance_cents', ROUND(v_wallet_balance * 100),
      'requested_cents', p_amount_cents
    );
  END IF;

  -- Ensure spendable balance account exists
  SELECT id INTO v_spendable_id
  FROM accounts
  WHERE ledger_id = p_ledger_id AND account_type = 'user_spendable_balance' AND entity_id = p_user_id;

  IF v_spendable_id IS NULL THEN
    INSERT INTO accounts (ledger_id, account_type, entity_type, entity_id, name)
    VALUES (p_ledger_id, 'user_spendable_balance', 'user', p_user_id, 'User ' || p_user_id || ' Spendable Balance')
    RETURNING id INTO v_spendable_id;
  END IF;

  -- Create transaction
  INSERT INTO transactions (
    ledger_id, reference_id, transaction_type, amount, description, status, metadata
  ) VALUES (
    p_ledger_id,
    'credit_convert_' || gen_random_uuid()::text,
    'credit_conversion',
    v_amount,
    format('Convert %s credits to $%s spendable', p_amount_cents, v_amount),
    'completed',
    jsonb_build_object('user_id', p_user_id, 'amount_cents', p_amount_cents)
  )
  RETURNING id INTO v_txn_id;

  -- Balanced double entry: DR wallet, CR spendable
  INSERT INTO entries (transaction_id, account_id, entry_type, amount)
  VALUES
    (v_txn_id, v_wallet_id, 'debit', v_amount),
    (v_txn_id, v_spendable_id, 'credit', v_amount);

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_txn_id,
    'amount_cents', p_amount_cents,
    'spendable_usd', v_amount,
    'wallet_remaining_cents', ROUND((v_wallet_balance - v_amount) * 100)
  );
END;
$$;
