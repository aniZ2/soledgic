-- Soledgic: Secure Payout Files Storage
-- Creates private storage bucket for NACHA/ACH files with RLS
-- Date: December 23, 2024

-- ============================================================================
-- 1. CREATE PRIVATE STORAGE BUCKET
-- ============================================================================

-- Note: This needs to be run via Supabase Dashboard or CLI since
-- storage bucket creation requires special permissions.
-- 
-- Run in Supabase Dashboard SQL Editor:
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES (
--   'payout-files',
--   'payout-files', 
--   false,  -- Private bucket
--   5242880,  -- 5MB limit
--   ARRAY['text/plain', 'application/octet-stream']
-- );

-- ============================================================================
-- 2. STORAGE RLS POLICIES
-- ============================================================================

-- Policy: Only service role can upload files
-- (Edge functions use service role key)
DROP POLICY IF EXISTS "Service role can upload payout files" ON storage.objects;
CREATE POLICY "Service role can upload payout files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'payout-files'
    AND auth.role() = 'service_role'
  );

-- Policy: Only service role can read files (for signed URL generation)
DROP POLICY IF EXISTS "Service role can read payout files" ON storage.objects;
CREATE POLICY "Service role can read payout files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'payout-files'
    AND auth.role() = 'service_role'
  );

-- Policy: Org members can download files for their ledgers via signed URLs
-- Note: Signed URLs bypass RLS, but we still want defense in depth
DROP POLICY IF EXISTS "Org members can access their ledger files" ON storage.objects;
CREATE POLICY "Org members can access their ledger files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'payout-files'
    AND (
      auth.role() = 'service_role'
      OR (
        -- Extract ledger_id from path: nacha/{ledger_id}/...
        (storage.foldername(name))[2]::UUID IN (
          SELECT l.id FROM ledgers l
          INNER JOIN organization_members om ON om.organization_id = l.organization_id
          WHERE om.user_id = auth.uid() 
          AND om.status = 'active'
          AND om.role IN ('owner', 'admin')  -- Only admins can download
        )
      )
    )
  );

-- Policy: No direct deletes - files are retained for audit
DROP POLICY IF EXISTS "No direct deletes on payout files" ON storage.objects;
CREATE POLICY "No direct deletes on payout files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'payout-files'
    AND auth.role() = 'service_role'
    -- Even service role should use scheduled cleanup, not direct deletes
    AND false  -- Block all deletes
  );

-- ============================================================================
-- 3. FILE RETENTION CLEANUP (scheduled job)
-- ============================================================================

-- Function to cleanup old payout files (30 day retention)
CREATE OR REPLACE FUNCTION cleanup_old_payout_files()
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER := 0;
  v_file RECORD;
BEGIN
  -- Find files older than 30 days
  FOR v_file IN
    SELECT name 
    FROM storage.objects
    WHERE bucket_id = 'payout-files'
    AND created_at < NOW() - INTERVAL '30 days'
  LOOP
    -- Delete the file
    DELETE FROM storage.objects 
    WHERE bucket_id = 'payout-files' 
    AND name = v_file.name;
    
    v_deleted := v_deleted + 1;
  END LOOP;
  
  IF v_deleted > 0 THEN
    RAISE NOTICE 'Cleaned up % old payout files', v_deleted;
  END IF;
  
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- To schedule (after enabling pg_cron):
-- SELECT cron.schedule('cleanup-payout-files', '0 4 * * *', 'SELECT cleanup_old_payout_files()');

-- ============================================================================
-- 4. AUDIT TABLE FOR FILE DOWNLOADS
-- ============================================================================

CREATE TABLE IF NOT EXISTS payout_file_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  downloaded_by UUID REFERENCES auth.users(id),
  downloaded_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

ALTER TABLE payout_file_downloads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can insert download logs"
  ON payout_file_downloads FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Org admins can view download logs"
  ON payout_file_downloads FOR SELECT
  USING (
    ledger_id IN (
      SELECT l.id FROM ledgers l
      INNER JOIN organization_members om ON om.organization_id = l.organization_id
      WHERE om.user_id = auth.uid()
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin')
    )
  );

CREATE INDEX idx_payout_file_downloads_ledger ON payout_file_downloads(ledger_id, downloaded_at DESC);

COMMENT ON TABLE payout_file_downloads IS 'Audit trail for payout file downloads';
COMMENT ON FUNCTION cleanup_old_payout_files IS 'Cleanup payout files older than 30 days (run daily via cron)';
