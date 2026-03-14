CREATE OR REPLACE FUNCTION public.get_net_refunded_cents(p_ledger_id uuid, p_original_tx_id uuid)
 RETURNS bigint
 LANGUAGE sql
 VOLATILE
 SET search_path TO ''
AS $function$
  WITH refund_rows AS (
    SELECT
      t.id,
      ROUND(t.amount * 100)::BIGINT AS refund_cents
    FROM public.transactions t
    WHERE t.ledger_id = p_ledger_id
      AND t.transaction_type = 'refund'
      AND t.reverses = p_original_tx_id
      AND t.status NOT IN ('voided', 'draft')
  ),
  reversal_rows AS (
    SELECT
      t.reverses AS refund_id,
      COALESCE(SUM(ROUND(t.amount * 100)::BIGINT), 0)::BIGINT AS reversed_cents
    FROM public.transactions t
    JOIN refund_rows r ON r.id = t.reverses
    WHERE t.ledger_id = p_ledger_id
      AND t.transaction_type = 'reversal'
      AND t.status NOT IN ('voided', 'reversed', 'draft')
    GROUP BY t.reverses
  )
  SELECT COALESCE(
    SUM(GREATEST(r.refund_cents - COALESCE(rv.reversed_cents, 0), 0)),
    0
  )::BIGINT
  FROM refund_rows r
  LEFT JOIN reversal_rows rv ON rv.refund_id = r.id;
$function$
;

