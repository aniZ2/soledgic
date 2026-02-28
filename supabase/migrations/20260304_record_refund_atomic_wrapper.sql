-- Legacy record_refund_atomic signature wrapper
CREATE OR REPLACE FUNCTION public.record_refund_atomic(
  p_ledger_id UUID,
  p_reference_id TEXT,
  p_original_tx_id UUID,
  p_refund_amount BIGINT,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_result RECORD;
BEGIN
  SELECT *
    INTO v_result
    FROM public.record_refund_atomic_v2(
      p_ledger_id => p_ledger_id,
      p_reference_id => p_reference_id,
      p_original_tx_id => p_original_tx_id,
      p_refund_amount => p_refund_amount,
      p_reason => p_reason,
      p_refund_from => 'both',
      p_external_refund_id => NULL,
      p_metadata => '{}'::JSONB
    )
   LIMIT 1;

  IF v_result.out_transaction_id IS NULL THEN
    RAISE EXCEPTION 'Failed to create refund transaction for reference %', p_reference_id;
  END IF;

  RETURN v_result.out_transaction_id;
END;
$$;
