-- Credit Redemption System
-- Double-entry accounting for in-app virtual credits.
--
-- Credits earned:  DR platform_marketing_expense → CR credits_liability
-- Credits spent:   DR credits_liability → CR creator_balance (via split)
-- Payout:          DR creator_balance → CR cash (existing flow)
--
-- Budget controls prevent infinite credit issuance.

-- ============================================================
-- 1. Credit budget settings on organizations
-- ============================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS credit_budget_monthly_cents integer DEFAULT 0;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS credits_issued_this_month_cents integer DEFAULT 0;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS credit_budget_reset_at timestamptz DEFAULT now();

-- ============================================================
-- 2. Ensure account types exist for credit accounting
-- ============================================================
-- Account types used:
--   credits_liability        — org's promise to pay for earned credits
--   platform_marketing_expense — cost of the free credit program
--   creator_balance           — already exists
--   platform_revenue          — already exists
--
-- These are created per-ledger via initialize_ledger_accounts or
-- on first credit operation.

-- ============================================================
-- 3. RPC: issue credits to a user (with budget enforcement)
-- ============================================================

CREATE OR REPLACE FUNCTION public.issue_credits(
  p_ledger_id uuid,
  p_user_id text,
  p_amount_cents integer,
  p_reason text DEFAULT 'engagement_reward',
  p_reference_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_budget integer;
  v_issued integer;
  v_reset_at timestamptz;
  v_liability_account_id uuid;
  v_expense_account_id uuid;
  v_user_wallet_id uuid;
  v_txn_id uuid;
BEGIN
  -- Get org and budget
  SELECT l.organization_id INTO v_org_id
  FROM ledgers l WHERE l.id = p_ledger_id;

  SELECT credit_budget_monthly_cents, credits_issued_this_month_cents, credit_budget_reset_at
  INTO v_budget, v_issued, v_reset_at
  FROM organizations WHERE id = v_org_id;

  -- Reset monthly counter if needed
  IF v_reset_at IS NULL OR v_reset_at < date_trunc('month', now()) THEN
    UPDATE organizations
    SET credits_issued_this_month_cents = 0,
        credit_budget_reset_at = date_trunc('month', now())
    WHERE id = v_org_id;
    v_issued := 0;
  END IF;

  -- Budget enforcement (0 = unlimited)
  IF v_budget > 0 AND (v_issued + p_amount_cents) > v_budget THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Monthly credit budget exhausted',
      'budget_cents', v_budget,
      'issued_cents', v_issued,
      'requested_cents', p_amount_cents
    );
  END IF;

  -- Ensure credits_liability account exists
  SELECT id INTO v_liability_account_id
  FROM accounts
  WHERE ledger_id = p_ledger_id AND account_type = 'credits_liability'
  LIMIT 1;

  IF v_liability_account_id IS NULL THEN
    INSERT INTO accounts (ledger_id, account_type, entity_type, entity_id, name)
    VALUES (p_ledger_id, 'credits_liability', 'system', 'credits_liability', 'Credits Liability')
    RETURNING id INTO v_liability_account_id;
  END IF;

  -- Ensure platform_marketing_expense account exists
  SELECT id INTO v_expense_account_id
  FROM accounts
  WHERE ledger_id = p_ledger_id AND account_type = 'platform_marketing_expense'
  LIMIT 1;

  IF v_expense_account_id IS NULL THEN
    INSERT INTO accounts (ledger_id, account_type, entity_type, entity_id, name)
    VALUES (p_ledger_id, 'platform_marketing_expense', 'system', 'marketing_expense', 'Platform Marketing Expense')
    RETURNING id INTO v_expense_account_id;
  END IF;

  -- Ensure user wallet exists
  SELECT id INTO v_user_wallet_id
  FROM accounts
  WHERE ledger_id = p_ledger_id AND account_type = 'user_wallet' AND entity_id = p_user_id
  LIMIT 1;

  IF v_user_wallet_id IS NULL THEN
    INSERT INTO accounts (ledger_id, account_type, entity_type, entity_id, name)
    VALUES (p_ledger_id, 'user_wallet', 'user', p_user_id, 'User ' || p_user_id || ' Credits')
    RETURNING id INTO v_user_wallet_id;
  END IF;

  -- Create transaction
  INSERT INTO transactions (
    ledger_id, reference_id, transaction_type, amount, description, status,
    metadata
  ) VALUES (
    p_ledger_id,
    COALESCE(p_reference_id, 'credit_issue_' || gen_random_uuid()::text),
    'credit_issue',
    p_amount_cents / 100.0,
    'Credit issued: ' || p_reason,
    'completed',
    jsonb_build_object('user_id', p_user_id, 'reason', p_reason, 'amount_cents', p_amount_cents)
  )
  RETURNING id INTO v_txn_id;

  -- Double entry:
  -- DR platform_marketing_expense (expense goes up)
  INSERT INTO entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_txn_id, v_expense_account_id, 'debit', p_amount_cents / 100.0);

  -- CR credits_liability (liability goes up)
  INSERT INTO entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_txn_id, v_liability_account_id, 'credit', p_amount_cents / 100.0);

  -- Also credit user wallet (so user sees their credit balance)
  -- This is balanced by the liability — not free money
  INSERT INTO entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_txn_id, v_user_wallet_id, 'credit', p_amount_cents / 100.0);

  -- Update budget counter
  UPDATE organizations
  SET credits_issued_this_month_cents = credits_issued_this_month_cents + p_amount_cents
  WHERE id = v_org_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_txn_id,
    'user_id', p_user_id,
    'amount_cents', p_amount_cents,
    'budget_remaining_cents', CASE WHEN v_budget > 0 THEN v_budget - v_issued - p_amount_cents ELSE -1 END
  );
END;
$$;

-- ============================================================
-- 4. RPC: redeem credits (user spends credits on content)
-- ============================================================

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

  -- 4. CR platform_revenue (platform's share — may be small or negative net effect)
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
