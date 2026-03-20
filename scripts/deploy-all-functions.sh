#!/usr/bin/env bash
# Deploy all Supabase Edge Functions present in supabase/functions.
# Run: chmod +x scripts/deploy-all-functions.sh && ./scripts/deploy-all-functions.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FUNCTIONS_DIR="$ROOT/supabase/functions"
FUNCTIONS=()
FAILURES=()

while IFS= read -r fn; do
  FUNCTIONS+=("$fn")
done < <(find "$FUNCTIONS_DIR" -maxdepth 1 -mindepth 1 -type d ! -name '_*' -exec basename {} \; | sort)

usage() {
  echo "Usage: ./scripts/deploy-all-functions.sh [--list | --dry-run]"
}

if [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

if [ "${1:-}" = "--list" ]; then
  printf '%s\n' "${FUNCTIONS[@]}"
  exit 0
fi

if [ "${1:-}" = "--dry-run" ]; then
  total=${#FUNCTIONS[@]}
  i=1
  for fn in "${FUNCTIONS[@]}"; do
    echo "[$i/$total] $fn"
    i=$((i + 1))
  done
  exit 0
fi

if [ $# -gt 0 ]; then
  usage
  exit 2
fi

echo "=========================================="
echo "Deploying All Supabase Edge Functions"
echo "=========================================="
echo ""

total=${#FUNCTIONS[@]}
i=1

for fn in "${FUNCTIONS[@]}"; do
  echo "[$i/$total] $fn"
  if ! supabase functions deploy "$fn" --no-verify-jwt; then
    FAILURES+=("$fn")
  fi
  i=$((i + 1))
done

echo ""
echo "=========================================="

if [ ${#FAILURES[@]} -gt 0 ]; then
  echo "Deployment finished with failures:"
  printf '  - %s\n' "${FAILURES[@]}"
  exit 1
fi

echo "Deployment complete"
echo "=========================================="
