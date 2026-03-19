-- Force-delete creator in test mode: voids all transactions and entries
-- for the creator, then soft-deletes the account. Only works on
-- test-mode ledgers (livemode = false). Live mode still blocks.

CREATE OR REPLACE FUNCTION public.force_delete_creator(
  p_ledger_id uuid,
  p_creator_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id uuid;
  v_livemode boolean;
  v_voided_txns integer := 0;
  v_voided_entries integer := 0;
  v_txn record;
BEGIN
  -- Check livemode
  SELECT l.livemode INTO v_livemode
  FROM ledgers l WHERE l.id = p_ledger_id;

  IF v_livemode IS TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot force-delete creators in live mode — use standard delete or deactivate'
    );
  END IF;

  -- Lock the account
  SELECT id INTO v_account_id
  FROM accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'creator_balance'
    AND entity_id = p_creator_id
    AND is_active = true
  FOR UPDATE;

  IF v_account_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Creator not found');
  END IF;

  -- Void all transactions that reference this creator's account
  FOR v_txn IN
    SELECT DISTINCT e.transaction_id
    FROM entries e
    WHERE e.account_id = v_account_id
  LOOP
    UPDATE transactions
    SET status = 'voided', metadata = metadata || jsonb_build_object('force_deleted_creator', p_creator_id, 'voided_at', now()::text)
    WHERE id = v_txn.transaction_id AND status != 'voided';

    IF FOUND THEN
      v_voided_txns := v_voided_txns + 1;
    END IF;
  END LOOP;

  -- Count voided entries
  SELECT count(*) INTO v_voided_entries
  FROM entries WHERE account_id = v_account_id;

  -- Soft-delete the account
  UPDATE accounts
  SET is_active = false, updated_at = now()
  WHERE id = v_account_id;

  -- Clean up identity links
  UPDATE participant_identity_links
  SET status = 'inactive', unlinked_at = now()
  WHERE ledger_id = p_ledger_id AND participant_id = p_creator_id;

  -- Clean up connected accounts
  UPDATE connected_accounts
  SET is_active = false
  WHERE ledger_id = p_ledger_id AND entity_id = p_creator_id;

  RETURN jsonb_build_object(
    'success', true,
    'account_id', v_account_id,
    'voided_transactions', v_voided_txns,
    'voided_entries', v_voided_entries,
    'creator_id', p_creator_id
  );
END;
$$;
