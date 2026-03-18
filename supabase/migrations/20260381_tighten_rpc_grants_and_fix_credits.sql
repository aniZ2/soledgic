-- ============================================================
-- 1. CRITICAL: Revoke anon/authenticated access to financial RPCs
-- ============================================================
-- These SECURITY DEFINER functions bypass RLS. They must only be
-- callable by service_role (edge functions use service_role client).
-- Without this, anyone with the Supabase URL can call them via PostgREST.

-- Credit system RPCs
REVOKE ALL ON FUNCTION public.issue_credits FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_credits TO service_role;

REVOKE ALL ON FUNCTION public.redeem_credits FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_credits TO service_role;

REVOKE ALL ON FUNCTION public.convert_credits FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_credits TO service_role;

-- Payout RPCs
DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.process_payout_atomic FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.process_payout_atomic TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- Sale RPCs
DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.record_sale_atomic FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.record_sale_atomic TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- Refund RPCs
DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.record_refund_atomic_v2 FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.record_refund_atomic_v2 TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- Webhook RPCs
DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.get_pending_webhooks FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.get_pending_webhooks TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.mark_webhook_delivered FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.mark_webhook_delivered TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.mark_webhook_failed FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.mark_webhook_failed TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.queue_webhook FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.queue_webhook TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- Hold/release RPCs
DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.release_held_funds FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.release_held_funds TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.release_expired_holds() FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.release_expired_holds() TO service_role;
EXCEPTION WHEN undefined_function THEN NULL;
          WHEN ambiguous_function THEN NULL; END $$;

-- Authority/suspension RPCs
REVOKE ALL ON FUNCTION public.set_capability_with_authority FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_capability_with_authority TO service_role;

REVOKE ALL ON FUNCTION public.suspend_organization FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.suspend_organization TO service_role;

REVOKE ALL ON FUNCTION public.reactivate_organization FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reactivate_organization TO service_role;

-- Cleanup RPC
DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.cleanup_ledger_data FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.cleanup_ledger_data TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- ============================================================
-- 2. CRITICAL: Add FOR UPDATE locks to credit RPCs
-- ============================================================

