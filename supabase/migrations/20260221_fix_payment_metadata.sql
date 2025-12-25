-- Fix payment metadata to include original_invoice_id (transaction ID) for AR aging matching
-- The AR aging function aggregates by transaction ID, so payments need to reference
-- the original invoice's transaction_id, not just the invoice record id

CREATE OR REPLACE FUNCTION record_invoice_payment_atomic(
  p_invoice_id UUID,
  p_ledger_id UUID,
  p_amount_cents BIGINT,
  p_payment_method TEXT DEFAULT NULL,
  p_payment_date DATE DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  transaction_id UUID,
  new_status TEXT,
  amount_paid_total BIGINT,
  amount_due_remaining BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_cash_account_id UUID;
  v_ar_account_id UUID;
  v_transaction_id UUID;
  v_amount_dollars NUMERIC;
  v_new_amount_paid BIGINT;
  v_new_amount_due BIGINT;
  v_new_status TEXT;
  v_payment_date DATE;
BEGIN
  IF p_invoice_id IS NULL THEN
    RETURN QUERY SELECT false, 'Invoice ID is required'::TEXT, NULL::UUID, NULL::TEXT, NULL::BIGINT, NULL::BIGINT;
    RETURN;
  END IF;

  SELECT * INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id AND ledger_id = p_ledger_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Invoice not found'::TEXT, NULL::UUID, NULL::TEXT, NULL::BIGINT, NULL::BIGINT;
    RETURN;
  END IF;

  IF v_invoice.status = 'void' THEN
    RETURN QUERY SELECT false, 'Cannot record payment on invoice with status: void'::TEXT, NULL::UUID, NULL::TEXT, NULL::BIGINT, NULL::BIGINT;
    RETURN;
  END IF;

  IF v_invoice.status = 'draft' THEN
    RETURN QUERY SELECT false, 'Cannot record payment on invoice with status: draft'::TEXT, NULL::UUID, NULL::TEXT, NULL::BIGINT, NULL::BIGINT;
    RETURN;
  END IF;

  IF v_invoice.status = 'paid' THEN
    RETURN QUERY SELECT false, 'Invoice is already fully paid'::TEXT, NULL::UUID, NULL::TEXT, NULL::BIGINT, NULL::BIGINT;
    RETURN;
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RETURN QUERY SELECT false, 'Payment amount must be positive'::TEXT, NULL::UUID, NULL::TEXT, NULL::BIGINT, NULL::BIGINT;
    RETURN;
  END IF;

  IF p_amount_cents > v_invoice.amount_due THEN
    RETURN QUERY SELECT false, ('Payment amount (' || p_amount_cents || ') exceeds amount due (' || v_invoice.amount_due || ')')::TEXT,
      NULL::UUID, NULL::TEXT, NULL::BIGINT, NULL::BIGINT;
    RETURN;
  END IF;

  v_cash_account_id := get_or_create_ledger_account(p_ledger_id, 'cash', 'Cash / Bank');
  v_ar_account_id := get_or_create_ledger_account(p_ledger_id, 'accounts_receivable', 'Accounts Receivable');

  IF v_cash_account_id IS NULL OR v_ar_account_id IS NULL THEN
    RETURN QUERY SELECT false, 'Failed to create required accounts'::TEXT, NULL::UUID, NULL::TEXT, NULL::BIGINT, NULL::BIGINT;
    RETURN;
  END IF;

  v_amount_dollars := p_amount_cents / 100.0;
  v_payment_date := COALESCE(p_payment_date, CURRENT_DATE);
  v_new_amount_paid := v_invoice.amount_paid + p_amount_cents;
  v_new_amount_due := v_invoice.total_amount - v_new_amount_paid;
  v_new_status := CASE WHEN v_new_amount_due <= 0 THEN 'paid' ELSE 'partial' END;

  INSERT INTO transactions (
    ledger_id, transaction_type, reference_id, reference_type,
    description, amount, currency, status, metadata
  ) VALUES (
    p_ledger_id, 'invoice_payment', p_reference_id, COALESCE(p_payment_method, 'payment'),
    'Payment received: Invoice ' || v_invoice.invoice_number, v_amount_dollars,
    v_invoice.currency, 'completed',
    jsonb_build_object(
      'invoice_id', v_invoice.id,
      'original_invoice_id', v_invoice.transaction_id,  -- KEY FIX: Use transaction_id for AR matching
      'invoice_number', v_invoice.invoice_number,
      'customer_id', v_invoice.customer_id,
      'customer_name', v_invoice.customer_name,
      'payment_method', p_payment_method
    )
  )
  RETURNING id INTO v_transaction_id;

  INSERT INTO entries (transaction_id, account_id, entry_type, amount)
  VALUES
    (v_transaction_id, v_cash_account_id, 'debit', v_amount_dollars),
    (v_transaction_id, v_ar_account_id, 'credit', v_amount_dollars);

  INSERT INTO invoice_payments (
    invoice_id, transaction_id, amount, payment_date,
    payment_method, reference_id, notes
  ) VALUES (
    p_invoice_id, v_transaction_id, p_amount_cents, v_payment_date,
    p_payment_method, p_reference_id, p_notes
  );

  UPDATE invoices
  SET amount_paid = v_new_amount_paid,
      amount_due = v_new_amount_due,
      status = v_new_status,
      paid_at = CASE WHEN v_new_status = 'paid' THEN NOW() ELSE NULL END
  WHERE id = p_invoice_id;

  RETURN QUERY SELECT true, ('Payment of $' || v_amount_dollars || ' recorded')::TEXT,
    v_transaction_id, v_new_status, v_new_amount_paid, v_new_amount_due;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, ('Error: ' || SQLERRM)::TEXT, NULL::UUID, NULL::TEXT, NULL::BIGINT, NULL::BIGINT;
END;
$$;
