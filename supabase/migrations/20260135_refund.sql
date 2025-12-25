-- Soledgic: Refund Function
-- Part 5 of 6

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
  v_tx_id UUID;
  v_original_tx RECORD;
  v_creator_account_id UUID;
  v_platform_account_id UUID;
  v_cash_account_id UUID;
  v_creator_refund BIGINT;
  v_platform_refund BIGINT;
BEGIN
  SELECT * INTO v_original_tx
  FROM public.transactions
  WHERE id = p_original_tx_id AND ledger_id = p_ledger_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Original transaction not found: %', p_original_tx_id;
  END IF;
  
  IF v_original_tx.status = 'reversed' THEN
    RAISE EXCEPTION 'Transaction already reversed: %', p_original_tx_id;
  END IF;
  
  v_creator_refund := FLOOR(p_refund_amount * 
    (v_original_tx.metadata->'amounts_cents'->>'creator')::BIGINT / 
    (v_original_tx.metadata->'amounts_cents'->>'gross')::BIGINT);
  v_platform_refund := p_refund_amount - v_creator_refund;
  
  SELECT id INTO v_creator_account_id FROM public.accounts
  WHERE ledger_id = p_ledger_id AND account_type = 'creator_balance'
    AND entity_id = v_original_tx.metadata->>'creator_id';
    
  SELECT id INTO v_platform_account_id FROM public.accounts
  WHERE ledger_id = p_ledger_id AND account_type = 'platform_revenue';
  
  SELECT id INTO v_cash_account_id FROM public.accounts
  WHERE ledger_id = p_ledger_id AND account_type = 'cash';
  
  INSERT INTO public.transactions (
    ledger_id, transaction_type, reference_id, reference_type,
    description, amount, status, reverses, metadata
  ) VALUES (
    p_ledger_id, 'refund', p_reference_id, 'external',
    COALESCE(p_reason, 'Refund for ' || p_original_tx_id),
    p_refund_amount / 100.0, 'completed', p_original_tx_id,
    jsonb_build_object('original_tx', p_original_tx_id, 'reason', p_reason)
  )
  RETURNING id INTO v_tx_id;
  
  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_cash_account_id, 'credit', p_refund_amount / 100.0);
  
  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_creator_account_id, 'debit', v_creator_refund / 100.0);
  
  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_platform_account_id, 'debit', v_platform_refund / 100.0);
  
  UPDATE public.transactions
  SET reversed_by = v_tx_id, status = 'reversed'
  WHERE id = p_original_tx_id;
  
  RETURN v_tx_id;
END;
$$;
