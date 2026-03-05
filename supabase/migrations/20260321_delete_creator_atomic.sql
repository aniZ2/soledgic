-- Soledgic: Atomic delete-creator function (entry-count check + soft-delete in one transaction)

CREATE OR REPLACE FUNCTION public.delete_creator_atomic(
  p_ledger_id UUID,
  p_creator_id TEXT
)
RETURNS TABLE (
  out_account_id UUID,
  out_deleted BOOLEAN,
  out_error TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_account_id UUID;
  v_account_name TEXT;
  v_entry_count BIGINT;
BEGIN
  -- Lock the account row to prevent concurrent writes
  SELECT id, name INTO v_account_id, v_account_name
  FROM public.accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'creator_balance'
    AND entity_id = p_creator_id
    AND is_active = true
  FOR UPDATE;

  IF v_account_id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, false, 'Creator not found'::TEXT;
    RETURN;
  END IF;

  -- Count entries while row is locked
  SELECT count(*) INTO v_entry_count
  FROM public.entries
  WHERE account_id = v_account_id;

  IF v_entry_count > 0 THEN
    RETURN QUERY SELECT v_account_id, false, 'Cannot delete creator with existing transactions'::TEXT;
    RETURN;
  END IF;

  -- Soft delete
  UPDATE public.accounts
  SET is_active = false, updated_at = now()
  WHERE id = v_account_id;

  RETURN QUERY SELECT v_account_id, true, NULL::TEXT;
END;
$$;
