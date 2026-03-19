-- Add 3.5% Soledgic platform fee on every transaction.
-- Fee is deducted from the platform's share (creator's split unaffected).
-- Tracked in a separate soledgic_fee account for clean bookkeeping.

-- 0. Add soledgic_fee to the account_type CHECK constraint
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS chk_valid_account_type;
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_account_type_check;
ALTER TABLE public.accounts
  ADD CONSTRAINT chk_valid_account_type CHECK (account_type IN (
    'cash', 'bank', 'bank_account', 'petty_cash', 'undeposited_funds',
    'accounts_receivable', 'inventory', 'prepaid_expense',
    'fixed_asset', 'property', 'equipment', 'asset', 'other_asset',
    'expense', 'processing_fees', 'cost_of_goods_sold', 'cogs',
    'payroll', 'rent', 'utilities', 'insurance', 'depreciation',
    'taxes', 'interest_expense', 'other_expense', 'loss',
    'owner_draw',
    'refund_reserve', 'tax_reserve', 'reserve',
    'accounts_payable', 'creator_balance', 'creator_pool',
    'sales_tax_payable', 'tax_payable', 'unearned_revenue', 'credit_card',
    'owner_equity',
    'revenue', 'platform_revenue', 'soledgic_fee', 'income', 'other_income',
    'user_wallet'
  ));

-- 1. Add soledgic_fee account to marketplace bootstrapping
CREATE OR REPLACE FUNCTION public.initialize_ledger_accounts(p_ledger_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mode TEXT;
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.ledgers l ON l.organization_id = om.organization_id
      WHERE l.id = p_ledger_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  SELECT ledger_mode INTO v_mode FROM ledgers WHERE id = p_ledger_id;

  IF v_mode = 'marketplace' THEN
    INSERT INTO accounts (ledger_id, account_type, entity_type, name, entity_id)
    VALUES
      (p_ledger_id, 'platform_revenue', 'platform', 'Platform Revenue', NULL),
      (p_ledger_id, 'creator_pool', 'reserve', 'Creator Pool', NULL),
      (p_ledger_id, 'processing_fees', 'reserve', 'Processing Fees', NULL),
      (p_ledger_id, 'soledgic_fee', 'platform', 'Soledgic Platform Fee', NULL),
      (p_ledger_id, 'tax_reserve', 'reserve', 'Tax Reserve', NULL),
      (p_ledger_id, 'refund_reserve', 'reserve', 'Refund Reserve', NULL),
      (p_ledger_id, 'cash', 'business', 'Operating Cash', NULL)
    ON CONFLICT (ledger_id, account_type) WHERE entity_id IS NULL DO NOTHING;
  ELSE
    INSERT INTO accounts (ledger_id, account_type, entity_type, name, entity_id)
    VALUES
      (p_ledger_id, 'revenue', 'business', 'Revenue', NULL),
      (p_ledger_id, 'expense', 'business', 'Expenses', NULL),
      (p_ledger_id, 'cash', 'business', 'Cash', NULL),
      (p_ledger_id, 'accounts_receivable', 'business', 'Accounts Receivable', NULL),
      (p_ledger_id, 'accounts_payable', 'business', 'Accounts Payable', NULL),
      (p_ledger_id, 'owner_equity', 'business', 'Owner Equity', NULL),
      (p_ledger_id, 'tax_reserve', 'reserve', 'Tax Reserve', NULL)
    ON CONFLICT (ledger_id, account_type) WHERE entity_id IS NULL DO NOTHING;
  END IF;
END;
$function$;

-- 2. Backfill soledgic_fee account on existing marketplace ledgers
INSERT INTO public.accounts (ledger_id, account_type, entity_type, name)
SELECT l.id, 'soledgic_fee', 'platform', 'Soledgic Platform Fee'
FROM public.ledgers l
WHERE l.ledger_mode = 'marketplace'
  AND NOT EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.ledger_id = l.id AND a.account_type = 'soledgic_fee'
  );

-- 3. Update calculate_sale_split to return soledgic_fee_cents
-- Must DROP first because return type changes (adding soledgic_fee_cents column).
DROP FUNCTION IF EXISTS public.calculate_sale_split(bigint, numeric, bigint);
-- Soledgic takes 3.5% of gross. This comes out of the platform's share.
CREATE OR REPLACE FUNCTION public.calculate_sale_split(
  p_gross_cents bigint,
  p_creator_percent numeric,
  p_processing_fee_cents bigint DEFAULT 0
)
RETURNS TABLE(creator_cents bigint, platform_cents bigint, fee_cents bigint, soledgic_fee_cents bigint)
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
DECLARE
  v_net_cents BIGINT;
  v_creator_cents BIGINT;
  v_platform_gross BIGINT;
  v_soledgic_fee BIGINT;
  v_platform_net BIGINT;
