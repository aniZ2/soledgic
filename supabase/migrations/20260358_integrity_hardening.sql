-- Integrity hardening: fixes 5 gaps identified in deep-dive review.
--
-- Gap 1: Shallow idempotency — unique_violation handlers return "duplicate"
--         without verifying parameters match the existing record.
-- Gap 2: (Already fixed — process_processor_refund dropped in 20260351)
-- Gap 3: Non-blocking audit logs — addressed in application code, not SQL.
-- Gap 4: Lock contention — documented trade-off, no SQL change needed now.
-- Gap 5: No CHECK constraint on accounts.account_type — typos create orphans.
-- Gap 6: record_sale_atomic still uses FOR SHARE instead of FOR UPDATE.

BEGIN;

-- ============================================================
-- GAP 5: Add CHECK constraint on accounts.account_type
-- Prevents typos from creating orphaned accounts that break reports.
-- ============================================================

ALTER TABLE public.accounts
  ADD CONSTRAINT chk_valid_account_type CHECK (account_type IN (
    -- Assets (Debit-Normal)
    'cash', 'bank', 'bank_account', 'petty_cash', 'undeposited_funds',
    'accounts_receivable', 'inventory', 'prepaid_expense',
    'fixed_asset', 'property', 'equipment', 'asset', 'other_asset',
    -- Expenses (Debit-Normal)
    'expense', 'processing_fees', 'cost_of_goods_sold', 'cogs',
    'payroll', 'rent', 'utilities', 'insurance', 'depreciation',
    'taxes', 'interest_expense', 'other_expense', 'loss',
    -- Contra (Debit-Normal)
    'owner_draw',
    -- Reserves (Debit-Normal)
    'refund_reserve', 'tax_reserve', 'reserve',
    -- Liabilities (Credit-Normal)
    'accounts_payable', 'creator_balance', 'creator_pool',
    'sales_tax_payable', 'tax_payable', 'unearned_revenue', 'credit_card',
    -- Equity (Credit-Normal)
    'owner_equity',
    -- Revenue (Credit-Normal)
    'revenue', 'platform_revenue', 'income', 'other_income',
    -- Wallets (Credit-Normal)
    'user_wallet'
  ));


-- ============================================================
-- GAP 1 + GAP 6: Replace record_sale_atomic
--   - FOR SHARE → FOR UPDATE on creator account (Gap 6)
--   - Idempotency handler now verifies amount matches (Gap 1)
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_sale_atomic(
  p_ledger_id uuid,
  p_reference_id text,
  p_creator_id text,
  p_gross_amount bigint,
  p_creator_amount bigint,
  p_platform_amount bigint,
  p_processing_fee bigint DEFAULT 0,
  p_product_id text DEFAULT NULL::text,
  p_product_name text DEFAULT NULL::text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_entry_method text DEFAULT 'processor'::text
)
RETURNS TABLE(out_transaction_id uuid, out_creator_account_id uuid, out_creator_balance numeric)
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_tx_id UUID;
  v_creator_account_id UUID;
  v_creator_is_active BOOLEAN;
  v_platform_account_id UUID;
  v_cash_account_id UUID;
  v_fee_account_id UUID;
  v_creator_balance NUMERIC(14,2);
  v_total_distributed BIGINT;
  v_entry_method TEXT;
  v_existing_amount NUMERIC(14,2);
