-- Migration: Rename all Stripe-era columns and RPC parameters to processor-agnostic names
-- Fixes live bug: holds-service.ts passes p_processor_transfer_id but RPCs expect p_stripe_transfer_id
-- Also renames unused Stripe columns for consistency (no app code references them)

-- ============================================================================
-- 1. Rename columns on escrow_releases
-- ============================================================================
ALTER TABLE public.escrow_releases RENAME COLUMN stripe_transfer_id TO processor_transfer_id;
ALTER TABLE public.escrow_releases RENAME COLUMN stripe_transfer_group TO processor_transfer_group;
ALTER TABLE public.escrow_releases RENAME COLUMN stripe_error_code TO processor_error_code;
ALTER TABLE public.escrow_releases RENAME COLUMN stripe_error_message TO processor_error_message;
ALTER TABLE public.escrow_releases RENAME COLUMN recipient_stripe_account TO recipient_processor_account;

-- ============================================================================
-- 2. Rename columns on release_queue
-- ============================================================================
ALTER TABLE public.release_queue RENAME COLUMN stripe_transfer_id TO processor_transfer_id;
ALTER TABLE public.release_queue RENAME COLUMN stripe_error TO processor_error;
ALTER TABLE public.release_queue RENAME COLUMN recipient_stripe_account_id TO recipient_processor_account_id;

-- ============================================================================
-- 3. Recreate complete_fund_release with correct parameter name
-- ============================================================================
CREATE OR REPLACE FUNCTION public.complete_fund_release(
  p_release_id UUID,
  p_processor_transfer_id TEXT,
  p_approved_by UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_release RECORD;
BEGIN
  SELECT * INTO v_release
  FROM escrow_releases
  WHERE id = p_release_id
    AND status IN ('pending', 'approved', 'processing')
  FOR UPDATE;

  IF v_release IS NULL THEN
    RAISE EXCEPTION 'Release % not found or already completed', p_release_id;
  END IF;

  UPDATE escrow_releases
  SET
    status = 'completed',
    processor_transfer_id = p_processor_transfer_id,
    approved_by = COALESCE(p_approved_by, approved_by),
    approved_at = COALESCE(approved_at, NOW()),
    executed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_release_id;

  UPDATE entries
  SET
    release_status = 'released',
    released_at = NOW(),
    released_by = p_approved_by,
    release_transfer_id = p_processor_transfer_id
  WHERE id = v_release.entry_id;
END;
$function$;

-- ============================================================================
-- 4. Recreate complete_release with correct parameter name
-- ============================================================================
CREATE OR REPLACE FUNCTION public.complete_release(
  p_release_id UUID,
  p_processor_transfer_id TEXT,
  p_approved_by UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_release RECORD;
BEGIN
  SELECT * INTO v_release
  FROM release_queue
  WHERE id = p_release_id
    AND status IN ('pending', 'processing')
  FOR UPDATE;

  IF v_release IS NULL THEN
    RAISE EXCEPTION 'Release request not found or already processed: %', p_release_id;
  END IF;

  UPDATE release_queue
  SET
    status = 'completed',
    processor_transfer_id = p_processor_transfer_id,
    approved_by = COALESCE(p_approved_by, approved_by),
    approved_at = COALESCE(approved_at, NOW()),
    executed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_release_id;

  UPDATE entries
  SET
    release_status = 'released',
    released_at = NOW(),
    released_by = p_approved_by,
    release_transfer_id = p_processor_transfer_id
  WHERE id = v_release.entry_id;
END;
$function$;
