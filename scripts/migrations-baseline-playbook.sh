#!/usr/bin/env bash
set -euo pipefail

# Create a schema baseline file to support migration-chain compaction planning.
# This script does NOT delete or rewrite existing migrations.
#
# Usage:
#   scripts/migrations-baseline-playbook.sh 20270000
#
# Output:
#   supabase/migrations/<version>_baseline_schema.sql

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version>"
  exit 1
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "supabase CLI not found in PATH"
  exit 1
fi

OUT="supabase/migrations/${VERSION}_baseline_schema.sql"
if [[ -f "$OUT" ]]; then
  echo "Refusing to overwrite existing file: $OUT"
  exit 1
fi

echo "Creating baseline dump at $OUT"
supabase db dump --schema public --file "$OUT"

cat <<EOF

Baseline created: $OUT

Next steps (manual, coordinated):
1) Validate \`supabase db reset\` from clean clone using this baseline branch.
2) Archive pre-baseline migrations in a dedicated branch/release process.
3) Update deployment runbook to pin baseline cutover date/version.
EOF