-- Fix issue_credits: lock org row before reading budget
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
  SELECT l.organization_id INTO v_org_id
  FROM ledgers l WHERE l.id = p_ledger_id;

  -- FOR UPDATE: lock org row to prevent concurrent budget races
  SELECT credit_budget_monthly_cents, credits_issued_this_month_cents, credit_budget_reset_at
  INTO v_budget, v_issued, v_reset_at
  FROM organizations WHERE id = v_org_id
  FOR UPDATE;

  IF v_reset_at IS NULL OR v_reset_at < date_trunc('month', now()) THEN
    UPDATE organizations
    SET credits_issued_this_month_cents = 0,
        credit_budget_reset_at = date_trunc('month', now())
    WHERE id = v_org_id;
    v_issued := 0;
  END IF;

  IF v_budget > 0 AND (v_issued + p_amount_cents) > v_budget THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Monthly credit budget exhausted',
      'budget_cents', v_budget,
      'issued_cents', v_issued,
      'requested_cents', p_amount_cents
    );
  END IF;

  SELECT id INTO v_liability_account_id
  FROM accounts WHERE ledger_id = p_ledger_id AND account_type = 'credits_liability' LIMIT 1;

  IF v_liability_account_id IS NULL THEN
    INSERT INTO accounts (ledger_id, account_type, entity_type, entity_id, name)
    VALUES (p_ledger_id, 'credits_liability', 'system', 'credits_liability', 'Credits Liability')
    RETURNING id INTO v_liability_account_id;
  END IF;

  SELECT id INTO v_expense_account_id
  FROM accounts WHERE ledger_id = p_ledger_id AND account_type = 'platform_marketing_expense' LIMIT 1;

  IF v_expense_account_id IS NULL THEN
    INSERT INTO accounts (ledger_id, account_type, entity_type, entity_id, name)
    VALUES (p_ledger_id, 'platform_marketing_expense', 'system', 'marketing_expense', 'Platform Marketing Expense')
    RETURNING id INTO v_expense_account_id;
  END IF;

  SELECT id INTO v_user_wallet_id
  FROM accounts WHERE ledger_id = p_ledger_id AND account_type = 'user_wallet' AND entity_id = p_user_id LIMIT 1;

  IF v_user_wallet_id IS NULL THEN
    INSERT INTO accounts (ledger_id, account_type, entity_type, entity_id, name)
    VALUES (p_ledger_id, 'user_wallet', 'user', p_user_id, 'User ' || p_user_id || ' Credits')
    RETURNING id INTO v_user_wallet_id;
  END IF;

  INSERT INTO transactions (
    ledger_id, reference_id, transaction_type, amount, description, status, metadata
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

  -- BALANCED double entry: 2 entries (1 debit, 1 credit)
  -- DR platform_marketing_expense (expense recognized)
  -- CR credits_liability (obligation created)
  -- User wallet balance is tracked via liability metadata, not a third entry.
  INSERT INTO entries (transaction_id, account_id, entry_type, amount)
  VALUES
    (v_txn_id, v_expense_account_id, 'debit', p_amount_cents / 100.0),
    (v_txn_id, v_liability_account_id, 'credit', p_amount_cents / 100.0);

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

-- Fix convert_credits: lock account row before reading balance
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
  v_liability_id uuid;
  v_amount numeric;
  v_txn_id uuid;
BEGIN
  v_amount := p_amount_cents / 100.0;

  IF p_amount_cents < p_min_conversion_cents THEN
    RETURN jsonb_build_object('success', false, 'error', format('Minimum conversion is %s cents', p_min_conversion_cents));
  END IF;

  -- FOR UPDATE: lock wallet account to prevent concurrent double-spend
  SELECT id INTO v_wallet_id
  FROM accounts
  WHERE ledger_id = p_ledger_id AND account_type = 'user_wallet' AND entity_id = p_user_id
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No credit balance found');
  END IF;

  -- Get liability account (needed to settle the promise)
  SELECT id INTO v_liability_id
  FROM accounts WHERE ledger_id = p_ledger_id AND account_type = 'credits_liability' LIMIT 1;

  -- Balance from liability entries tagged with this user
  -- Since issue_credits now only creates liability entries (not wallet entries),
  -- we track user credit balance through liability metadata
  SELECT COALESCE(SUM(
    CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE -e.amount END
  ), 0)
  INTO v_wallet_balance
  FROM entries e
  JOIN transactions t ON t.id = e.transaction_id
  WHERE e.account_id = v_liability_id
    AND t.status = 'completed'
    AND t.metadata->>'user_id' = p_user_id;

  IF v_wallet_balance < v_amount THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'Insufficient credit balance',
      'balance_cents', ROUND(v_wallet_balance * 100), 'requested_cents', p_amount_cents
    );
  END IF;

  SELECT id INTO v_spendable_id
  FROM accounts WHERE ledger_id = p_ledger_id AND account_type = 'user_spendable_balance' AND entity_id = p_user_id;

  IF v_spendable_id IS NULL THEN
    INSERT INTO accounts (ledger_id, account_type, entity_type, entity_id, name)
    VALUES (p_ledger_id, 'user_spendable_balance', 'user', p_user_id, 'User ' || p_user_id || ' Spendable Balance')
    RETURNING id INTO v_spendable_id;
  END IF;

  INSERT INTO transactions (
    ledger_id, reference_id, transaction_type, amount, description, status, metadata
  ) VALUES (
    p_ledger_id, 'credit_convert_' || gen_random_uuid()::text, 'credit_conversion',
    v_amount, format('Convert %s cents to spendable', p_amount_cents), 'completed',
    jsonb_build_object('user_id', p_user_id, 'amount_cents', p_amount_cents)
  )
  RETURNING id INTO v_txn_id;

  -- Balanced: DR liability (promise fulfilled), CR spendable (user gets balance)
  INSERT INTO entries (transaction_id, account_id, entry_type, amount)
  VALUES
    (v_txn_id, v_liability_id, 'debit', v_amount),
    (v_txn_id, v_spendable_id, 'credit', v_amount);

  RETURN jsonb_build_object(
    'success', true, 'transaction_id', v_txn_id,
    'amount_cents', p_amount_cents, 'spendable_usd', v_amount,
    'wallet_remaining_cents', ROUND((v_wallet_balance - v_amount) * 100)
  );
