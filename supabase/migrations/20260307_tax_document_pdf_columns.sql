-- Tax document PDF generation columns
-- Uses object storage path instead of inline base64 to avoid table bloat

ALTER TABLE tax_documents ADD COLUMN IF NOT EXISTS pdf_path TEXT;
ALTER TABLE tax_documents ADD COLUMN IF NOT EXISTS pdf_generated_at TIMESTAMPTZ;
ALTER TABLE tax_documents ADD COLUMN IF NOT EXISTS copy_type TEXT
  CHECK (copy_type IN ('a', 'b', '1', '2')) DEFAULT 'b';

COMMENT ON COLUMN tax_documents.pdf_path IS 'Supabase Storage path to generated PDF file';
COMMENT ON COLUMN tax_documents.pdf_generated_at IS 'When the PDF was last generated';
COMMENT ON COLUMN tax_documents.copy_type IS 'IRS copy: a=IRS, b=Recipient, 1=State, 2=Payer';

-- Private storage bucket for tax document PDFs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tax-documents',
  'tax-documents',
  false,
  5242880,  -- 5MB limit
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Only service role can upload (Edge Functions)
DROP POLICY IF EXISTS "Service role upload tax documents" ON storage.objects;
CREATE POLICY "Service role upload tax documents"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'tax-documents');

-- Only admins/owners can download via signed URLs
DROP POLICY IF EXISTS "Admin download tax documents" ON storage.objects;
CREATE POLICY "Admin download tax documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'tax-documents'
  AND EXISTS (
    SELECT 1 FROM organization_members om
    INNER JOIN ledgers l ON l.organization_id = om.organization_id
    WHERE om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin')
    AND l.id::text = (storage.foldername(name))[1]
  )
);

-- Service role can delete (for cleanup/regeneration)
DROP POLICY IF EXISTS "Service role delete tax documents" ON storage.objects;
CREATE POLICY "Service role delete tax documents"
ON storage.objects FOR DELETE
TO service_role
USING (bucket_id = 'tax-documents');