CREATE OR REPLACE FUNCTION public.record_refund_atomic_v2(p_ledger_id uuid, p_reference_id text, p_original_tx_id uuid, p_refund_amount bigint DEFAULT NULL::bigint, p_reason text DEFAULT NULL::text, p_refund_from text DEFAULT 'both'::text, p_external_refund_id text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_entry_method text DEFAULT 'processor'::text)
 RETURNS TABLE(out_transaction_id uuid, out_refunded_cents bigint, out_from_creator_cents bigint, out_from_platform_cents bigint, out_is_full_refund boolean, out_status text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_original_tx             public.transactions%ROWTYPE;
  v_original_total_cents    BIGINT;
  v_already_refunded_cents  BIGINT;
  v_available_cents         BIGINT;
  v_refund_cents            BIGINT;
  v_refund_from             TEXT;
  v_creator_basis_cents     BIGINT := 0;
  v_platform_basis_cents    BIGINT := 0;
  v_from_creator_cents      BIGINT := 0;
  v_from_platform_cents     BIGINT := 0;
  v_creator_meta_text       TEXT;
  v_platform_meta_text      TEXT;
  v_cash_account_id         UUID;
  v_creator_account_id      UUID;
  v_platform_account_id     UUID;
  v_tx_id                   UUID;
  v_existing_tx_id          UUID;
  v_effective_metadata      JSONB;
  v_is_full_refund          BOOLEAN := FALSE;
  v_entry_method            TEXT;
  v_reversed_by_type        TEXT;
BEGIN
  IF p_reference_id IS NULL OR LENGTH(TRIM(p_reference_id)) = 0 THEN
    RAISE EXCEPTION 'reference_id is required';
  END IF;

  v_entry_method := COALESCE(NULLIF(TRIM(p_entry_method), ''), 'processor');
  IF v_entry_method NOT IN ('processor', 'manual', 'system', 'import') THEN
    v_entry_method := 'processor';
  END IF;

  SELECT t.*
    INTO v_original_tx
    FROM public.transactions t
   WHERE t.id = p_original_tx_id
     AND t.ledger_id = p_ledger_id
     AND t.transaction_type = 'sale'
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Original sale not found: %', p_original_tx_id;
  END IF;

  IF v_original_tx.status = 'reversed' THEN
    SELECT t.transaction_type
      INTO v_reversed_by_type
      FROM public.transactions t
     WHERE t.id = v_original_tx.reversed_by
     LIMIT 1;

    IF COALESCE(v_reversed_by_type, '') <> 'refund' THEN
      RAISE EXCEPTION 'Sale already reversed: %', p_original_tx_id;
    END IF;
  END IF;

  v_original_total_cents := ROUND(v_original_tx.amount * 100)::BIGINT;

  SELECT public.get_net_refunded_cents(p_ledger_id, p_original_tx_id)
    INTO v_already_refunded_cents;

  v_available_cents := GREATEST(v_original_total_cents - v_already_refunded_cents, 0);

  IF v_original_tx.status = 'reversed'
     AND COALESCE(v_reversed_by_type, '') = 'refund'
     AND v_available_cents > 0 THEN
    UPDATE public.transactions
       SET reversed_by = NULL,
           status = 'completed'
     WHERE id = p_original_tx_id;

    v_original_tx.status := 'completed';
    v_original_tx.reversed_by := NULL;
  END IF;

  IF v_available_cents <= 0 THEN
    RAISE EXCEPTION 'No refundable amount remaining for sale %', p_original_tx_id;
  END IF;

  IF p_refund_amount IS NULL THEN
    v_refund_cents := v_available_cents;
  ELSE
    IF p_refund_amount <= 0 THEN
      RAISE EXCEPTION 'Refund amount must be positive';
    END IF;
    v_refund_cents := p_refund_amount;
  END IF;

  IF v_refund_cents > v_available_cents THEN
    RAISE EXCEPTION 'Refund amount % exceeds remaining refundable amount %', v_refund_cents, v_available_cents;
  END IF;

  v_refund_from := LOWER(COALESCE(NULLIF(TRIM(p_refund_from), ''), 'both'));
  IF v_refund_from NOT IN ('both', 'platform_only', 'creator_only') THEN
    RAISE EXCEPTION 'Invalid refund_from value: %', v_refund_from;
  END IF;

  SELECT COALESCE(SUM(ROUND(e.amount * 100)::BIGINT), 0)
    INTO v_creator_basis_cents
    FROM public.entries e
    JOIN public.accounts a ON a.id = e.account_id
   WHERE e.transaction_id = p_original_tx_id
     AND e.entry_type = 'credit'
     AND a.account_type = 'creator_balance';

  SELECT COALESCE(SUM(ROUND(e.amount * 100)::BIGINT), 0)
    INTO v_platform_basis_cents
    FROM public.entries e
    JOIN public.accounts a ON a.id = e.account_id
   WHERE e.transaction_id = p_original_tx_id
     AND e.entry_type = 'credit'
     AND a.account_type = 'platform_revenue';

  v_creator_meta_text := v_original_tx.metadata->'amounts_cents'->>'creator';
  IF v_creator_basis_cents <= 0 AND v_creator_meta_text ~ '^[0-9]+$' THEN
    v_creator_basis_cents := v_creator_meta_text::BIGINT;
  END IF;

  v_platform_meta_text := v_original_tx.metadata->'amounts_cents'->>'platform';
  IF v_platform_basis_cents <= 0 AND v_platform_meta_text ~ '^[0-9]+$' THEN
    v_platform_basis_cents := v_platform_meta_text::BIGINT;
  END IF;

  IF v_refund_from = 'creator_only' THEN
    v_from_creator_cents := v_refund_cents;
    v_from_platform_cents := 0;
  ELSIF v_refund_from = 'platform_only' THEN
    v_from_creator_cents := 0;
    v_from_platform_cents := v_refund_cents;
  ELSE
    IF v_creator_basis_cents < 0 OR v_platform_basis_cents < 0 THEN
      RAISE EXCEPTION 'Invalid original split basis for sale %', p_original_tx_id;
    END IF;
    IF (v_creator_basis_cents + v_platform_basis_cents) <= 0 THEN
      RAISE EXCEPTION 'Unable to compute refund split basis for sale %', p_original_tx_id;
    END IF;

    v_from_creator_cents :=
      (v_refund_cents * v_creator_basis_cents) / (v_creator_basis_cents + v_platform_basis_cents);
    v_from_platform_cents := v_refund_cents - v_from_creator_cents;
  END IF;

  SELECT e.account_id
    INTO v_cash_account_id
    FROM public.entries e
    JOIN public.accounts a ON a.id = e.account_id
   WHERE e.transaction_id = p_original_tx_id
     AND e.entry_type = 'debit'
     AND a.account_type = 'cash'
   LIMIT 1;

  IF v_cash_account_id IS NULL THEN
    SELECT a.id
      INTO v_cash_account_id
      FROM public.accounts a
     WHERE a.ledger_id = p_ledger_id
       AND a.account_type = 'cash'
     LIMIT 1;
  END IF;

  IF v_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'Cash account not found for ledger %', p_ledger_id;
  END IF;

  IF v_from_creator_cents > 0 THEN
    SELECT e.account_id
      INTO v_creator_account_id
      FROM public.entries e
      JOIN public.accounts a ON a.id = e.account_id
     WHERE e.transaction_id = p_original_tx_id
       AND e.entry_type = 'credit'
       AND a.account_type = 'creator_balance'
     LIMIT 1;

    IF v_creator_account_id IS NULL THEN
      SELECT a.id
        INTO v_creator_account_id
        FROM public.accounts a
       WHERE a.ledger_id = p_ledger_id
         AND a.account_type = 'creator_balance'
         AND a.entity_id = COALESCE(v_original_tx.metadata->>'creator_id', '')
       LIMIT 1;
    END IF;

    IF v_creator_account_id IS NULL THEN
      RAISE EXCEPTION 'Creator account not found for sale %', p_original_tx_id;
    END IF;
  END IF;

  IF v_from_platform_cents > 0 THEN
    SELECT e.account_id
      INTO v_platform_account_id
      FROM public.entries e
      JOIN public.accounts a ON a.id = e.account_id
     WHERE e.transaction_id = p_original_tx_id
       AND e.entry_type = 'credit'
       AND a.account_type = 'platform_revenue'
     LIMIT 1;

    IF v_platform_account_id IS NULL THEN
      SELECT a.id
        INTO v_platform_account_id
        FROM public.accounts a
       WHERE a.ledger_id = p_ledger_id
         AND a.account_type = 'platform_revenue'
       LIMIT 1;
    END IF;

    IF v_platform_account_id IS NULL THEN
      RAISE EXCEPTION 'Platform revenue account not found for ledger %', p_ledger_id;
    END IF;
  END IF;

  v_effective_metadata :=
    COALESCE(p_metadata, '{}'::JSONB) ||
    jsonb_build_object(
      'original_sale_reference', v_original_tx.reference_id,
      'original_transaction_id', v_original_tx.id,
      'reason', p_reason,
      'refund_from', v_refund_from,
      'external_refund_id', p_external_refund_id,
      'breakdown', jsonb_build_object(
        'from_creator', v_from_creator_cents / 100.0,
        'from_platform', v_from_platform_cents / 100.0
      ),
      'breakdown_cents', jsonb_build_object(
        'from_creator', v_from_creator_cents,
        'from_platform', v_from_platform_cents
      )
    );

  INSERT INTO public.transactions (
    ledger_id,
    transaction_type,
    reference_id,
    reference_type,
    description,
    amount,
    currency,
    status,
    reverses,
    entry_method,
    metadata
  ) VALUES (
    p_ledger_id,
    'refund',
    p_reference_id,
    'refund',
    COALESCE(NULLIF(TRIM(p_reason), ''), 'Refund for ' || v_original_tx.reference_id),
    v_refund_cents / 100.0,
    COALESCE(v_original_tx.currency, 'USD'),
    'completed',
    p_original_tx_id,
    v_entry_method,
    v_effective_metadata
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_cash_account_id, 'credit', v_refund_cents / 100.0);

  IF v_from_creator_cents > 0 THEN
    INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
    VALUES (v_tx_id, v_creator_account_id, 'debit', v_from_creator_cents / 100.0);
  END IF;

  IF v_from_platform_cents > 0 THEN
    INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
    VALUES (v_tx_id, v_platform_account_id, 'debit', v_from_platform_cents / 100.0);
  END IF;

  PERFORM 1
    FROM (
      SELECT
        COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0) AS debits,
        COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0) AS credits
      FROM public.entries e
      WHERE e.transaction_id = v_tx_id
    ) totals
   WHERE totals.debits <> totals.credits;

  IF FOUND THEN
    RAISE EXCEPTION 'CRITICAL: Double-entry validation failed for transaction %', v_tx_id;
  END IF;

  IF v_refund_cents = v_available_cents THEN
    UPDATE public.transactions
       SET reversed_by = v_tx_id,
           status = 'reversed'
     WHERE id = p_original_tx_id;
    v_is_full_refund := TRUE;
  END IF;

  RETURN QUERY
  SELECT
    v_tx_id,
    v_refund_cents,
    v_from_creator_cents,
    v_from_platform_cents,
    v_is_full_refund,
    'created'::TEXT;

