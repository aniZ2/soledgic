-- Enable RLS on storage.objects (idempotent — already enabled by Supabase)
-- and add policies for the receipts bucket scoped to org membership via ledger.
--
-- Upload path convention: {ledger_id}/{timestamp}_{uuid}.{ext}
-- The first folder name is the ledger_id, used to check org membership.

DO $$
BEGIN
  -- Policy: authenticated users can upload receipts to their org's ledgers
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Org members can upload receipts' AND tablename = 'objects'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Org members can upload receipts"
        ON storage.objects FOR INSERT
        TO authenticated
        WITH CHECK (
          bucket_id = 'receipts'
          AND (storage.foldername(name))[1]::UUID IN (
            SELECT l.id FROM public.ledgers l
            INNER JOIN public.organization_members om ON om.organization_id = l.organization_id
            WHERE om.user_id = auth.uid()
              AND om.status = 'active'
          )
        )
    $p$;
  END IF;

  -- Policy: authenticated users can read receipts from their org's ledgers
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Org members can read receipts' AND tablename = 'objects'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Org members can read receipts"
        ON storage.objects FOR SELECT
        TO authenticated
        USING (
          bucket_id = 'receipts'
          AND (storage.foldername(name))[1]::UUID IN (
            SELECT l.id FROM public.ledgers l
            INNER JOIN public.organization_members om ON om.organization_id = l.organization_id
            WHERE om.user_id = auth.uid()
              AND om.status = 'active'
          )
        )
    $p$;
  END IF;

  -- Policy: authenticated users can delete their org's receipts (owner/admin only)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Org admins can delete receipts' AND tablename = 'objects'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Org admins can delete receipts"
        ON storage.objects FOR DELETE
        TO authenticated
        USING (
          bucket_id = 'receipts'
          AND (storage.foldername(name))[1]::UUID IN (
            SELECT l.id FROM public.ledgers l
            INNER JOIN public.organization_members om ON om.organization_id = l.organization_id
            WHERE om.user_id = auth.uid()
              AND om.status = 'active'
              AND om.role IN ('owner', 'admin')
          )
        )
    $p$;
  END IF;

  -- Policy: service role has full access (for edge functions)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access to receipts' AND tablename = 'objects'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Service role full access to receipts"
        ON storage.objects FOR ALL
        TO service_role
        USING (bucket_id = 'receipts')
        WITH CHECK (bucket_id = 'receipts')
    $p$;
  END IF;
END;
$$
