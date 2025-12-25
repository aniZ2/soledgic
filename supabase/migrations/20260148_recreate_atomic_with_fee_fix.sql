-- Soledgic: Recreate record_sale_atomic with correct fee handling

CREATE OR REPLACE FUNCTION public.record_sale_atomic(
  p_ledger_id UUID,
  p_reference_id TEXT,
  p_creator_id TEXT,
  p_gross_amount BIGINT,
  p_creator_amount BIGINT,
  p_platform_amount BIGINT,
  p_processing_fee BIGINT DEFAULT 0,
  p_product_id TEXT DEFAULT NULL,
  p_product_name TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
) 
RETURNS TABLE (
  out_transaction_id UUID,
  out_creator_account_id UUID,
  out_creator_balance NUMERIC(14,2)
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tx_id UUID;
  v_creator_account_id UUID;
  v_platform_account_id UUID;
  v_cash_account_id UUID;
  v_fee_account_id UUID;
  v_creator_balance NUMERIC(14,2);
  v_total_distributed BIGINT;
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
  
  SELECT id INTO v_creator_account_id
  FROM public.accounts
  WHERE ledger_id = p_ledger_id 
    AND account_type = 'creator_balance' 
    AND entity_id = p_creator_id;
  
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
    description, amount, currency, status, metadata
  ) VALUES (
    p_ledger_id, 'sale', p_reference_id, 'external',
    COALESCE(p_product_name, 'Sale for creator ' || p_creator_id),
    p_gross_amount / 100.0, 'USD', 'completed',
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
    SELECT t.id,
           (SELECT a.id FROM public.accounts a 
            WHERE a.ledger_id = p_ledger_id 
            AND a.account_type = 'creator_balance' 
            AND a.entity_id = p_creator_id),
           (SELECT a.balance FROM public.accounts a 
            WHERE a.ledger_id = p_ledger_id 
            AND a.account_type = 'creator_balance' 
            AND a.entity_id = p_creator_id)
    INTO v_tx_id, v_creator_account_id, v_creator_balance
    FROM public.transactions t
    WHERE t.ledger_id = p_ledger_id AND t.reference_id = p_reference_id;
    
    RETURN QUERY SELECT v_tx_id, v_creator_account_id, v_creator_balance;
END;
$$;
