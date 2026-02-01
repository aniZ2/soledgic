-- Atomic refund processing function
-- Eliminates TOCTOU race condition by locking the original transaction row
-- and performing the over-refund check + insert in a single transaction.

CREATE OR REPLACE FUNCTION process_stripe_refund(
  p_ledger_id       UUID,
  p_original_tx_id  UUID,
  p_charge_id       TEXT,
  p_reference_id    TEXT,
  p_description     TEXT,
  p_amount          NUMERIC(14,2),
  p_currency        TEXT,
  p_metadata        JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_original_amount  NUMERIC(14,2);
  v_already_refunded NUMERIC(14,2);
  v_new_tx_id        UUID;
BEGIN
  -- 1. Lock the original transaction row to serialize concurrent refunds
  --    for the same charge. Any other refund handler hitting this row will
  --    block here until this transaction commits or rolls back.
  SELECT amount INTO v_original_amount
    FROM transactions
   WHERE id = p_original_tx_id
     AND ledger_id = p_ledger_id
     FOR UPDATE;

  IF v_original_amount IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'original_not_found'
    );
  END IF;

  -- 2. Sum all existing refund transactions for this charge.
  --    This read is now consistent because the row lock serializes writers.
  SELECT COALESCE(SUM(amount), 0) INTO v_already_refunded
    FROM transactions
   WHERE ledger_id = p_ledger_id
     AND transaction_type = 'refund'
     AND metadata->>'stripe_charge_id' = p_charge_id;

  -- 3. Over-refund guard (0.5% tolerance for currency rounding)
  IF v_already_refunded + p_amount > v_original_amount * 1.005 THEN
    RETURN jsonb_build_object(
      'status', 'blocked',
      'already_refunded', v_already_refunded,
      'original_amount', v_original_amount
    );
  END IF;

  -- 4. Insert the refund transaction (unique constraint on reference_id
  --    is the final safety net for truly concurrent identical inserts).
  BEGIN
    INSERT INTO transactions (
      ledger_id, transaction_type, reference_id, reference_type,
      description, amount, currency, status, reverses, metadata
    ) VALUES (
      p_ledger_id, 'refund', p_reference_id, 'stripe_refund',
      p_description, p_amount, p_currency, 'completed',
      p_original_tx_id, p_metadata
    )
    RETURNING id INTO v_new_tx_id;
  EXCEPTION
    WHEN unique_violation THEN
      -- Another handler beat us — find the existing transaction
      SELECT id INTO v_new_tx_id
        FROM transactions
       WHERE ledger_id = p_ledger_id
         AND reference_id = p_reference_id;

      RETURN jsonb_build_object(
        'status', 'duplicate',
        'transaction_id', v_new_tx_id
      );
  END;

  -- 5. If this refund brings the total to >= original, mark as fully reversed.
  IF v_already_refunded + p_amount >= v_original_amount THEN
    UPDATE transactions
       SET reversed_by = v_new_tx_id
     WHERE id = p_original_tx_id
       AND reversed_by IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'status', 'created',
    'transaction_id', v_new_tx_id,
    'already_refunded', v_already_refunded,
    'is_full_refund', (v_already_refunded + p_amount >= v_original_amount)
  );
END;
$$;

COMMENT ON FUNCTION process_stripe_refund IS
  'Atomically processes a Stripe refund: locks the original transaction row, '
  'checks cumulative refund total, inserts the refund transaction, and marks '
  'full reversals. Eliminates TOCTOU race conditions between concurrent webhooks.';
