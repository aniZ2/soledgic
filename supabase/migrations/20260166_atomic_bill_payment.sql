-- Migration: Atomic Bill Payment
-- Records bill payment with proper double-entry bookkeeping

CREATE OR REPLACE FUNCTION record_bill_payment_atomic(
  p_ledger_id UUID,
  p_amount_cents BIGINT,
  p_bill_transaction_id UUID DEFAULT NULL,
  p_vendor_name TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL
)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  transaction_id UUID,
  amount_dollars NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cash_account_id UUID;
  v_ap_account_id UUID;
  v_transaction_id UUID;
  v_amount_dollars NUMERIC;
  v_description TEXT;
  v_original_bill RECORD;
BEGIN
  IF p_amount_cents <= 0 THEN
    RETURN QUERY SELECT false, 'Payment amount must be positive'::TEXT, NULL::UUID, NULL::NUMERIC;
    RETURN;
  END IF;
  
  v_cash_account_id := get_or_create_ledger_account(p_ledger_id, 'cash', 'Cash / Bank');
  v_ap_account_id := get_or_create_ledger_account(p_ledger_id, 'accounts_payable', 'Accounts Payable');
  
  IF v_cash_account_id IS NULL OR v_ap_account_id IS NULL THEN
    RETURN QUERY SELECT false, 'Failed to create required accounts'::TEXT, NULL::UUID, NULL::NUMERIC;
    RETURN;
  END IF;
  
  v_amount_dollars := p_amount_cents / 100.0;
  
  v_description := 'Bill payment';
  IF p_bill_transaction_id IS NOT NULL THEN
    SELECT description, merchant_name INTO v_original_bill
    FROM transactions
    WHERE id = p_bill_transaction_id AND ledger_id = p_ledger_id;
    
    IF FOUND AND v_original_bill.description IS NOT NULL THEN
      v_description := 'Payment: ' || v_original_bill.description;
    END IF;
  ELSIF p_vendor_name IS NOT NULL THEN
    v_description := 'Payment to ' || p_vendor_name;
  END IF;
  
  INSERT INTO transactions (
    ledger_id, transaction_type, reference_id, reference_type,
    description, amount, currency, status, merchant_name, metadata
  ) VALUES (
    p_ledger_id, 'bill_payment', p_reference_id, COALESCE(p_payment_method, 'payment'),
    v_description, v_amount_dollars, 'USD', 'completed', p_vendor_name,
    jsonb_build_object(
      'original_bill_id', p_bill_transaction_id,
      'payment_method', p_payment_method
    )
  )
  RETURNING id INTO v_transaction_id;
  
  INSERT INTO entries (transaction_id, account_id, entry_type, amount)
  VALUES 
    (v_transaction_id, v_ap_account_id, 'debit', v_amount_dollars),
    (v_transaction_id, v_cash_account_id, 'credit', v_amount_dollars);
  
  RETURN QUERY SELECT true, ('Bill payment of $' || v_amount_dollars || ' recorded')::TEXT, 
    v_transaction_id, v_amount_dollars;
END;
$$;
