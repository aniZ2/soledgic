#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_ENTRY="$REPO_ROOT/packages/mcp-server/dist/index.js"
DEFAULT_ENV_FILE="$REPO_ROOT/test-data/api-keys.env"
SCRIPT_NAME="$(basename "$0")"

print_help() {
  cat <<EOF
Usage: $SCRIPT_NAME

Starts the Soledgic MCP server using environment variables from the current
shell and, if present, a local env file.

Environment variables:
  SOLEDGIC_API_KEY             Required unless present in an env file
  SOLEDGIC_MCP_ENV_FILE        Optional path to an env file to load first
  SOLEDGIC_BASE_URL            Optional; defaults to https://api.soledgic.com/v1
  SOLEDGIC_ALLOW_WRITES        Optional; defaults to false
  SOLEDGIC_ALLOW_LIVE_WRITES   Optional; defaults to false
  SOLEDGIC_ALLOWED_TOOLS       Optional comma-separated tool allowlist
  SOLEDGIC_ACTOR               Optional; defaults to soledgic-mcp

If SOLEDGIC_MCP_ENV_FILE is unset and $DEFAULT_ENV_FILE exists, that file is
used automatically.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  print_help
  exit 0
fi

strip_wrapping_quotes() {
  local value="$1"

  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value#\"}"
    value="${value%\"}"
  elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
    value="${value#\'}"
    value="${value%\'}"
  fi

  printf '%s' "$value"
}

load_env_value() {
  local key="$1"
  local file="$2"
  local value

  if [[ ! -f "$file" ]]; then
    return 1
  fi

  value="$(sed -n "s/^${key}=//p" "$file" | tail -n 1)"
  if [[ -z "$value" ]]; then
    return 1
  fi

  strip_wrapping_quotes "$value"
}

load_if_missing() {
  local key="$1"
  local file="$2"
  local value
  local current="${(P)key-}"

  if [[ -n "$current" ]]; then
    return 0
  fi

  if value="$(load_env_value "$key" "$file")"; then
    export "$key=$value"
  fi
}

ENV_FILE="${SOLEDGIC_MCP_ENV_FILE:-}"
if [[ -z "$ENV_FILE" && -f "$DEFAULT_ENV_FILE" ]]; then
  ENV_FILE="$DEFAULT_ENV_FILE"
fi

if [[ -n "$ENV_FILE" ]]; then
  load_if_missing "SOLEDGIC_API_KEY" "$ENV_FILE"
  load_if_missing "SOLEDGIC_BASE_URL" "$ENV_FILE"
  load_if_missing "SOLEDGIC_ALLOW_WRITES" "$ENV_FILE"
  load_if_missing "SOLEDGIC_ALLOW_LIVE_WRITES" "$ENV_FILE"
  load_if_missing "SOLEDGIC_ALLOWED_TOOLS" "$ENV_FILE"
  load_if_missing "SOLEDGIC_ACTOR" "$ENV_FILE"

  if [[ -z "${SOLEDGIC_BASE_URL:-}" ]]; then
    if SOLEDGIC_BASE_URL="$(load_env_value "SOLEDGIC_API_URL" "$ENV_FILE")"; then
      export SOLEDGIC_BASE_URL
    fi
  fi
fi

if [[ -z "${SOLEDGIC_API_KEY:-}" ]]; then
  printf 'FATAL: SOLEDGIC_API_KEY is not set. Export it in your shell or add it to %s.\n' "${ENV_FILE:-$DEFAULT_ENV_FILE}" >&2
  exit 1
fi

if [[ ! -f "$DIST_ENTRY" ]]; then
  printf 'FATAL: %s is missing. Run "cd %s && npm install && npm run build".\n' "$DIST_ENTRY" "$REPO_ROOT/packages/mcp-server" >&2
  exit 1
fi

if [[ -z "${SOLEDGIC_BASE_URL:-}" ]]; then
  export SOLEDGIC_BASE_URL="https://api.soledgic.com/v1"
fi

if [[ -z "${SOLEDGIC_ALLOW_WRITES:-}" ]]; then
  export SOLEDGIC_ALLOW_WRITES="false"
fi

if [[ -z "${SOLEDGIC_ACTOR:-}" ]]; then
  export SOLEDGIC_ACTOR="soledgic-mcp"
fi

exec node "$DIST_ENTRY"
