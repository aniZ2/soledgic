-- ============================================================================
-- Dispute Holds (Event-Driven)
-- Adds a dispute reserve account type mapping and helper functions so inbound
-- processor dispute events can lock/release creator funds without mutating
-- historical sale transactions.
-- ============================================================================

-- Extend reserve account helper to support a dedicated dispute reserve.
CREATE OR REPLACE FUNCTION public.get_or_create_reserve_account(
  p_ledger_id uuid,
  p_rule_type text
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_account_id uuid;
  v_account_name text;
  v_type text := COALESCE(NULLIF(p_rule_type, ''), 'reserve');
BEGIN
  v_account_name := CASE v_type
    WHEN 'tax_reserve' THEN 'Tax Withholding Reserve'
    WHEN 'refund_buffer' THEN 'Refund Reserve'
    WHEN 'platform_hold' THEN 'Platform Hold Reserve'
    WHEN 'compliance_hold' THEN 'Compliance Hold Reserve'
    WHEN 'dispute' THEN 'Dispute Reserve'
    ELSE 'Withholding Reserve'
  END;

  SELECT id INTO v_account_id
  FROM accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'reserve'
    AND name = v_account_name;

  IF v_account_id IS NULL THEN
    INSERT INTO accounts (ledger_id, account_type, entity_type, name, metadata)
    VALUES (
      p_ledger_id,
      'reserve',
      'platform',
      v_account_name,
      jsonb_build_object('reserve_type', v_type)
    )
    RETURNING id INTO v_account_id;
  END IF;

  RETURN v_account_id;
END;
$$;

-- Ensure releases debit the same reserve account used for the hold.
-- For dispute holds (withholding_rule_id IS NULL) we always use the dispute reserve.
CREATE OR REPLACE FUNCTION public.release_held_funds(
  p_held_fund_id uuid,
  p_release_reason text DEFAULT 'Manual release'
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_held RECORD;
  v_release_tx_id uuid;
  v_reserve_account_id uuid;
  v_creator_account_id uuid;
  v_rule_type text;
BEGIN
  SELECT * INTO v_held FROM held_funds WHERE id = p_held_fund_id;

  IF v_held IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Held fund not found');
  END IF;

  IF v_held.status = 'released' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already released');
  END IF;

  SELECT id INTO v_creator_account_id
  FROM accounts
  WHERE ledger_id = v_held.ledger_id
    AND account_type = 'creator_balance'
    AND entity_id = v_held.creator_id;

  v_rule_type := CASE
    WHEN v_held.withholding_rule_id IS NULL THEN 'dispute'
    ELSE (SELECT rule_type FROM withholding_rules WHERE id = v_held.withholding_rule_id)
  END;

  SELECT get_or_create_reserve_account(v_held.ledger_id, v_rule_type)
  INTO v_reserve_account_id;

  INSERT INTO transactions (
    ledger_id,
    transaction_type,
    description,
    amount,
    status,
    metadata
  ) VALUES (
    v_held.ledger_id,
    'transfer',
    'Release held funds: ' || p_release_reason,
    v_held.held_amount - v_held.released_amount,
    'completed',
    jsonb_build_object(
      'held_fund_id', p_held_fund_id,
      'creator_id', v_held.creator_id,
      'release_reason', p_release_reason
    )
  )
  RETURNING id INTO v_release_tx_id;

  INSERT INTO entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_release_tx_id, v_reserve_account_id, 'debit', v_held.held_amount - v_held.released_amount);

  INSERT INTO entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_release_tx_id, v_creator_account_id, 'credit', v_held.held_amount - v_held.released_amount);

  UPDATE held_funds
  SET status = 'released',
      released_amount = held_amount,
      released_at = NOW(),
      release_transaction_id = v_release_tx_id,
      release_reason = p_release_reason,
      updated_at = NOW()
  WHERE id = p_held_fund_id;

  RETURN jsonb_build_object(
    'success', true,
    'released_amount', v_held.held_amount - v_held.released_amount,
    'release_transaction_id', v_release_tx_id
  );
END;
$$;

-- Apply an event-driven dispute hold (locks creator funds by moving them to a dispute reserve).
-- Idempotent by dispute id: repeated calls return the existing held_funds id.
CREATE OR REPLACE FUNCTION public.apply_dispute_hold(
  p_ledger_id uuid,
  p_creator_id text,
  p_dispute_id text,
  p_amount numeric(14,2),
  p_source_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hold_reason text;
  v_existing RECORD;
  v_creator_account_id uuid;
  v_reserve_account_id uuid;
  v_hold_tx_id uuid;
  v_held_fund_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  v_hold_reason := 'dispute:' || COALESCE(NULLIF(trim(p_dispute_id), ''), 'unknown');

  SELECT * INTO v_existing
  FROM held_funds
  WHERE ledger_id = p_ledger_id
    AND withholding_rule_id IS NULL
    AND hold_reason = v_hold_reason
    AND status IN ('held', 'partial')
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'held_fund_id', v_existing.id, 'transaction_id', v_existing.transaction_id, 'idempotent', true);
  END IF;

  SELECT id INTO v_creator_account_id
  FROM accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'creator_balance'
    AND entity_id = p_creator_id
  LIMIT 1;

  IF v_creator_account_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Creator account not found');
  END IF;

  SELECT get_or_create_reserve_account(p_ledger_id, 'dispute')
  INTO v_reserve_account_id;

  INSERT INTO transactions (
    ledger_id,
    transaction_type,
    description,
    amount,
    status,
    metadata
  ) VALUES (
    p_ledger_id,
    'transfer',
    'Dispute hold: ' || v_hold_reason,
    p_amount,
    'completed',
    jsonb_build_object(
      'dispute_id', p_dispute_id,
      'creator_id', p_creator_id,
      'source_reference', p_source_reference,
      'hold_reason', v_hold_reason
    )
  )
  RETURNING id INTO v_hold_tx_id;

  -- Move funds: Creator Balance -> Dispute Reserve
  INSERT INTO entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_hold_tx_id, v_creator_account_id, 'debit', p_amount);

  INSERT INTO entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_hold_tx_id, v_reserve_account_id, 'credit', p_amount);

  INSERT INTO held_funds (
    ledger_id,
    transaction_id,
    withholding_rule_id,
    creator_id,
    held_amount,
    release_eligible_at,
    hold_reason
  ) VALUES (
    p_ledger_id,
    v_hold_tx_id,
    NULL,
    p_creator_id,
    p_amount,
    NOW(),
    v_hold_reason
  )
  RETURNING id INTO v_held_fund_id;

  RETURN jsonb_build_object(
    'success', true,
    'held_fund_id', v_held_fund_id,
    'transaction_id', v_hold_tx_id
  );
END;
$$;

-- SECURITY: dispute holds move funds and must be service-role only.
REVOKE EXECUTE ON FUNCTION public.apply_dispute_hold(uuid, text, text, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_dispute_hold(uuid, text, text, numeric, text) TO service_role;
