#!/bin/bash
# Patch ALL pg_cron jobs that call Edge Functions via net.http_post.
#
# WHY: Supabase hosted pg_cron runs in a direct postgres session that does NOT
# have access to current_setting('app.settings.*'). Migrations that use
# current_setting() in cron.schedule() commands will fail at runtime.
# This script inlines the actual secret values via cron.alter_job().
#
# Additionally, Supabase v2 projects inject the sb_secret_* key as
# SUPABASE_SERVICE_ROLE_KEY in Edge Functions, but the Management API
# returns the legacy JWT key. This script uses the correct v2 key.
#
# WHAT IT PATCHES:
#   Bearer-auth jobs (5):
#     - process-processor-inbox-minute  (* * * * *)
#     - reconcile-checkout-ledger-5min  (*/5 * * * *)
#     - billing-overages-daily          (0 7 * * *)
#     - ops-monitor-hourly              (0 * * * *)
#     - scheduled-payouts-daily         (0 6 * * *)
#   x-cron-secret jobs (2):
#     - process-webhooks-minute         (* * * * *)
#     - security-alerts-15min           (*/15 * * * *)
#
# USAGE:
#   export CRON_SECRET="<your-cron-secret>"
#   export SERVICE_ROLE_KEY="<sb_secret_...>"   # The v2 secret key from Edge Functions
#   ./scripts/patch-cron-secrets.sh
#
# REQUIRES:
#   - Supabase CLI authenticated (`supabase login`)
#   - Supabase access token in system keychain (used by CLI)
#   - Project linked or SUPABASE_PROJECT_REF set
#
# RUN AFTER: `supabase db push`, `supabase db reset`, or any migration deploy.

set -euo pipefail

cd "$(dirname "$0")/.."

# ---------------------------------------------------------------------------
# Resolve secrets
# ---------------------------------------------------------------------------
if [ -z "${CRON_SECRET:-}" ]; then
  echo "Error: CRON_SECRET not set."
  echo "Usage: export CRON_SECRET=<secret> SERVICE_ROLE_KEY=<sb_secret_...> && $0"
  exit 1
fi

if [ -z "${SERVICE_ROLE_KEY:-}" ]; then
  echo "Error: SERVICE_ROLE_KEY not set."
  echo "This is the v2 secret key (sb_secret_...) that Edge Functions receive"
  echo "as SUPABASE_SERVICE_ROLE_KEY. Find it in the Supabase Dashboard under"
  echo "Project Settings > API > Project API keys > secret."
  exit 1
fi

# ---------------------------------------------------------------------------
# Resolve Supabase Management API token
# ---------------------------------------------------------------------------
SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-}"
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
  # Try keychain (macOS — where Supabase CLI stores it)
  SUPABASE_ACCESS_TOKEN=$(security find-generic-password -l "supabase" -w 2>/dev/null | sed 's/^go-keyring-base64://' | base64 -d 2>/dev/null || echo "")
fi
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
  echo "Error: Could not find Supabase access token."
  echo "Either set SUPABASE_ACCESS_TOKEN or run 'supabase login'."
  exit 1
fi

# ---------------------------------------------------------------------------
# Resolve project ref
# ---------------------------------------------------------------------------
PROJECT_REF="${SUPABASE_PROJECT_REF:-}"
if [ -z "$PROJECT_REF" ]; then
  PROJECT_REF=$(grep -r 'project_id' supabase/.temp/project-ref 2>/dev/null || echo "")
  if [ -z "$PROJECT_REF" ]; then
    # Parse from supabase link output
    PROJECT_REF=$(supabase projects list 2>&1 | grep '●' | awk '{print $3}' || echo "")
  fi
fi
if [ -z "$PROJECT_REF" ]; then
  echo "Error: Could not determine project ref. Set SUPABASE_PROJECT_REF."
  exit 1
fi

SUPABASE_URL="https://${PROJECT_REF}.supabase.co"
API="https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query"

echo "Project: $PROJECT_REF"
echo "URL:     $SUPABASE_URL"
echo ""

# ---------------------------------------------------------------------------
# Patch function
# ---------------------------------------------------------------------------
patch_job() {
  local name="$1" fn="$2" sched="$3" auth_header="$4" auth_value="$5"
  local cmd="SELECT net.http_post(url := '${SUPABASE_URL}/functions/v1/${fn}', headers := jsonb_build_object('Content-Type', 'application/json', '${auth_header}', '${auth_value}'), body := '{}'::jsonb, timeout_milliseconds := 25000);"
  local sql="SELECT cron.alter_job(job_id := (SELECT jobid FROM cron.job WHERE jobname = '${name}'), schedule := '${sched}', command := \$cmd\$${cmd}\$cmd\$)"

  result=$(curl -sf -X POST \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\": \"$(echo "$sql" | sed 's/"/\\"/g')\"}" \
    "$API" 2>&1)

  if echo "$result" | grep -q '"alter_job"'; then
    echo "  ✓ $name"
  else
    echo "  ✗ $name: $result"
    return 1
  fi
}

# ---------------------------------------------------------------------------
# Patch Bearer-auth jobs
# ---------------------------------------------------------------------------
echo "Patching Bearer-auth jobs (v2 secret key)..."
patch_job "process-processor-inbox-minute" "process-processor-inbox" "* * * * *"      "Authorization" "Bearer $SERVICE_ROLE_KEY"
patch_job "reconcile-checkout-ledger-5min" "reconcile-checkout-ledger" "*/5 * * * *"  "Authorization" "Bearer $SERVICE_ROLE_KEY"
patch_job "billing-overages-daily"         "bill-overages"            "0 7 * * *"     "Authorization" "Bearer $SERVICE_ROLE_KEY"
patch_job "ops-monitor-hourly"             "ops-monitor"              "0 * * * *"     "Authorization" "Bearer $SERVICE_ROLE_KEY"
patch_job "scheduled-payouts-daily"        "scheduled-payouts"        "0 6 * * *"     "Authorization" "Bearer $SERVICE_ROLE_KEY"

echo ""

# ---------------------------------------------------------------------------
# Patch x-cron-secret jobs
# ---------------------------------------------------------------------------
echo "Patching x-cron-secret jobs..."
patch_job "process-webhooks-minute" "process-webhooks" "* * * * *"     "x-cron-secret" "$CRON_SECRET"
patch_job "security-alerts-15min"   "security-alerts"  "*/15 * * * *"  "x-cron-secret" "$CRON_SECRET"

echo ""
echo "All 7 cron jobs patched."
echo ""
echo "Verify: wait ~60s, then run:"
echo "  SELECT j.jobname, d.status, d.start_time"
echo "  FROM cron.job_run_details d JOIN cron.job j ON d.jobid = j.jobid"
echo "  WHERE d.start_time > now() - interval '3 minutes'"
echo "  ORDER BY d.start_time DESC LIMIT 15;"
