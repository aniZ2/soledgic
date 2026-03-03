#!/bin/bash
# Pre-deploy environment validation
# Usage: bash scripts/validate-env.sh
#
# Checks that all required environment variables are set for production.
# Run this before deploying to catch missing configuration.

set -euo pipefail

ERRORS=0
WARNINGS=0

check_var() {
  local name=$1
  local required=$2
  local value="${!name:-}"

  if [ -z "$value" ] && [ "$required" = "yes" ]; then
    echo "  ERROR: $name is not set"
    ERRORS=$((ERRORS + 1))
  elif [ -z "$value" ]; then
    echo "  WARN:  $name is not set (optional)"
    WARNINGS=$((WARNINGS + 1))
  else
    echo "  OK:    $name is set"
  fi
}

echo "============================================"
echo "  Soledgic Environment Validation"
echo "============================================"
echo ""

echo "--- Payment Processor (Finix) ---"
check_var PROCESSOR_BASE_URL yes
check_var PROCESSOR_USERNAME yes
check_var PROCESSOR_PASSWORD yes
check_var PROCESSOR_MERCHANT_ID yes
check_var PROCESSOR_NAME yes
check_var PROCESSOR_ENV yes
check_var PROCESSOR_PAYOUT_SOURCE_ID yes
check_var PROCESSOR_API_VERSION no
check_var PROCESSOR_VERSION_HEADER no
echo ""

echo "--- Webhook Auth ---"
check_var PROCESSOR_WEBHOOK_SIGNING_KEY no
check_var PROCESSOR_WEBHOOK_TOKEN no
# At least one of signing key or token must be set
SIGNING_KEY="${PROCESSOR_WEBHOOK_SIGNING_KEY:-}"
TOKEN="${PROCESSOR_WEBHOOK_TOKEN:-}"
if [ -z "$SIGNING_KEY" ] && [ -z "$TOKEN" ]; then
  echo "  ERROR: At least one of PROCESSOR_WEBHOOK_SIGNING_KEY or PROCESSOR_WEBHOOK_TOKEN must be set"
  ERRORS=$((ERRORS + 1))
fi
echo ""

echo "--- Email ---"
check_var RESEND_API_KEY yes
check_var FROM_EMAIL yes
echo ""

echo "--- Scheduling ---"
check_var CRON_SECRET yes
echo ""

echo "--- Safety Checks ---"

# Check for sandbox in production
PROC_ENV="${PROCESSOR_ENV:-sandbox}"
PROC_URL="${PROCESSOR_BASE_URL:-}"
PROC_NAME="${PROCESSOR_NAME:-}"

if [ "$PROC_ENV" = "production" ] || [ "$PROC_ENV" = "prod" ]; then
  if echo "$PROC_URL" | grep -qi "sandbox"; then
    echo "  ERROR: PROCESSOR_ENV=production but PROCESSOR_BASE_URL contains 'sandbox'"
    ERRORS=$((ERRORS + 1))
  else
    echo "  OK:    No sandbox/production URL mismatch"
  fi

  if [ "$PROC_NAME" = "DUMMY_V1" ] || [ -z "$PROC_NAME" ]; then
    echo "  ERROR: PROCESSOR_NAME cannot be DUMMY_V1 or empty in production"
    ERRORS=$((ERRORS + 1))
  else
    echo "  OK:    PROCESSOR_NAME is set for production"
  fi
else
  echo "  INFO:  PROCESSOR_ENV=$PROC_ENV (not production)"
fi

echo ""
echo "============================================"
if [ $ERRORS -gt 0 ]; then
  echo "  FAILED: $ERRORS error(s), $WARNINGS warning(s)"
  echo "============================================"
  exit 1
else
  echo "  PASSED: 0 errors, $WARNINGS warning(s)"
  echo "============================================"
  exit 0
fi
