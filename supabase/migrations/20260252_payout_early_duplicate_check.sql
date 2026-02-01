-- Add explicit duplicate reference_id check BEFORE balance check in process_payout_atomic.
-- Without this, a duplicate payout submitted after the balance is drained returns
-- 'insufficient_balance' instead of 'duplicate' — semantically incorrect.
-- The unique_violation EXCEPTION handler remains as a last-resort safety net.

CREATE OR REPLACE FUNCTION process_payout_atomic(
  p_ledger_id      UUID,
  p_reference_id   TEXT,
  p_creator_id     TEXT,
  p_amount         BIGINT,              -- gross payout in cents
  p_fees           BIGINT DEFAULT 0,    -- fees in cents
  p_fees_paid_by   TEXT DEFAULT 'platform',
  p_payout_method  TEXT DEFAULT NULL,
  p_description    TEXT DEFAULT NULL,
  p_reference_type TEXT DEFAULT 'manual',
  p_metadata       JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_creator_account_id  UUID;
  v_cash_account_id     UUID;
  v_fee_account_id      UUID;
  v_tx_id               UUID;
  v_payout_amount       NUMERIC(14,2);
  v_fees_amount         NUMERIC(14,2);
  v_net_to_creator      NUMERIC(14,2);
  v_fees_by_platform    NUMERIC(14,2);
  v_ledger_balance      NUMERIC(14,2);
  v_total_held          NUMERIC(14,2);
  v_available_balance   NUMERIC(14,2);
  v_new_balance         NUMERIC(14,2);
BEGIN
  v_payout_amount := p_amount / 100.0;
  v_fees_amount   := p_fees / 100.0;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('status', 'error', 'error', 'amount_must_be_positive');
  END IF;

  -- 1. Lock the creator account row to serialize concurrent payouts.
  --    Any other payout for this creator will block here until we commit.
  SELECT id INTO v_creator_account_id
    FROM public.accounts
   WHERE ledger_id = p_ledger_id
     AND account_type = 'creator_balance'
     AND entity_id = p_creator_id
     FOR UPDATE;

  IF v_creator_account_id IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'error', 'creator_not_found');
  END IF;

  -- 1b. Check for duplicate reference_id (under lock, before balance check).
  --     Returns 'duplicate' regardless of current balance state.
  SELECT id INTO v_tx_id
    FROM public.transactions
   WHERE ledger_id = p_ledger_id
     AND reference_id = p_reference_id;

  IF v_tx_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'duplicate',
      'transaction_id', v_tx_id
    );
  END IF;

  v_tx_id := NULL;  -- Reset for later INSERT RETURNING

  -- 2. Get cash account.
  SELECT id INTO v_cash_account_id
    FROM public.accounts
   WHERE ledger_id = p_ledger_id
     AND account_type = 'cash'
   LIMIT 1;

  IF v_cash_account_id IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'error', 'cash_account_not_found');
  END IF;

  -- 3. Calculate the creator's ledger balance (under the row lock).
  --    Excludes voided/reversed transactions.
  SELECT COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN e.entry_type = 'debit'  THEN e.amount ELSE 0 END), 0)
    INTO v_ledger_balance
    FROM public.entries e
    JOIN public.transactions t ON t.id = e.transaction_id
   WHERE e.account_id = v_creator_account_id
     AND t.status NOT IN ('voided', 'reversed');

  -- 4. Subtract held funds.
  SELECT COALESCE(SUM(held_amount - released_amount), 0)
    INTO v_total_held
    FROM public.held_funds
   WHERE ledger_id = p_ledger_id
     AND creator_id = p_creator_id
     AND status IN ('held', 'partial');

  v_available_balance := v_ledger_balance - v_total_held;

  -- 5. Insufficient balance guard.
  IF v_available_balance < v_payout_amount THEN
    RETURN jsonb_build_object(
      'status', 'insufficient_balance',
      'ledger_balance', v_ledger_balance,
      'held_amount', v_total_held,
      'available', v_available_balance,
      'requested', v_payout_amount
    );
  END IF;

  -- 6. Calculate net amounts.
  v_net_to_creator   := v_payout_amount;
  v_fees_by_platform := 0;

  IF v_fees_amount > 0 AND p_fees_paid_by != 'creator' THEN
    v_fees_by_platform := v_fees_amount;
  ELSIF v_fees_amount > 0 THEN
    v_net_to_creator := v_payout_amount - v_fees_amount;
  END IF;

  -- 7. Insert the payout transaction.
  INSERT INTO public.transactions (
    ledger_id, transaction_type, reference_id, reference_type,
    description, amount, currency, status, metadata
  ) VALUES (
    p_ledger_id, 'payout', p_reference_id, p_reference_type,
    COALESCE(p_description, 'Payout to ' || p_creator_id),
    v_payout_amount, 'USD', 'completed',
    jsonb_build_object(
      'creator_id', p_creator_id,
      'payout_method', p_payout_method,
      'fees', v_fees_amount,
      'net_to_creator', v_net_to_creator
    ) || p_metadata
  )
  RETURNING id INTO v_tx_id;

  -- 8. Insert entries: debit creator balance, credit cash.
  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_creator_account_id, 'debit', v_payout_amount);

  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_cash_account_id, 'credit', v_payout_amount + v_fees_by_platform);

  -- 9. Handle platform-paid fees.
  IF v_fees_by_platform > 0 THEN
    SELECT id INTO v_fee_account_id
      FROM public.accounts
     WHERE ledger_id = p_ledger_id
       AND account_type = 'processing_fees'
     LIMIT 1;

    IF v_fee_account_id IS NULL THEN
      INSERT INTO public.accounts (ledger_id, account_type, entity_type, name)
      VALUES (p_ledger_id, 'processing_fees', 'platform', 'Payout Fees')
      RETURNING id INTO v_fee_account_id;
    END IF;

    INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
    VALUES (v_tx_id, v_fee_account_id, 'debit', v_fees_by_platform);
  END IF;

  v_new_balance := v_available_balance - v_payout_amount;

  RETURN jsonb_build_object(
    'status', 'created',
    'transaction_id', v_tx_id,
    'gross_payout', v_payout_amount,
    'fees', v_fees_amount,
    'net_to_creator', v_net_to_creator,
    'previous_balance', v_available_balance,
    'new_balance', v_new_balance
  );

EXCEPTION
  WHEN unique_violation THEN
    -- Duplicate reference_id — return existing transaction (idempotent)
    SELECT id INTO v_tx_id
      FROM public.transactions
     WHERE ledger_id = p_ledger_id
       AND reference_id = p_reference_id;

    RETURN jsonb_build_object(
      'status', 'duplicate',
      'transaction_id', v_tx_id
    );
END;
$$;
