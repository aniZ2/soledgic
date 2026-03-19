-- Hard-delete ALL data from test-mode ledgers. Clean slate.
-- Live-mode data is never touched.

-- Disable entry protection triggers
ALTER TABLE public.entries DISABLE TRIGGER trg_entries_immutability;
ALTER TABLE public.entries DISABLE TRIGGER enforce_double_entry;
ALTER TABLE public.entries DISABLE TRIGGER trg_entries_double_entry_delete;
ALTER TABLE public.entries DISABLE TRIGGER trigger_update_balance;

DO $$
DECLARE
  v_test_ledger_ids uuid[];
  v_test_tx_ids uuid[];
BEGIN
  -- Collect test ledger IDs
  SELECT array_agg(id) INTO v_test_ledger_ids
  FROM public.ledgers WHERE livemode = false;

  IF v_test_ledger_ids IS NULL THEN
    RAISE NOTICE 'No test ledgers found — nothing to purge';
    RETURN;
  END IF;

  -- Collect test transaction IDs
  SELECT array_agg(id) INTO v_test_tx_ids
  FROM public.transactions WHERE ledger_id = ANY(v_test_ledger_ids);

  IF v_test_tx_ids IS NOT NULL THEN
    -- Delete from all tables that FK to transactions
    DELETE FROM public.entries WHERE transaction_id = ANY(v_test_tx_ids);
    DELETE FROM public.adjustment_journals WHERE transaction_id = ANY(v_test_tx_ids) OR original_transaction_id = ANY(v_test_tx_ids);
    DELETE FROM public.contractor_payments WHERE transaction_id = ANY(v_test_tx_ids);
    DELETE FROM public.escrow_releases WHERE transaction_id = ANY(v_test_tx_ids);
    DELETE FROM public.expense_attachments WHERE transaction_id = ANY(v_test_tx_ids);
    DELETE FROM public.held_funds WHERE transaction_id = ANY(v_test_tx_ids) OR release_transaction_id = ANY(v_test_tx_ids);
    DELETE FROM public.internal_transfers WHERE transaction_id = ANY(v_test_tx_ids);
    DELETE FROM public.invoice_payments WHERE transaction_id = ANY(v_test_tx_ids);
    DELETE FROM public.opening_balances WHERE transaction_id = ANY(v_test_tx_ids);
    DELETE FROM public.payout_executions WHERE transaction_id = ANY(v_test_tx_ids);
    DELETE FROM public.payouts WHERE transaction_id = ANY(v_test_tx_ids);
    DELETE FROM public.release_queue WHERE transaction_id = ANY(v_test_tx_ids);

    -- Null out FK refs in invoices and bank tables (don't delete those rows)
    UPDATE public.invoices SET transaction_id = NULL WHERE transaction_id = ANY(v_test_tx_ids);
    UPDATE public.bank_transactions SET matched_transaction_id = NULL WHERE matched_transaction_id = ANY(v_test_tx_ids);
    UPDATE public.bank_statement_lines SET matched_transaction_id = NULL WHERE matched_transaction_id = ANY(v_test_tx_ids);
    UPDATE public.projected_transactions SET matched_transaction_id = NULL WHERE matched_transaction_id = ANY(v_test_tx_ids);

    -- Now delete transactions (self-refs: reversed_by, reverses, recurring_parent_id)
    UPDATE public.transactions SET reversed_by = NULL, reverses = NULL, recurring_parent_id = NULL
    WHERE id = ANY(v_test_tx_ids);

    DELETE FROM public.transactions WHERE id = ANY(v_test_tx_ids);
  END IF;

  -- Delete bank data for test ledgers
  DELETE FROM public.bank_transactions WHERE ledger_id = ANY(v_test_ledger_ids);
  DELETE FROM public.bank_statement_lines WHERE ledger_id = ANY(v_test_ledger_ids);

  -- Reset account balances
  UPDATE public.accounts SET balance = 0 WHERE ledger_id = ANY(v_test_ledger_ids);

  -- Delete tax data for test ledgers
  DELETE FROM public.tax_documents WHERE ledger_id = ANY(v_test_ledger_ids);
  DELETE FROM public.tax_year_summaries WHERE ledger_id = ANY(v_test_ledger_ids);

  RAISE NOTICE 'Purged % test ledgers, % transactions',
    array_length(v_test_ledger_ids, 1),
    COALESCE(array_length(v_test_tx_ids, 1), 0);
END $$;

-- Re-enable triggers
ALTER TABLE public.entries ENABLE TRIGGER trg_entries_immutability;
ALTER TABLE public.entries ENABLE TRIGGER enforce_double_entry;
ALTER TABLE public.entries ENABLE TRIGGER trg_entries_double_entry_delete;
ALTER TABLE public.entries ENABLE TRIGGER trigger_update_balance;
