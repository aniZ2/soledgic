-- Rolling payout delay, creator risk scoring, and platform risk signal ingestion.

-- ============================================================
-- 1. Creator risk fields on connected_accounts
-- ============================================================
ALTER TABLE public.connected_accounts
  ADD COLUMN IF NOT EXISTS risk_score smallint DEFAULT 0
    CHECK (risk_score >= 0 AND risk_score <= 100),
  ADD COLUMN IF NOT EXISTS risk_flags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS payout_delay_days smallint DEFAULT 7,
  ADD COLUMN IF NOT EXISTS payout_delay_reason text;

COMMENT ON COLUMN public.connected_accounts.risk_score IS 'Behavioral risk score 0-100 for this creator';
COMMENT ON COLUMN public.connected_accounts.risk_flags IS 'Array of risk flags: high_refund_rate, chargeback_history, new_creator, etc.';
COMMENT ON COLUMN public.connected_accounts.payout_delay_days IS 'Rolling payout delay in days (default 7). Higher risk = longer delay.';
COMMENT ON COLUMN public.connected_accounts.payout_delay_reason IS 'Why the delay was set: default, risk_elevated, admin_override';

-- ============================================================
-- 2. Apply payout hold (rolling delay)
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_payout_hold(
  p_ledger_id uuid,
  p_creator_id text,
  p_transaction_id uuid,
  p_amount numeric,
  p_delay_days integer DEFAULT 7,
  p_reason text DEFAULT 'rolling_delay'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_creator_account_id uuid;
  v_reserve_account_id uuid;
  v_hold_tx_id uuid;
  v_held_fund_id uuid;
  v_hold_reason text;
  v_existing RECORD;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  v_hold_reason := p_reason || ':' || p_transaction_id::text;

  -- Idempotent: skip if already held
  SELECT * INTO v_existing
  FROM public.held_funds
  WHERE ledger_id = p_ledger_id
    AND hold_reason = v_hold_reason
    AND status IN ('held', 'partial')
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'held_fund_id', v_existing.id, 'idempotent', true);
  END IF;

  -- Get creator account
  SELECT id INTO v_creator_account_id
  FROM public.accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'creator_balance'
    AND entity_id = p_creator_id
  LIMIT 1;

  IF v_creator_account_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Creator account not found');
  END IF;

  -- Get or create rolling delay reserve account
  SELECT public.get_or_create_reserve_account(p_ledger_id, 'payout_delay')
  INTO v_reserve_account_id;

  -- Create hold transaction
  INSERT INTO public.transactions (
    ledger_id, transaction_type, reference_id, description,
    amount, currency, status, metadata
  ) VALUES (
    p_ledger_id, 'transfer',
    'payout_hold_' || p_transaction_id::text,
    'Payout hold (' || p_delay_days || ' day delay)',
    p_amount, 'USD', 'completed',
    jsonb_build_object(
      'creator_id', p_creator_id,
      'source_transaction_id', p_transaction_id,
      'delay_days', p_delay_days,
      'hold_reason', p_reason
    )
  )
  RETURNING id INTO v_hold_tx_id;

  -- Double-entry: creator_balance (debit) → payout_delay reserve (credit)
  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_hold_tx_id, v_creator_account_id, 'debit', p_amount);

  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_hold_tx_id, v_reserve_account_id, 'credit', p_amount);

  -- Register in held_funds with release date
  INSERT INTO public.held_funds (
    ledger_id, transaction_id, creator_id,
    held_amount, release_eligible_at, hold_reason
  ) VALUES (
    p_ledger_id, v_hold_tx_id, p_creator_id,
    p_amount,
    NOW() + (p_delay_days || ' days')::interval,
    v_hold_reason
  )
  RETURNING id INTO v_held_fund_id;

  RETURN jsonb_build_object(
    'success', true,
    'held_fund_id', v_held_fund_id,
    'transaction_id', v_hold_tx_id,
    'release_eligible_at', (NOW() + (p_delay_days || ' days')::interval)::text
  );
END;
$$;

COMMENT ON FUNCTION public.apply_payout_hold IS 'Hold payout funds for N days (rolling delay for chargeback protection)';

