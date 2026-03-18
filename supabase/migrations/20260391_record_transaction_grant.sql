DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.record_transaction_atomic FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.record_transaction_atomic TO service_role;
END $$;
