DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.reverse_transaction_atomic FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.reverse_transaction_atomic TO service_role;
END $$;
