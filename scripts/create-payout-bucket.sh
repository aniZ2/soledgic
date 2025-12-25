#!/bin/bash
# Create the payout-files storage bucket via Supabase CLI
# Run this after migrations are applied

echo "Creating payout-files storage bucket..."

# Using supabase CLI to create bucket
# Note: This requires the supabase CLI to be logged in

supabase storage create payout-files \
  --project-ref ocjrcsmoeikxfooeglkt \
  --file-size-limit 5242880 \
  --allowed-mime-types "text/plain,application/octet-stream"

# If the CLI command doesn't work, run this SQL in the Dashboard:
cat << 'EOF'

If the CLI command fails, run this SQL in the Supabase Dashboard SQL Editor:

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payout-files',
  'payout-files', 
  false,
  5242880,
  ARRAY['text/plain', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

EOF

echo "Done!"