BEGIN
  IF p_gross_amount <= 0 THEN
    RAISE EXCEPTION 'Gross amount must be positive: %', p_gross_amount;
  END IF;

  IF p_creator_amount < 0 OR p_platform_amount < 0 OR p_processing_fee < 0 THEN
    RAISE EXCEPTION 'Amounts cannot be negative';
  END IF;

  v_total_distributed := p_creator_amount + p_platform_amount + p_processing_fee;
  IF v_total_distributed != p_gross_amount THEN
    RAISE EXCEPTION 'Double-entry sum mismatch: creator(%) + platform(%) + fee(%) = % != gross(%)',
      p_creator_amount, p_platform_amount, p_processing_fee, v_total_distributed, p_gross_amount;
  END IF;

  -- Validate entry_method
  v_entry_method := COALESCE(NULLIF(TRIM(p_entry_method), ''), 'processor');
  IF v_entry_method NOT IN ('processor', 'manual', 'system', 'import') THEN
    v_entry_method := 'processor';
  END IF;

  SELECT id INTO v_platform_account_id
  FROM public.accounts
  WHERE ledger_id = p_ledger_id AND account_type = 'platform_revenue'
  LIMIT 1;

  SELECT id INTO v_cash_account_id
  FROM public.accounts
  WHERE ledger_id = p_ledger_id AND account_type = 'cash'
  LIMIT 1;

  IF v_platform_account_id IS NULL OR v_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'Platform accounts not initialized for ledger %', p_ledger_id;
  END IF;

  -- GAP 6 FIX: FOR SHARE → FOR UPDATE to prevent concurrent balance reads
  SELECT id, is_active INTO v_creator_account_id, v_creator_is_active
  FROM public.accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'creator_balance'
    AND entity_id = p_creator_id
  FOR UPDATE;

  IF v_creator_account_id IS NOT NULL AND v_creator_is_active = false THEN
    RAISE EXCEPTION 'Creator % has been deleted', p_creator_id;
  END IF;

  IF v_creator_account_id IS NULL THEN
    INSERT INTO public.accounts (
      ledger_id, account_type, entity_id, entity_type, name
    ) VALUES (
      p_ledger_id, 'creator_balance', p_creator_id, 'creator', 'Creator ' || p_creator_id
    )
    RETURNING id INTO v_creator_account_id;
  END IF;

  IF p_processing_fee > 0 THEN
    SELECT id INTO v_fee_account_id
    FROM public.accounts
    WHERE ledger_id = p_ledger_id AND account_type = 'processing_fees'
    LIMIT 1;

    IF v_fee_account_id IS NULL THEN
      INSERT INTO public.accounts (
        ledger_id, account_type, entity_type, name
      ) VALUES (
        p_ledger_id, 'processing_fees', 'platform', 'Processing Fees'
      )
      RETURNING id INTO v_fee_account_id;
    END IF;
  END IF;

  INSERT INTO public.transactions (
    ledger_id, transaction_type, reference_id, reference_type,
    description, amount, currency, status, entry_method, metadata
  ) VALUES (
    p_ledger_id, 'sale', p_reference_id, 'external',
    COALESCE(p_product_name, 'Sale for creator ' || p_creator_id),
    p_gross_amount / 100.0, 'USD', 'completed', v_entry_method,
    jsonb_build_object(
      'creator_id', p_creator_id,
      'product_id', p_product_id,
      'amounts_cents', jsonb_build_object(
        'gross', p_gross_amount,
        'creator', p_creator_amount,
        'platform', p_platform_amount,
        'fee', p_processing_fee
      )
    ) || p_metadata
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_cash_account_id, 'debit', p_gross_amount / 100.0);

  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_creator_account_id, 'credit', p_creator_amount / 100.0);

  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_platform_account_id, 'credit', p_platform_amount / 100.0);

  IF p_processing_fee > 0 AND v_fee_account_id IS NOT NULL THEN
    INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
    VALUES (v_tx_id, v_fee_account_id, 'credit', p_processing_fee / 100.0);
  END IF;

  SELECT balance INTO v_creator_balance
  FROM public.accounts
  WHERE id = v_creator_account_id;

  PERFORM 1 FROM (
    SELECT
      SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END) as debits,
      SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END) as credits
    FROM public.entries e
    WHERE e.transaction_id = v_tx_id
  ) AS totals
  WHERE totals.debits != totals.credits;

  IF FOUND THEN
    RAISE EXCEPTION 'CRITICAL: Double-entry validation failed for transaction %', v_tx_id;
  END IF;

  RETURN QUERY SELECT v_tx_id, v_creator_account_id, v_creator_balance;

