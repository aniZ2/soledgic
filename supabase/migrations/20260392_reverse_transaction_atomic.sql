CREATE OR REPLACE FUNCTION public.reverse_transaction_atomic(
  p_ledger_id uuid,
  p_original_transaction_id uuid,
  p_reference_id text,
  p_reason text DEFAULT 'manual_reversal',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original transactions%ROWTYPE;
  v_reversal_id uuid;
  v_entry record;
BEGIN
  SELECT * INTO v_original
  FROM transactions
  WHERE id = p_original_transaction_id AND ledger_id = p_ledger_id
  FOR UPDATE;

  IF v_original IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Original transaction not found');
  END IF;

  IF v_original.status = 'voided' OR v_original.status = 'reversed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction already reversed/voided');
  END IF;

  PERFORM id FROM transactions
  WHERE ledger_id = p_ledger_id AND reference_id = p_reference_id;

  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'duplicate_reference_id');
  END IF;

  INSERT INTO transactions (
    ledger_id, transaction_type, reference_id, reference_type,
    description, amount, currency, status, entry_method, reverses, metadata
  ) VALUES (
    p_ledger_id, 'reversal', p_reference_id, 'reversal',
    'Reversal of ' || v_original.reference_id || ': ' || p_reason,
    v_original.amount, v_original.currency, 'completed', 'system',
    p_original_transaction_id, p_metadata
  )
  RETURNING id INTO v_reversal_id;

  FOR v_entry IN
    SELECT account_id, entry_type, amount
    FROM entries WHERE transaction_id = p_original_transaction_id
  LOOP
    INSERT INTO entries (transaction_id, account_id, entry_type, amount)
    VALUES (
      v_reversal_id, v_entry.account_id,
      CASE WHEN v_entry.entry_type = 'debit' THEN 'credit' ELSE 'debit' END,
      v_entry.amount
    );
  END LOOP;

  UPDATE transactions SET status = 'reversed' WHERE id = p_original_transaction_id;

  RETURN jsonb_build_object(
    'success', true, 'reversal_id', v_reversal_id,
    'original_id', p_original_transaction_id, 'amount', v_original.amount
  );
END;
$$;
