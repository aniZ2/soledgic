CREATE OR REPLACE FUNCTION public.record_transaction_atomic(
  p_ledger_id uuid,
  p_transaction_type text,
  p_reference_id text,
  p_reference_type text,
  p_description text,
  p_amount numeric,
  p_currency text DEFAULT 'USD',
  p_status text DEFAULT 'completed',
  p_entry_method text DEFAULT 'manual',
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_entries jsonb DEFAULT '[]'::jsonb,
  p_authorizing_instrument_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_txn_id uuid;
  v_entry record;
  v_account_id uuid;
  v_total_debits numeric := 0;
  v_total_credits numeric := 0;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  SELECT id INTO v_existing_id
  FROM transactions
  WHERE ledger_id = p_ledger_id AND reference_id = p_reference_id;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'duplicate_reference_id',
      'transaction_id', v_existing_id
    );
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
    v_account_id := (v_entry.value->>'account_id')::uuid;
    PERFORM id FROM accounts WHERE id = v_account_id FOR UPDATE;
  END LOOP;

  INSERT INTO transactions (
    ledger_id, transaction_type, reference_id, reference_type,
    description, amount, currency, status, entry_method, metadata,
    authorizing_instrument_id
  ) VALUES (
    p_ledger_id, p_transaction_type, p_reference_id, p_reference_type,
    p_description, p_amount, p_currency, p_status, p_entry_method, p_metadata,
    p_authorizing_instrument_id
  )
  RETURNING id INTO v_txn_id;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
    INSERT INTO entries (transaction_id, account_id, entry_type, amount)
    VALUES (
      v_txn_id,
      (v_entry.value->>'account_id')::uuid,
      v_entry.value->>'entry_type',
      (v_entry.value->>'amount')::numeric
    );
    IF v_entry.value->>'entry_type' = 'debit' THEN
      v_total_debits := v_total_debits + (v_entry.value->>'amount')::numeric;
    ELSE
      v_total_credits := v_total_credits + (v_entry.value->>'amount')::numeric;
    END IF;
  END LOOP;

  IF v_total_debits != v_total_credits THEN
    RAISE EXCEPTION 'Double-entry violation: debits (%) != credits (%)',
      v_total_debits, v_total_credits;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'transaction_id', v_txn_id,
    'amount', p_amount, 'entry_count', jsonb_array_length(p_entries)
  );
END;
$$;
