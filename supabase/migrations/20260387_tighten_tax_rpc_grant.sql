DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.submit_tax_info_atomic FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.submit_tax_info_atomic TO service_role;
END $$;
