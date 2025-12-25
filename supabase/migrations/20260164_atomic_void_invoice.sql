-- Migration: Atomic Invoice Void with Row Locking
-- Prevents double-void race conditions

CREATE OR REPLACE FUNCTION void_invoice_atomic(
  p_invoice_id UUID,
  p_ledger_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  reversal_transaction_id UUID,
  reversed_amount NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_ar_account_id UUID;
  v_revenue_account_id UUID;
  v_reversal_tx_id UUID;
  v_amount_to_reverse NUMERIC;
BEGIN
  SELECT * INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id AND ledger_id = p_ledger_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Invoice not found'::TEXT, NULL::UUID, NULL::NUMERIC;
    RETURN;
  END IF;
  
  IF v_invoice.status = 'void' THEN
    RETURN QUERY SELECT false, 'Invoice is already void'::TEXT, NULL::UUID, NULL::NUMERIC;
    RETURN;
  END IF;
  
  IF v_invoice.status = 'paid' THEN
    RETURN QUERY SELECT false, 'Cannot void a fully paid invoice. Issue a credit memo instead.'::TEXT, NULL::UUID, NULL::NUMERIC;
    RETURN;
  END IF;
  
  IF v_invoice.status = 'draft' OR v_invoice.transaction_id IS NULL THEN
    UPDATE invoices
    SET status = 'void',
        voided_at = NOW(),
        void_reason = p_reason
    WHERE id = p_invoice_id;
    
    RETURN QUERY SELECT true, 'Draft invoice voided (no AR to reverse)'::TEXT, NULL::UUID, 0::NUMERIC;
    RETURN;
  END IF;
  
  v_ar_account_id := get_or_create_ledger_account(p_ledger_id, 'accounts_receivable', 'Accounts Receivable');
  v_revenue_account_id := get_or_create_ledger_account(p_ledger_id, 'revenue', 'Revenue');
  
  IF v_ar_account_id IS NULL OR v_revenue_account_id IS NULL THEN
    RETURN QUERY SELECT false, 'Required accounts not found'::TEXT, NULL::UUID, NULL::NUMERIC;
    RETURN;
  END IF;
  
  v_amount_to_reverse := v_invoice.amount_due / 100.0;
  
  INSERT INTO transactions (
    ledger_id, transaction_type, reference_id, reference_type,
    description, amount, currency, status, reverses, metadata
  ) VALUES (
    p_ledger_id, 'invoice_void', 'VOID-' || v_invoice.invoice_number, 'void',
    'Void: Invoice ' || v_invoice.invoice_number, v_amount_to_reverse,
    v_invoice.currency, 'completed', v_invoice.transaction_id,
    jsonb_build_object(
      'original_invoice_id', v_invoice.id,
      'original_transaction_id', v_invoice.transaction_id,
      'reason', COALESCE(p_reason, 'Voided by user'),
      'original_amount', v_invoice.total_amount / 100.0,
      'amount_paid', v_invoice.amount_paid / 100.0,
      'amount_reversed', v_amount_to_reverse
    )
  )
  RETURNING id INTO v_reversal_tx_id;
  
  INSERT INTO entries (transaction_id, account_id, entry_type, amount)
  VALUES 
    (v_reversal_tx_id, v_ar_account_id, 'credit', v_amount_to_reverse),
    (v_reversal_tx_id, v_revenue_account_id, 'debit', v_amount_to_reverse);
  
  UPDATE invoices
  SET status = 'void',
      voided_at = NOW(),
      void_reason = p_reason
  WHERE id = p_invoice_id;
  
  UPDATE transactions
  SET reversed_by = v_reversal_tx_id
  WHERE id = v_invoice.transaction_id;
  
  RETURN QUERY SELECT true, 'Invoice voided and AR reversed'::TEXT, v_reversal_tx_id, v_amount_to_reverse;
END;
$$;
