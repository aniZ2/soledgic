#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BOOKLYVERSE_ROOT="${BOOKLYVERSE_ROOT:-/Users/osifo/Desktop/Booklyverse}"

load_env_value() {
  local key="$1"
  local file

  for file in \
    "$BOOKLYVERSE_ROOT/.env.local" \
    "$BOOKLYVERSE_ROOT/.env.production"
  do
    if [[ -f "$file" ]]; then
      local value
      value="$(sed -n "s/^${key}=//p" "$file" | tail -n 1)"
      if [[ -n "$value" ]]; then
        printf '%s' "$value"
        return 0
      fi
    fi
  done

  return 1
}

if [[ -z "${SOLEDGIC_API_KEY:-}" ]]; then
  if SOLEDGIC_API_KEY="$(load_env_value "SOLEDGIC_API_KEY")"; then
    export SOLEDGIC_API_KEY
  fi
fi

if [[ -z "${SOLEDGIC_API_KEY:-}" ]]; then
  printf 'FATAL: SOLEDGIC_API_KEY is not set and could not be loaded from %s\n' "$BOOKLYVERSE_ROOT" >&2
  exit 1
fi

if [[ -z "${SOLEDGIC_BASE_URL:-}" ]]; then
  export SOLEDGIC_BASE_URL="https://api.soledgic.com/v1"
fi

if [[ -z "${SOLEDGIC_ALLOW_WRITES:-}" ]]; then
  if [[ "$SOLEDGIC_API_KEY" == sk_test_* ]]; then
    export SOLEDGIC_ALLOW_WRITES="true"
  else
    export SOLEDGIC_ALLOW_WRITES="false"
  fi
fi

if [[ -z "${SOLEDGIC_ACTOR:-}" ]]; then
  export SOLEDGIC_ACTOR="booklyverse-codex"
fi

exec node "$REPO_ROOT/packages/mcp-server/dist/index.js"
