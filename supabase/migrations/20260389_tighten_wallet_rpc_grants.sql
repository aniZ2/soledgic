-- Fix: wallet atomic RPCs missing grant tightening.
-- Found by arch:validate-financial check #6.

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.wallet_deposit_atomic FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.wallet_deposit_atomic TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.wallet_withdraw_atomic FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.wallet_withdraw_atomic TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.wallet_transfer_atomic FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.wallet_transfer_atomic TO service_role;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