END;
$$;

-- Fix redeem_credits: lock spendable account before reading balance
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

  -- FOR UPDATE: lock spendable account to prevent concurrent double-spend
  SELECT id INTO v_spendable_account_id
  FROM accounts
  WHERE ledger_id = p_ledger_id AND account_type = 'user_spendable_balance' AND entity_id = p_user_id
  FOR UPDATE;

  IF v_spendable_account_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No spendable balance — convert credits first');
  END IF;

  SELECT COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE -amount END), 0)
  INTO v_user_balance
  FROM entries e JOIN transactions t ON t.id = e.transaction_id
  WHERE e.account_id = v_spendable_account_id AND t.status = 'completed';

  IF v_user_balance < v_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient credit balance',
      'balance', v_user_balance, 'requested', v_amount);
  END IF;

  SELECT id INTO v_creator_account_id
  FROM accounts WHERE ledger_id = p_ledger_id AND account_type = 'creator_balance' AND entity_id = p_creator_id;

  SELECT id INTO v_platform_account_id
  FROM accounts WHERE ledger_id = p_ledger_id AND account_type = 'platform_revenue' LIMIT 1;

  IF v_creator_account_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Creator not found');
  END IF;

  v_split := COALESCE(p_split_percent, 80);
  v_creator_share := ROUND(v_amount * v_split / 100, 2);
  v_platform_share := v_amount - v_creator_share;

  INSERT INTO transactions (
    ledger_id, reference_id, transaction_type, amount, description, status, metadata
  ) VALUES (
    p_ledger_id, p_reference_id, 'credit_redemption', v_amount, p_description, 'completed',
    jsonb_build_object('user_id', p_user_id, 'creator_id', p_creator_id,
      'split_percent', v_split, 'creator_share', v_creator_share,
      'platform_share', v_platform_share, 'funded_by', 'credits')
  )
  RETURNING id INTO v_txn_id;

  -- Balanced: DR spendable, CR creator + CR platform = total
  INSERT INTO entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_txn_id, v_spendable_account_id, 'debit', v_amount);

  INSERT INTO entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_txn_id, v_creator_account_id, 'credit', v_creator_share);

  IF v_platform_share > 0 AND v_platform_account_id IS NOT NULL THEN
    INSERT INTO entries (transaction_id, account_id, entry_type, amount)
    VALUES (v_txn_id, v_platform_account_id, 'credit', v_platform_share);
  END IF;

  RETURN jsonb_build_object('success', true, 'transaction_id', v_txn_id,
    'amount', v_amount, 'creator_share', v_creator_share,
    'platform_share', v_platform_share,
    'user_remaining_balance', v_user_balance - v_amount);
END;
$$;

-- Re-tighten grants on recreated functions
REVOKE ALL ON FUNCTION public.issue_credits FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_credits TO service_role;
REVOKE ALL ON FUNCTION public.convert_credits FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_credits TO service_role;
REVOKE ALL ON FUNCTION public.redeem_credits FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_credits TO service_role;

-- ============================================================
-- 3. MEDIUM: Add dashboard SELECT policies for risk_signals
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'risk_signals_dashboard_select') THEN
    CREATE POLICY risk_signals_dashboard_select ON public.risk_signals
      FOR SELECT TO authenticated
      USING (organization_id IN (
        SELECT om.organization_id FROM organization_members om
        WHERE om.user_id = auth.uid() AND om.status = 'active'
      ));
  END IF;
END $$;

-- ============================================================
-- 4. MEDIUM: Fix capabilities daily total to be org-wide
-- ============================================================
-- This is handled in code (capabilities.ts), not in this migration.
-- See the edge function changes in the commit.