EXCEPTION
  WHEN unique_violation THEN
    SELECT t.id
      INTO v_existing_tx_id
      FROM public.transactions t
     WHERE t.ledger_id = p_ledger_id
       AND t.reference_id = p_reference_id
     LIMIT 1;

    IF v_existing_tx_id IS NULL THEN
      RAISE;
    END IF;

    RETURN QUERY
    SELECT
      v_existing_tx_id,
      0::BIGINT,
      0::BIGINT,
      0::BIGINT,
      FALSE,
      'duplicate'::TEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.void_transaction_atomic(p_ledger_id uuid, p_transaction_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_transaction  public.transactions%ROWTYPE;
  v_void_tx_id   UUID;
  v_entry        RECORD;
BEGIN
  SELECT t.*
    INTO v_transaction
    FROM public.transactions t
   WHERE t.id = p_transaction_id
     AND t.ledger_id = p_ledger_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found: %', p_transaction_id;
  END IF;

  IF v_transaction.status IN ('voided', 'reversed') THEN
    RAISE EXCEPTION 'Transaction already %: %', v_transaction.status, p_transaction_id;
  END IF;

  IF v_transaction.status = 'reconciled'
     OR (v_transaction.metadata IS NOT NULL AND (
       (v_transaction.metadata->>'reconciled')::BOOLEAN IS TRUE
       OR v_transaction.metadata->>'bank_match_id' IS NOT NULL
     ))
  THEN
    RAISE EXCEPTION 'Transaction is reconciled and cannot be voided: %', p_transaction_id;
  END IF;

  -- Create a voiding reversal transaction with flipped entries.
  -- The existing entry trigger updates accounts.balance, keeping
  -- entry-derived reports and the balance column in sync.
  INSERT INTO public.transactions (
    ledger_id,
    transaction_type,
    reference_id,
    reference_type,
    description,
    amount,
    currency,
    status,
    reverses,
    metadata
  ) VALUES (
    p_ledger_id,
    'reversal',
    'void_' || p_transaction_id,
    'void',
    'Void: ' || COALESCE(NULLIF(TRIM(p_reason), ''), 'voided'),
    v_transaction.amount,
    COALESCE(v_transaction.currency, 'USD'),
    'completed',
    p_transaction_id,
    jsonb_build_object(
      'original_transaction_id', p_transaction_id,
      'void_reason', p_reason,
      'void_type', 'soft_delete',
      'voided_at', NOW()
    )
  )
  RETURNING id INTO v_void_tx_id;

  -- Insert flipped entries (debit↔credit) — the entry trigger handles balance updates
  FOR v_entry IN
    SELECT e.account_id, e.entry_type, e.amount
      FROM public.entries e
     WHERE e.transaction_id = p_transaction_id
  LOOP
    INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
    VALUES (
      v_void_tx_id,
      v_entry.account_id,
      CASE WHEN v_entry.entry_type = 'debit' THEN 'credit' ELSE 'debit' END,
      v_entry.amount
    );
  END LOOP;

  -- Mark the original as voided
  UPDATE public.transactions
     SET status = 'voided',
         reversed_by = v_void_tx_id,
         metadata = COALESCE(v_transaction.metadata, '{}'::JSONB) ||
           jsonb_build_object(
             'voided_at', NOW(),
             'void_reason', p_reason,
             'void_type', 'soft_delete'
           )
   WHERE id = p_transaction_id;

  RETURN v_void_tx_id;
END;
$function$
;

REVOKE ALL ON FUNCTION public.get_net_refunded_cents(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_net_refunded_cents(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.void_transaction_atomic(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_transaction_atomic(uuid, uuid, text) TO service_role;