BEGIN
  IF p_creator_percent < 0 OR p_creator_percent > 100 THEN
    RAISE EXCEPTION 'creator_percent must be 0-100, got %', p_creator_percent;
  END IF;

  IF p_processing_fee_cents < 0 THEN
    RAISE EXCEPTION 'processing_fee cannot be negative';
  END IF;

  IF p_processing_fee_cents > p_gross_cents THEN
    RAISE EXCEPTION 'processing_fee (%) cannot exceed gross (%)', p_processing_fee_cents, p_gross_cents;
  END IF;

  -- Soledgic fee: 3.5% of gross (floor to avoid overshoot)
  v_soledgic_fee := FLOOR(p_gross_cents * 0.035);

  -- Net after processing fee
  v_net_cents := p_gross_cents - p_processing_fee_cents;

  -- Creator gets their split of net
  v_creator_cents := FLOOR(v_net_cents * p_creator_percent / 100);

  -- Platform gets remainder of net, minus Soledgic fee
  v_platform_gross := v_net_cents - v_creator_cents;
  v_platform_net := v_platform_gross - v_soledgic_fee;

  -- Safety: if Soledgic fee exceeds platform share, cap it
  IF v_platform_net < 0 THEN
    v_soledgic_fee := v_platform_gross;
    v_platform_net := 0;
  END IF;

  RETURN QUERY SELECT v_creator_cents, v_platform_net, p_processing_fee_cents, v_soledgic_fee;
END;
$function$;

-- 4. Update record_sale_atomic to accept and book Soledgic fee
-- New parameter p_soledgic_fee added (default 0 for backward compat).
-- Since we're adding a parameter with a default, CREATE OR REPLACE works.
CREATE OR REPLACE FUNCTION public.record_sale_atomic(
  p_ledger_id uuid,
  p_reference_id text,
  p_creator_id text,
  p_gross_amount bigint,
  p_creator_amount bigint,
  p_platform_amount bigint,
  p_processing_fee bigint DEFAULT 0,
  p_soledgic_fee bigint DEFAULT 0,
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
  v_soledgic_fee_account_id UUID;
  v_creator_balance NUMERIC(14,2);
  v_total_distributed BIGINT;
  v_entry_method TEXT;
  v_existing_amount NUMERIC(14,2);
BEGIN
  IF p_gross_amount <= 0 THEN
    RAISE EXCEPTION 'Gross amount must be positive: %', p_gross_amount;
  END IF;

  IF p_creator_amount < 0 OR p_platform_amount < 0 OR p_processing_fee < 0 OR p_soledgic_fee < 0 THEN
    RAISE EXCEPTION 'Amounts cannot be negative';
  END IF;

  v_total_distributed := p_creator_amount + p_platform_amount + p_processing_fee + p_soledgic_fee;
  IF v_total_distributed != p_gross_amount THEN
    RAISE EXCEPTION 'Double-entry sum mismatch: creator(%) + platform(%) + fee(%) + soledgic(%) = % != gross(%)',
      p_creator_amount, p_platform_amount, p_processing_fee, p_soledgic_fee, v_total_distributed, p_gross_amount;
  END IF;

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

  -- Processing fees account (on-demand)
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

  -- Soledgic fee account (on-demand)
  IF p_soledgic_fee > 0 THEN
    SELECT id INTO v_soledgic_fee_account_id
    FROM public.accounts
    WHERE ledger_id = p_ledger_id AND account_type = 'soledgic_fee'
    LIMIT 1;

    IF v_soledgic_fee_account_id IS NULL THEN
      INSERT INTO public.accounts (
        ledger_id, account_type, entity_type, name
      ) VALUES (
        p_ledger_id, 'soledgic_fee', 'platform', 'Soledgic Platform Fee'
      )
      RETURNING id INTO v_soledgic_fee_account_id;
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
        'fee', p_processing_fee,
        'soledgic_fee', p_soledgic_fee
      )
    ) || p_metadata
  )
  RETURNING id INTO v_tx_id;

  -- Double-entry bookkeeping:
  -- DR cash (full gross)
  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_cash_account_id, 'debit', p_gross_amount / 100.0);

  -- CR creator_balance (creator's share)
  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_creator_account_id, 'credit', p_creator_amount / 100.0);

  -- CR platform_revenue (platform's share after Soledgic fee)
  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_platform_account_id, 'credit', p_platform_amount / 100.0);

  -- CR processing_fees (if any)
  IF p_processing_fee > 0 AND v_fee_account_id IS NOT NULL THEN
    INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
    VALUES (v_tx_id, v_fee_account_id, 'credit', p_processing_fee / 100.0);
  END IF;

  -- CR soledgic_fee (3.5% platform fee)
  IF p_soledgic_fee > 0 AND v_soledgic_fee_account_id IS NOT NULL THEN
    INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
    VALUES (v_tx_id, v_soledgic_fee_account_id, 'credit', p_soledgic_fee / 100.0);
  END IF;

  -- Validate double-entry balance
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
    SELECT t.id, t.amount
      INTO v_tx_id, v_existing_amount
      FROM public.transactions t
     WHERE t.ledger_id = p_ledger_id
       AND t.reference_id = p_reference_id;

    IF v_tx_id IS NULL THEN
      RAISE;
    END IF;

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

-- Grants already locked down in migration 20260381