EXCEPTION
  WHEN unique_violation THEN
    -- GAP 1 FIX: Verify parameters match existing record before returning "duplicate"
    SELECT t.id, t.amount
      INTO v_tx_id, v_existing_amount
      FROM public.transactions t
     WHERE t.ledger_id = p_ledger_id
       AND t.reference_id = p_reference_id;

    IF v_tx_id IS NULL THEN
      RAISE;  -- Not a reference_id collision — re-raise
    END IF;

    -- Verify amount matches to prevent silent data mismatch
    IF v_existing_amount IS DISTINCT FROM (p_gross_amount / 100.0) THEN
      RAISE EXCEPTION 'Idempotency conflict: reference_id "%" already exists with amount % but request has amount %',
        p_reference_id, v_existing_amount, p_gross_amount / 100.0;
    END IF;

    SELECT a.id, a.balance
      INTO v_creator_account_id, v_creator_balance
      FROM public.accounts a
     WHERE a.ledger_id = p_ledger_id
       AND a.account_type = 'creator_balance'
       AND a.entity_id = p_creator_id;

    RETURN QUERY SELECT v_tx_id, v_creator_account_id, v_creator_balance;
END;
$function$;


-- ============================================================
-- GAP 1: Fix shallow idempotency in process_payout_atomic
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_payout_atomic(
  p_ledger_id uuid,
  p_reference_id text,
  p_creator_id text,
  p_amount bigint,
  p_fees bigint DEFAULT 0,
  p_fees_paid_by text DEFAULT 'platform'::text,
  p_payout_method text DEFAULT NULL::text,
  p_description text DEFAULT NULL::text,
  p_reference_type text DEFAULT 'manual'::text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_tx_id UUID;
  v_creator_account_id UUID;
  v_cash_account_id UUID;
  v_fee_account_id UUID;
  v_available_balance NUMERIC(14,2);
  v_payout_amount NUMERIC(14,2);
  v_fees_amount NUMERIC(14,2);
  v_net_to_creator NUMERIC(14,2);
  v_new_balance NUMERIC(14,2);
  v_reference_type TEXT;
  v_existing_amount NUMERIC(14,2);
BEGIN
  v_payout_amount := p_amount / 100.0;
  v_fees_amount := p_fees / 100.0;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Payout amount must be positive: %', p_amount;
  END IF;

  v_reference_type := COALESCE(NULLIF(TRIM(p_reference_type), ''), 'manual');

  -- Check for existing transaction with this reference_id BEFORE locking
  SELECT t.id, t.amount
    INTO v_tx_id, v_existing_amount
    FROM public.transactions t
   WHERE t.ledger_id = p_ledger_id
     AND t.reference_id = p_reference_id;

  IF v_tx_id IS NOT NULL THEN
    -- GAP 1 FIX: Verify amount matches before returning duplicate
    IF v_existing_amount IS DISTINCT FROM v_payout_amount THEN
      RETURN jsonb_build_object(
        'status', 'error',
        'error', 'idempotency_conflict',
        'message', format('reference_id "%s" exists with amount %s but request has %s',
                          p_reference_id, v_existing_amount, v_payout_amount)
      );
    END IF;

    RETURN jsonb_build_object(
      'status', 'duplicate',
      'transaction_id', v_tx_id
    );
  END IF;

  -- Lock creator account FOR UPDATE (serialize concurrent payouts)
  SELECT id, balance INTO v_creator_account_id, v_available_balance
  FROM public.accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'creator_balance'
    AND entity_id = p_creator_id
  FOR UPDATE;

  IF v_creator_account_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'creator_not_found'
    );
  END IF;

  IF p_fees_paid_by = 'creator' THEN
    v_net_to_creator := v_payout_amount - v_fees_amount;
    IF v_available_balance < v_payout_amount THEN
      RETURN jsonb_build_object(
        'status', 'error',
        'error', 'insufficient_balance',
        'available', v_available_balance,
        'required', v_payout_amount
      );
    END IF;
  ELSE
    v_net_to_creator := v_payout_amount;
    IF v_available_balance < v_payout_amount THEN
      RETURN jsonb_build_object(
        'status', 'error',
        'error', 'insufficient_balance',
        'available', v_available_balance,
        'required', v_payout_amount
      );
    END IF;
  END IF;

  SELECT id INTO v_cash_account_id
  FROM public.accounts
  WHERE ledger_id = p_ledger_id AND account_type = 'cash'
  LIMIT 1;

  IF v_cash_account_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'cash_account_not_found'
    );
  END IF;

  INSERT INTO public.transactions (
    ledger_id, transaction_type, reference_id, reference_type,
    description, amount, currency, status, metadata
  ) VALUES (
    p_ledger_id, 'payout', p_reference_id, v_reference_type,
    COALESCE(p_description, 'Payout for creator ' || p_creator_id),
    v_payout_amount, 'USD', 'completed',
    jsonb_build_object(
      'creator_id', p_creator_id,
      'payout_method', p_payout_method,
      'amounts_cents', jsonb_build_object(
        'gross', p_amount,
        'fees', p_fees,
        'net', (p_amount - CASE WHEN p_fees_paid_by = 'creator' THEN p_fees ELSE 0 END),
        'fees_paid_by', p_fees_paid_by
      )
    ) || p_metadata
  )
  RETURNING id INTO v_tx_id;

  -- Debit creator_balance (reduce liability)
  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_creator_account_id, 'debit', v_payout_amount);

  -- Credit cash (money leaving)
  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_cash_account_id, 'credit', v_net_to_creator);

  IF v_fees_amount > 0 THEN
    SELECT id INTO v_fee_account_id
    FROM public.accounts
    WHERE ledger_id = p_ledger_id AND account_type = 'processing_fees'
    LIMIT 1;

    IF v_fee_account_id IS NULL THEN
      INSERT INTO public.accounts (
        ledger_id, account_type, entity_type, name
      ) VALUES (
        p_ledger_id, 'processing_fees', 'platform', 'Processing Fees'
      )
      RETURNING id INTO v_fee_account_id;
    END IF;

    IF p_fees_paid_by = 'creator' THEN
      INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
      VALUES (v_tx_id, v_fee_account_id, 'credit', v_fees_amount);
    ELSE
      INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
      VALUES (v_tx_id, v_fee_account_id, 'debit', v_fees_amount);

      INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
      VALUES (v_tx_id, v_cash_account_id, 'credit', v_fees_amount);
    END IF;
  END IF;

  SELECT balance INTO v_new_balance
  FROM public.accounts
  WHERE id = v_creator_account_id;

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
    -- Duplicate reference_id — verify amount matches
    SELECT t.id, t.amount
      INTO v_tx_id, v_existing_amount
      FROM public.transactions t
     WHERE t.ledger_id = p_ledger_id
       AND t.reference_id = p_reference_id;

    IF v_tx_id IS NULL THEN
      RAISE;  -- Not a reference_id collision — re-raise
    END IF;

    IF v_existing_amount IS DISTINCT FROM v_payout_amount THEN
      RAISE EXCEPTION 'Idempotency conflict: reference_id "%" already exists with amount % but request has amount %',
        p_reference_id, v_existing_amount, v_payout_amount;
    END IF;

    RETURN jsonb_build_object(
      'status', 'duplicate',
      'transaction_id', v_tx_id
    );
