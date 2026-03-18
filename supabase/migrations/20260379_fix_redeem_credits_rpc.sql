-- Fix: redeem_credits RPC had a reference to v_liability_account_id
-- which was removed from the DECLARE block. Liability is settled during
-- the conversion step, not the redemption step.

CREATE OR REPLACE FUNCTION public.redeem_credits(
  p_ledger_id uuid,
  p_user_id text,
  p_creator_id text,
  p_amount_cents integer,
  p_reference_id text,
  p_description text DEFAULT 'Credit redemption',
  p_split_percent numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_spendable_account_id uuid;
  v_user_balance numeric;
  v_creator_account_id uuid;
  v_platform_account_id uuid;
  v_txn_id uuid;
  v_creator_share numeric;
  v_platform_share numeric;
  v_split numeric;
  v_amount numeric;
BEGIN
  v_amount := p_amount_cents / 100.0;

  -- Get user SPENDABLE balance (not wallet — wallet holds unconverted credits)
  SELECT id INTO v_spendable_account_id
  FROM accounts
  WHERE ledger_id = p_ledger_id AND account_type = 'user_spendable_balance' AND entity_id = p_user_id;

  IF v_spendable_account_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No spendable balance — convert credits first');
  END IF;

  -- Calculate spendable balance
  SELECT COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE -amount END), 0)
  INTO v_user_balance
  FROM entries e
  JOIN transactions t ON t.id = e.transaction_id
  WHERE e.account_id = v_spendable_account_id AND t.status = 'completed';

  IF v_user_balance < v_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient credit balance',
      'balance', v_user_balance,
      'requested', v_amount
    );
  END IF;

  -- Get accounts (liability already settled during conversion step)
  SELECT id INTO v_creator_account_id
  FROM accounts WHERE ledger_id = p_ledger_id AND account_type = 'creator_balance' AND entity_id = p_creator_id;

  SELECT id INTO v_platform_account_id
  FROM accounts WHERE ledger_id = p_ledger_id AND account_type = 'platform_revenue' LIMIT 1;

  IF v_creator_account_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Creator not found');
  END IF;

  -- Determine split (default 80/20)
  v_split := COALESCE(p_split_percent, 80);
  v_creator_share := ROUND(v_amount * v_split / 100, 2);
  v_platform_share := v_amount - v_creator_share;

  -- Create transaction
  INSERT INTO transactions (
    ledger_id, reference_id, transaction_type, amount, description, status,
    metadata
  ) VALUES (
    p_ledger_id, p_reference_id, 'credit_redemption', v_amount, p_description, 'completed',
    jsonb_build_object(
      'user_id', p_user_id, 'creator_id', p_creator_id,
      'split_percent', v_split, 'creator_share', v_creator_share,
      'platform_share', v_platform_share, 'funded_by', 'credits'
    )
  )
  RETURNING id INTO v_txn_id;

  -- Double entry:
  -- 1. DR user_spendable_balance (balance leaves user)
  INSERT INTO entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_txn_id, v_spendable_account_id, 'debit', v_amount);

  -- 2. CR creator_balance (creator earns)
  INSERT INTO entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_txn_id, v_creator_account_id, 'credit', v_creator_share);

  -- 3. CR platform_revenue (platform's share)
  IF v_platform_share > 0 AND v_platform_account_id IS NOT NULL THEN
    INSERT INTO entries (transaction_id, account_id, entry_type, amount)
    VALUES (v_txn_id, v_platform_account_id, 'credit', v_platform_share);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_txn_id,
    'amount', v_amount,
    'creator_share', v_creator_share,
    'platform_share', v_platform_share,
    'user_remaining_balance', v_user_balance - v_amount
  );
END;
$$;
