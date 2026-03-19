-- Fix record_sale_atomic: DR buyer_wallet instead of DR cash.
-- Sales are internal redistribution, not new money entering.
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
  v_buyer_wallet_id UUID;
  v_fee_account_id UUID;
  v_soledgic_fee_account_id UUID;
  v_creator_balance NUMERIC(14,2);
  v_total_distributed BIGINT;
  v_entry_method TEXT;
  v_existing_amount NUMERIC(14,2);
  v_buyer_id TEXT;
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

  -- Extract buyer_id from metadata (linked during checkout)
  v_buyer_id := p_metadata->>'buyer_id';

  SELECT id INTO v_platform_account_id
  FROM public.accounts
  WHERE ledger_id = p_ledger_id AND account_type = 'platform_revenue'
  LIMIT 1;

  IF v_platform_account_id IS NULL THEN
    RAISE EXCEPTION 'Platform revenue account not initialized for ledger %', p_ledger_id;
  END IF;

  -- Find buyer wallet to debit. If buyer_id provided, use their wallet.
  -- Otherwise fall back to cash account (backward compat for non-checkout sales).
  IF v_buyer_id IS NOT NULL THEN
    SELECT id INTO v_buyer_wallet_id
    FROM public.accounts
    WHERE ledger_id = p_ledger_id
      AND account_type = 'buyer_wallet'
      AND entity_id = v_buyer_id
    FOR UPDATE;
  END IF;

  -- Fallback: use cash account if no buyer wallet (e.g. manual sales, API-recorded)
  IF v_buyer_wallet_id IS NULL THEN
    SELECT id INTO v_buyer_wallet_id
    FROM public.accounts
    WHERE ledger_id = p_ledger_id AND account_type = 'cash'
    LIMIT 1;
  END IF;

  IF v_buyer_wallet_id IS NULL THEN
    RAISE EXCEPTION 'No debit account (buyer_wallet or cash) found for ledger %', p_ledger_id;
  END IF;

  -- Creator account
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
      'buyer_id', v_buyer_id,
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

  -- DR buyer_wallet (money leaves buyer's wallet — internal redistribution)
  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_buyer_wallet_id, 'debit', p_gross_amount / 100.0);

  -- CR creator_balance
  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_creator_account_id, 'credit', p_creator_amount / 100.0);

  -- CR platform_revenue
  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_platform_account_id, 'credit', p_platform_amount / 100.0);

  -- CR processing_fees (if any)
  IF p_processing_fee > 0 AND v_fee_account_id IS NOT NULL THEN
    INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
    VALUES (v_tx_id, v_fee_account_id, 'credit', p_processing_fee / 100.0);
  END IF;

  -- CR soledgic_fee
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

    IF v_tx_id IS NULL THEN RAISE; END IF;

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
