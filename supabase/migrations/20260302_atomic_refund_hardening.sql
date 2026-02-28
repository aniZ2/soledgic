-- Secure process_processor_refund (invoker rights + locked search_path)
CREATE OR REPLACE FUNCTION public.process_processor_refund(
  p_ledger_id UUID,
  p_original_tx_id UUID,
  p_charge_id TEXT,
  p_reference_id TEXT,
  p_description TEXT,
  p_amount NUMERIC(14,2),
  p_currency TEXT,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_original_amount  NUMERIC(14,2);
  v_already_refunded NUMERIC(14,2);
  v_new_tx_id        UUID;
  v_effective_meta   JSONB;
BEGIN
  SELECT t.amount
    INTO v_original_amount
    FROM public.transactions t
   WHERE t.id = p_original_tx_id
     AND t.ledger_id = p_ledger_id
   FOR UPDATE;

  IF v_original_amount IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'original_not_found'
    );
  END IF;

  SELECT COALESCE(SUM(t.amount), 0)
    INTO v_already_refunded
    FROM public.transactions t
   WHERE t.ledger_id = p_ledger_id
     AND t.transaction_type = 'refund'
     AND t.metadata->>'processor_charge_id' = p_charge_id;

  IF v_already_refunded + p_amount > v_original_amount * 1.005 THEN
    RETURN jsonb_build_object(
      'status', 'blocked',
      'already_refunded', v_already_refunded,
      'original_amount', v_original_amount
    );
  END IF;

  v_effective_meta :=
    COALESCE(p_metadata, '{}'::JSONB) ||
    jsonb_build_object('processor_charge_id', p_charge_id);

  BEGIN
    INSERT INTO public.transactions (
      ledger_id, transaction_type, reference_id, reference_type,
      description, amount, currency, status, reverses, metadata
    ) VALUES (
      p_ledger_id, 'refund', p_reference_id, 'processor_refund',
      p_description, p_amount, p_currency, 'completed',
      p_original_tx_id, v_effective_meta
    )
    RETURNING id INTO v_new_tx_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT t.id
        INTO v_new_tx_id
        FROM public.transactions t
       WHERE t.ledger_id = p_ledger_id
         AND t.reference_id = p_reference_id
       LIMIT 1;

      RETURN jsonb_build_object(
        'status', 'duplicate',
        'transaction_id', v_new_tx_id
      );
  END;

  IF v_already_refunded + p_amount >= v_original_amount THEN
    UPDATE public.transactions
       SET reversed_by = v_new_tx_id,
           status = CASE WHEN status = 'reversed' THEN status ELSE 'reversed' END
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
