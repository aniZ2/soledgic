-- Atomic receive-payment RPC
-- Wraps transaction + entries insert in a single database transaction
-- to eliminate the partial-write risk in the receive-payment Edge Function.

CREATE OR REPLACE FUNCTION receive_payment_atomic(
  p_ledger_id UUID,
  p_amount_cents BIGINT,
  p_reference_id TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL,
  p_description TEXT DEFAULT 'Payment received',
  p_currency TEXT DEFAULT 'USD',
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE(
  status TEXT,
  transaction_id UUID,
  amount_dollars NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cash_account_id UUID;
  v_ar_account_id UUID;
  v_transaction_id UUID;
  v_amount_dollars NUMERIC;
  v_existing_tx RECORD;
BEGIN
  -- Tenant isolation guard (defense-in-depth)
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.ledgers l ON l.organization_id = om.organization_id
      WHERE l.id = p_ledger_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  -- Validate inputs
  IF p_ledger_id IS NULL THEN
    RAISE EXCEPTION 'ledger_id is required';
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'amount must be a positive integer (cents)';
  END IF;

  -- Convert cents to dollars
  v_amount_dollars := p_amount_cents / 100.0;

  -- Resolve accounts (creates if missing)
  v_cash_account_id := get_or_create_ledger_account(p_ledger_id, 'cash', 'Cash / Bank');
  v_ar_account_id := get_or_create_ledger_account(p_ledger_id, 'accounts_receivable', 'Accounts Receivable');

  IF v_cash_account_id IS NULL OR v_ar_account_id IS NULL THEN
    RAISE EXCEPTION 'Failed to resolve required accounts';
  END IF;

  -- Insert transaction
  INSERT INTO transactions (
    ledger_id, transaction_type, reference_id, reference_type,
    description, amount, currency, status, metadata
  ) VALUES (
    p_ledger_id, 'invoice_payment', p_reference_id,
    COALESCE(p_payment_method, 'payment'),
    p_description, v_amount_dollars, p_currency, 'completed',
    p_metadata
  )
  RETURNING id INTO v_transaction_id;

  -- Insert balanced entries (debit cash, credit AR) -- same transaction
  INSERT INTO entries (transaction_id, account_id, entry_type, amount)
  VALUES
    (v_transaction_id, v_cash_account_id, 'debit', v_amount_dollars),
    (v_transaction_id, v_ar_account_id, 'credit', v_amount_dollars);

  RETURN QUERY SELECT 'ok'::TEXT, v_transaction_id, v_amount_dollars;

EXCEPTION
  WHEN unique_violation THEN
    -- Idempotent: return existing transaction for duplicate reference_id
    SELECT t.id, t.amount INTO v_existing_tx
    FROM transactions t
    WHERE t.ledger_id = p_ledger_id
      AND t.reference_id = p_reference_id
    LIMIT 1;

    IF v_existing_tx.id IS NOT NULL THEN
      RETURN QUERY SELECT 'duplicate'::TEXT, v_existing_tx.id, v_existing_tx.amount;
    ELSE
      RAISE;
    END IF;
END;
$$