-- ============================================================
-- 3. Auto-release expired holds (called by cron)
-- ============================================================
CREATE OR REPLACE FUNCTION public.release_expired_holds(p_ledger_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_hold RECORD;
  v_released_count integer := 0;
  v_reserve_account_id uuid;
  v_creator_account_id uuid;
  v_release_tx_id uuid;
BEGIN
  FOR v_hold IN
    SELECT hf.id, hf.ledger_id, hf.creator_id, hf.held_amount, hf.transaction_id, hf.hold_reason
    FROM public.held_funds hf
    WHERE hf.status = 'held'
      AND hf.release_eligible_at <= NOW()
      AND (p_ledger_id IS NULL OR hf.ledger_id = p_ledger_id)
    ORDER BY hf.release_eligible_at ASC
    LIMIT 100  -- batch size
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Get accounts
    SELECT id INTO v_creator_account_id
    FROM public.accounts
    WHERE ledger_id = v_hold.ledger_id
      AND account_type = 'creator_balance'
      AND entity_id = v_hold.creator_id
    LIMIT 1;

    SELECT id INTO v_reserve_account_id
    FROM public.accounts
    WHERE ledger_id = v_hold.ledger_id
      AND account_type = 'reserve'
      AND name ILIKE '%payout_delay%'
    LIMIT 1;

    IF v_creator_account_id IS NULL OR v_reserve_account_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Create release transaction
    INSERT INTO public.transactions (
      ledger_id, transaction_type, reference_id, description,
      amount, currency, status, metadata
    ) VALUES (
      v_hold.ledger_id, 'transfer',
      'payout_release_' || v_hold.id::text,
      'Payout hold released',
      v_hold.held_amount, 'USD', 'completed',
      jsonb_build_object(
        'creator_id', v_hold.creator_id,
        'held_fund_id', v_hold.id,
        'original_hold_reason', v_hold.hold_reason
      )
    )
    RETURNING id INTO v_release_tx_id;

    -- Reverse the hold: reserve (debit) → creator_balance (credit)
    INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
    VALUES (v_release_tx_id, v_reserve_account_id, 'debit', v_hold.held_amount);

    INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
    VALUES (v_release_tx_id, v_creator_account_id, 'credit', v_hold.held_amount);

    -- Mark hold as released
    UPDATE public.held_funds
    SET status = 'released',
        released_amount = held_amount,
        released_at = NOW(),
        release_transaction_id = v_release_tx_id,
        release_reason = 'auto_expired'
    WHERE id = v_hold.id;

    v_released_count := v_released_count + 1;
  END LOOP;

  RETURN jsonb_build_object('released_count', v_released_count);
END;
$$;

COMMENT ON FUNCTION public.release_expired_holds IS 'Auto-release held funds whose delay period has elapsed (called by cron)';

-- ============================================================
-- 4. Update creator risk score function
--    Features:
--    - Cooldown debounce (skip if scored within last 30 seconds)
--    - Score smoothing (70% previous + 30% new event score)
--    - Positive signals (low refund rate, clean history reduce score)
--    - Amount-weighted refund/dispute impact
--    - Separated scoring from policy (score is pure signal, delay is policy)
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_creator_risk_score(
  p_ledger_id uuid,
  p_creator_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_connected_account_id uuid;
  v_previous_score smallint;
  v_last_updated timestamptz;
  v_account_age interval;
  v_total_sales integer;
  v_total_refunds integer;
  v_total_disputes integer;
  v_sale_volume_cents bigint;
  v_refund_volume_cents bigint;
  v_refund_rate numeric;
  v_refund_value_rate numeric;
  v_dispute_rate numeric;
  v_event_score integer := 0;
  v_final_score integer;
  v_flags text[] := '{}';
  v_delay_days integer;
BEGIN
  -- Get connected account with previous score
  SELECT id, risk_score, updated_at, (NOW() - created_at)
  INTO v_connected_account_id, v_previous_score, v_last_updated, v_account_age
  FROM public.connected_accounts
  WHERE ledger_id = p_ledger_id
    AND entity_id = p_creator_id
    AND is_active = true
  LIMIT 1;

  IF v_connected_account_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Creator not found');
  END IF;

  -- COOLDOWN: skip if scored within last 30 seconds (debounce rapid events)
  IF v_last_updated IS NOT NULL AND v_last_updated > NOW() - interval '30 seconds' THEN
    RETURN jsonb_build_object(
      'success', true,
      'risk_score', COALESCE(v_previous_score, 0),
      'debounced', true
    );
  END IF;

  -- Gather 90-day transaction stats (count + volume)
  SELECT
    count(*) FILTER (WHERE transaction_type = 'sale'),
    count(*) FILTER (WHERE transaction_type = 'refund'),
    COALESCE(SUM(amount * 100) FILTER (WHERE transaction_type = 'sale'), 0)::bigint,
    COALESCE(SUM(amount * 100) FILTER (WHERE transaction_type = 'refund'), 0)::bigint
  INTO v_total_sales, v_total_refunds, v_sale_volume_cents, v_refund_volume_cents
  FROM public.transactions
  WHERE ledger_id = p_ledger_id
    AND status = 'completed'
    AND created_at > NOW() - interval '90 days'
    AND metadata->>'creator_id' = p_creator_id;

  -- Count disputes (all time — disputes are serious)
  SELECT count(*)
  INTO v_total_disputes
  FROM public.held_funds
  WHERE ledger_id = p_ledger_id
    AND creator_id = p_creator_id
    AND hold_reason LIKE 'dispute:%';

  -- Calculate rates
  v_refund_rate := CASE WHEN v_total_sales > 0 THEN v_total_refunds::numeric / v_total_sales ELSE 0 END;
  v_refund_value_rate := CASE WHEN v_sale_volume_cents > 0 THEN v_refund_volume_cents::numeric / v_sale_volume_cents ELSE 0 END;
  v_dispute_rate := CASE WHEN v_total_sales > 0 THEN v_total_disputes::numeric / v_total_sales ELSE 0 END;

  -- ================================================================
  -- RISK FACTORS (add to event score)
  -- ================================================================

  -- Refund count rate: >15% = +15, >30% = +30
  IF v_refund_rate > 0.30 THEN
    v_event_score := v_event_score + 30;
    v_flags := array_append(v_flags, 'high_refund_rate');
  ELSIF v_refund_rate > 0.15 THEN
    v_event_score := v_event_score + 15;
    v_flags := array_append(v_flags, 'elevated_refund_rate');
  END IF;

  -- Refund VALUE rate (amount-weighted): >20% of volume refunded = +20, >40% = +35
  IF v_refund_value_rate > 0.40 THEN
    v_event_score := v_event_score + 35;
    v_flags := array_append(v_flags, 'high_refund_value_rate');
  ELSIF v_refund_value_rate > 0.20 THEN
    v_event_score := v_event_score + 20;
    v_flags := array_append(v_flags, 'elevated_refund_value_rate');
  END IF;

  -- Disputes (amount-weighted by severity)
  IF v_dispute_rate > 0.05 THEN
    v_event_score := v_event_score + 40;
    v_flags := array_append(v_flags, 'high_dispute_rate');
  ELSIF v_total_disputes > 0 THEN
    v_event_score := v_event_score + 20;
    v_flags := array_append(v_flags, 'has_disputes');
  END IF;

  -- New creator (< 30 days): +10 (uncertainty premium)
  IF v_account_age < interval '30 days' THEN
    v_event_score := v_event_score + 10;
    v_flags := array_append(v_flags, 'new_creator');
  END IF;

  -- ================================================================
  -- POSITIVE SIGNALS (subtract from event score — trust building)
  -- ================================================================

  -- Clean refund history: <5% refund rate with 20+ sales
  IF v_total_sales >= 20 AND v_refund_rate < 0.05 THEN
    v_event_score := v_event_score - 10;
    v_flags := array_append(v_flags, 'low_refund_rate');
  END IF;

  -- Zero disputes ever
  IF v_total_disputes = 0 AND v_total_sales >= 10 THEN
    v_event_score := v_event_score - 15;
    v_flags := array_append(v_flags, 'clean_dispute_history');
  END IF;

  -- Established creator (> 180 days)
  IF v_account_age > interval '180 days' THEN
    v_event_score := v_event_score - 5;
    v_flags := array_append(v_flags, 'established_creator');
  END IF;

  -- Clamp event score to 0-100
  v_event_score := GREATEST(0, LEAST(100, v_event_score));

  -- ================================================================
  -- SCORE SMOOTHING: blend previous score with new event score
  -- Prevents volatile jumps from single events
  -- Formula: final = previous * 0.7 + event * 0.3
  -- ================================================================
  IF v_previous_score IS NOT NULL AND v_previous_score > 0 THEN
    v_final_score := ROUND(v_previous_score * 0.7 + v_event_score * 0.3);
  ELSE
    v_final_score := v_event_score;
  END IF;

  v_final_score := GREATEST(0, LEAST(100, v_final_score));

  -- ================================================================
  -- POLICY LAYER: map score → payout delay
  -- This is separated from scoring so policy can change independently.
  -- ================================================================
  IF v_final_score >= 60 THEN v_delay_days := 14;
  ELSIF v_final_score >= 30 THEN v_delay_days := 10;
  ELSE v_delay_days := 7;
  END IF;

  -- Update connected account
  UPDATE public.connected_accounts
  SET risk_score = v_final_score,
      risk_flags = v_flags,
      payout_delay_days = v_delay_days,
      payout_delay_reason = CASE
        WHEN v_final_score >= 60 THEN 'risk_high'
        WHEN v_final_score >= 30 THEN 'risk_elevated'
        ELSE 'default'
      END,
      updated_at = NOW()
  WHERE id = v_connected_account_id;

  RETURN jsonb_build_object(
    'success', true,
    'risk_score', v_final_score,
    'previous_score', COALESCE(v_previous_score, 0),
    'event_score', v_event_score,
    'risk_flags', to_jsonb(v_flags),
    'payout_delay_days', v_delay_days,
    'refund_rate', round(v_refund_rate * 100, 1),
    'refund_value_rate', round(v_refund_value_rate * 100, 1),
    'dispute_rate', round(v_dispute_rate * 100, 1),
    'total_sales_90d', v_total_sales,
    'total_refunds_90d', v_total_refunds,
    'total_disputes', v_total_disputes,
    'debounced', false
  );
END;
$$;

COMMENT ON FUNCTION public.update_creator_risk_score IS 'Recalculate creator risk score with smoothing, positive signals, amount weighting, and cooldown debounce. Score is pure signal; payout delay is policy.';

-- ============================================================
-- 5. User risk profiles (cross-platform user behavioral risk)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_risk_profiles (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  ledger_id uuid NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  user_id text NOT NULL,              -- platform user identifier (wallet entity_id, buyer_id, etc.)
  risk_score smallint DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_flags text[] DEFAULT '{}',
  -- Behavioral counters (rolling 90-day window, updated by update_user_risk_score RPC)
  total_purchases_90d integer DEFAULT 0,
  total_refunds_90d integer DEFAULT 0,
  total_chargebacks integer DEFAULT 0,
  refund_rate numeric(5,2) DEFAULT 0,  -- 0.00 to 100.00
  last_purchase_at timestamptz,
  last_refund_at timestamptz,
  -- Enforcement
  is_blocked boolean DEFAULT false,
  blocked_at timestamptz,
  blocked_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (ledger_id, user_id)
);

COMMENT ON TABLE public.user_risk_profiles IS 'Per-user behavioral risk scores. Tracks purchase/refund velocity for buyer-side abuse detection.';

CREATE INDEX IF NOT EXISTS idx_user_risk_profiles_ledger
  ON public.user_risk_profiles (ledger_id);

CREATE INDEX IF NOT EXISTS idx_user_risk_profiles_high_risk
  ON public.user_risk_profiles (risk_score DESC)
  WHERE risk_score >= 50;

ALTER TABLE public.user_risk_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_risk_profiles_service_all ON public.user_risk_profiles
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 6. Transaction risk scores (per-transaction risk assessment)
-- ============================================================
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS risk_score smallint DEFAULT 0
    CHECK (risk_score >= 0 AND risk_score <= 100),
  ADD COLUMN IF NOT EXISTS risk_flags text[] DEFAULT '{}';

COMMENT ON COLUMN public.transactions.risk_score IS 'Per-transaction risk score (0=clean, 100=highest risk). Set at creation or updated by risk engine.';
COMMENT ON COLUMN public.transactions.risk_flags IS 'Per-transaction risk flags: large_amount, velocity_spike, new_user, flagged_creator, etc.';

CREATE INDEX IF NOT EXISTS idx_transactions_risk_score
  ON public.transactions (risk_score DESC)
  WHERE risk_score >= 50;

-- ============================================================
-- 7. Platform risk profiles (per-org risk aggregation)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_risk_profiles (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
  risk_score smallint DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_tier text DEFAULT 'standard' CHECK (risk_tier IN ('low', 'standard', 'elevated', 'high', 'critical')),
  -- Aggregate metrics (updated periodically)
  total_volume_30d_cents bigint DEFAULT 0,
  total_refunds_30d_cents bigint DEFAULT 0,
  total_chargebacks_30d integer DEFAULT 0,
  refund_rate_30d numeric(5,2) DEFAULT 0,
  chargeback_rate_30d numeric(5,4) DEFAULT 0,  -- industry standard: flag at 0.65%, critical at 1%
  active_creator_count integer DEFAULT 0,
  high_risk_creator_count integer DEFAULT 0,
  -- Enforcement (overrides org capabilities when risk is elevated)
  enforced_min_delay_days smallint,
  enforced_reserve_percent smallint,
  last_assessed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.platform_risk_profiles IS 'Per-organization (platform) aggregate risk profile. Updated periodically for cross-platform risk comparison.';

ALTER TABLE public.platform_risk_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY platform_risk_profiles_service_all ON public.platform_risk_profiles
  FOR ALL USING (auth.role() = 'service_role');