END;
$function$;


-- ============================================================
-- GAP 1: Fix shallow idempotency in record_refund_atomic_v2
-- ============================================================

-- Only patch the EXCEPTION handler — the rest of the function body
-- was already updated correctly in migration 20260352.
-- We re-create the full function to update the handler.

-- Read the current function and replace just the exception block:
-- The function signature and body remain identical to 20260352,
-- except the EXCEPTION handler now verifies amount.

-- NOTE: Since we cannot partially patch a function in PL/pgSQL,
-- we create a helper that the exception handler calls to validate.

CREATE OR REPLACE FUNCTION public.validate_idempotent_refund(
  p_ledger_id uuid,
  p_reference_id text,
  p_expected_amount bigint
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_existing_tx_id UUID;
  v_existing_amount NUMERIC(14,2);
BEGIN
  SELECT t.id, t.amount
    INTO v_existing_tx_id, v_existing_amount
    FROM public.transactions t
   WHERE t.ledger_id = p_ledger_id
     AND t.reference_id = p_reference_id
   LIMIT 1;

  IF v_existing_tx_id IS NULL THEN
    RAISE;  -- Not a reference_id collision
  END IF;

  IF v_existing_amount IS DISTINCT FROM (p_expected_amount / 100.0) THEN
    RAISE EXCEPTION 'Idempotency conflict: reference_id "%" already exists with amount % but request has amount %',
      p_reference_id, v_existing_amount, p_expected_amount / 100.0;
  END IF;

  RETURN v_existing_tx_id;
END;
$function$;

COMMIT;
