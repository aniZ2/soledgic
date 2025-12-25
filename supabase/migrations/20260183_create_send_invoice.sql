CREATE OR REPLACE FUNCTION send_invoice_atomic(
  p_invoice_id UUID,
  p_ledger_id UUID
)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  transaction_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_ar_account_id UUID;
  v_revenue_account_id UUID;
  v_transaction_id UUID;
  v_amount_dollars NUMERIC;
BEGIN
  IF p_invoice_id IS NULL THEN
    RETURN QUERY SELECT false, 'Invoice ID is required'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  SELECT * INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id AND ledger_id = p_ledger_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Invoice not found'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  IF v_invoice.status != 'draft' THEN
    RETURN QUERY SELECT false, ('Invoice cannot be sent from status: ' || v_invoice.status)::TEXT, NULL::UUID;
    RETURN;
  END IF;

  v_ar_account_id := get_or_create_ledger_account(p_ledger_id, 'accounts_receivable', 'Accounts Receivable');
  v_revenue_account_id := get_or_create_ledger_account(p_ledger_id, 'revenue', 'Revenue');

  IF v_ar_account_id IS NULL OR v_revenue_account_id IS NULL THEN
    RETURN QUERY SELECT false, 'Failed to create required accounts'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  v_amount_dollars := v_invoice.total_amount / 100.0;

  INSERT INTO transactions (
    ledger_id, transaction_type, reference_id, reference_type,
    description, amount, currency, status, metadata
  ) VALUES (
    p_ledger_id, 'invoice', v_invoice.invoice_number, 'invoice',
    'Invoice ' || v_invoice.invoice_number || ' - ' || v_invoice.customer_name,
    v_amount_dollars, v_invoice.currency, 'completed',
    jsonb_build_object(
      'invoice_id', v_invoice.id,
      'customer_id', v_invoice.customer_id,
      'customer_name', v_invoice.customer_name
    )
  )
  RETURNING id INTO v_transaction_id;

  INSERT INTO entries (transaction_id, account_id, entry_type, amount)
  VALUES
    (v_transaction_id, v_ar_account_id, 'debit', v_amount_dollars),
    (v_transaction_id, v_revenue_account_id, 'credit', v_amount_dollars);

  UPDATE invoices
  SET status = 'sent',
      sent_at = NOW(),
      transaction_id = v_transaction_id
  WHERE id = p_invoice_id;

  RETURN QUERY SELECT true, 'Invoice sent and AR entry created'::TEXT, v_transaction_id;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, ('Error: ' || SQLERRM)::TEXT, NULL::UUID;
END;
$$
