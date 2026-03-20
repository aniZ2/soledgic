#!/usr/bin/env bash
# Deploy selected Supabase Edge Functions by name.
# Run: chmod +x scripts/deploy-functions.sh && ./scripts/deploy-functions.sh payouts platform-payouts

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FUNCTIONS_DIR="$ROOT/supabase/functions"
AVAILABLE_FUNCTIONS=()
TARGETS=()
FAILURES=()

while IFS= read -r fn; do
  AVAILABLE_FUNCTIONS+=("$fn")
done < <(find "$FUNCTIONS_DIR" -maxdepth 1 -mindepth 1 -type d ! -name '_*' -exec basename {} \; | sort)

usage() {
  echo "Usage: ./scripts/deploy-functions.sh <function> [function ...]"
  echo "       ./scripts/deploy-functions.sh --list"
}

has_function() {
  local candidate="$1"
  local fn
  for fn in "${AVAILABLE_FUNCTIONS[@]}"; do
    if [ "$fn" = "$candidate" ]; then
      return 0
    fi
  done
  return 1
}

for arg in "$@"; do
  if [ "$arg" = "--help" ]; then
    usage
    exit 0
  fi
done

if [ "${1:-}" = "--list" ]; then
  printf '%s\n' "${AVAILABLE_FUNCTIONS[@]}"
  exit 0
fi

if [ $# -eq 0 ]; then
  usage
  exit 2
fi

for target in "$@"; do
  if ! has_function "$target"; then
    echo "Unknown function: $target" >&2
    echo "" >&2
    usage >&2
    exit 2
  fi
  TARGETS+=("$target")
done

echo "=========================================="
echo "Deploying Selected Edge Functions"
echo "=========================================="
echo ""

total=${#TARGETS[@]}
i=1

for target in "${TARGETS[@]}"; do
  echo "[$i/$total] $target"
  if ! supabase functions deploy "$target" --no-verify-jwt; then
    FAILURES+=("$target")
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
