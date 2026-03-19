DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.force_delete_creator FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.force_delete_creator TO service_role;
END $$;
