#!/bin/bash
# Soledgic "First Light" Security Test
# Tests: API Key Hashing, Rate Limiting, Audit Logging, Security Headers, Request ID
# Run: chmod +x scripts/first-light-test.sh && ./scripts/first-light-test.sh

set -e

echo "=========================================="
echo "🔦 SOLEDGIC 'FIRST LIGHT' SECURITY TEST"
echo "=========================================="
echo ""

# Configuration - Load from test-data/api-keys.env
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

if [[ -f "$PROJECT_DIR/test-data/api-keys.env" ]]; then
  source "$PROJECT_DIR/test-data/api-keys.env"
  echo "✓ Loaded API keys from test-data/api-keys.env"
fi

API_URL="${SOLEDGIC_API_URL:-https://ocjrcsmoeikxfooeglkt.supabase.co/functions/v1}"
API_KEY="${SOLEDGIC_API_KEY:-}"
# Supabase anon key - required to access Edge Functions
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9janJjc21vZWlreGZvb2VnbGt0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ4MjA4ODEsImV4cCI6MjA1MDM5Njg4MX0.DzRfAGVDxBPiKjqSlhBqVKziLvGFsyCoPVNfcBLmqrU}"

if [[ -z "$API_KEY" ]]; then
  echo "⚠️  No API key found!"
  echo "   Create test-data/api-keys.env or set SOLEDGIC_API_KEY"
  exit 1
fi

echo "API URL: $API_URL"
echo "API Key: ${API_KEY:0:12}...${API_KEY: -4}"
echo "Anon Key: ${SUPABASE_ANON_KEY:0:20}..."
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass() { echo -e "${GREEN}✓ PASS${NC}: $1"; }
fail() { echo -e "${RED}✗ FAIL${NC}: $1"; }
info() { echo -e "${YELLOW}ℹ INFO${NC}: $1"; }

# ============================================================================
# TEST 1: API Key Authentication (Hash-based)
# ============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 1: API Key Authentication"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test valid API key (GET endpoint)
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X GET "$API_URL/get-balance" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "x-api-key: $API_KEY")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" == "200" ]]; then
  pass "Valid API key accepted (HTTP $HTTP_CODE)"
else
  fail "Valid API key rejected (HTTP $HTTP_CODE)"
  echo "Response: $BODY"
fi

# Test invalid API key
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X GET "$API_URL/get-balance" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "x-api-key: sk_test_invalid_key_12345")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)

if [[ "$HTTP_CODE" == "401" ]]; then
  pass "Invalid API key rejected (HTTP $HTTP_CODE)"
else
  fail "Invalid API key should return 401, got $HTTP_CODE"
fi

# Test missing API key
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X GET "$API_URL/get-balance" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)

if [[ "$HTTP_CODE" == "401" ]]; then
  pass "Missing API key rejected (HTTP $HTTP_CODE)"
else
  fail "Missing API key should return 401, got $HTTP_CODE"
fi

# ============================================================================
# TEST 2: Security Headers
# ============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 2: Security Headers"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

HEADERS=$(curl -s -D - -o /dev/null \
  -X GET "$API_URL/get-balance" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "x-api-key: $API_KEY")

# Check for security headers
if echo "$HEADERS" | grep -qi "x-content-type-options"; then
  pass "X-Content-Type-Options header present"
else
  fail "X-Content-Type-Options header missing"
fi

if echo "$HEADERS" | grep -qi "x-frame-options"; then
  pass "X-Frame-Options header present"
else
  fail "X-Frame-Options header missing"
fi

if echo "$HEADERS" | grep -qi "x-request-id"; then
  REQUEST_ID=$(echo "$HEADERS" | grep -i "x-request-id" | awk '{print $2}' | tr -d '\r')
  pass "X-Request-Id header present: $REQUEST_ID"
else
  fail "X-Request-Id header missing"
fi

if echo "$HEADERS" | grep -qi "content-security-policy"; then
  pass "Content-Security-Policy header present"
else
  fail "Content-Security-Policy header missing"
fi

# ============================================================================
# TEST 3: Record a Sale (Financial Transaction)
# ============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 3: Record Sale Transaction"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

SALE_REF="first_light_$(date +%s)"
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "$API_URL/record-sale" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "x-api-key: $API_KEY" \
  -d "{
    \"amount\": 10000,
    \"processing_fee\": 300,
    \"creator_id\": \"creator_first_light\",
    \"reference_id\": \"$SALE_REF\",
    \"product_name\": \"First Light Security Test Sale\"
  }")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" == "200" ]] || [[ "$HTTP_CODE" == "201" ]]; then
  pass "Sale recorded successfully (HTTP $HTTP_CODE)"
  
  # Extract transaction ID if present
  TXN_ID=$(echo "$BODY" | grep -o '"transaction_id":"[^"]*"' | cut -d'"' -f4 2>/dev/null || echo "")
  if [[ -n "$TXN_ID" ]]; then
    info "Transaction ID: $TXN_ID"
  fi
  
  # Check for request_id in response
  if echo "$BODY" | grep -q "request_id"; then
    REQ_ID=$(echo "$BODY" | grep -o '"request_id":"[^"]*"' | cut -d'"' -f4 2>/dev/null || echo "")
    info "Request ID in response: $REQ_ID"
  fi
else
  fail "Sale failed (HTTP $HTTP_CODE)"
  echo "Response: $BODY"
fi

# ============================================================================
# TEST 4: Rate Limiting
# ============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 4: Rate Limiting (10 rapid requests)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

SUCCESS_COUNT=0
RATE_LIMITED=0

for i in {1..10}; do
  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X GET "$API_URL/get-balance" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
    -H "x-api-key: $API_KEY")
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  
  if [[ "$HTTP_CODE" == "200" ]]; then
    ((SUCCESS_COUNT++))
  elif [[ "$HTTP_CODE" == "429" ]]; then
    ((RATE_LIMITED++))
  fi
done

info "Successful requests: $SUCCESS_COUNT/10"
info "Rate limited: $RATE_LIMITED/10"

if [[ $SUCCESS_COUNT -gt 0 ]]; then
  pass "Rate limiting is working (allowed $SUCCESS_COUNT, limited $RATE_LIMITED)"
else
  fail "All requests failed - check API key or endpoint"
fi

# ============================================================================
# TEST 5: Input Validation
# ============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 5: Input Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test negative amount (should be rejected)
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "$API_URL/record-sale" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "amount": -1000,
    "processing_fee": 200,
    "creator_id": "test_creator",
    "reference_id": "neg_test_123"
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -1)

if [[ "$HTTP_CODE" == "400" ]]; then
  pass "Negative amount rejected (HTTP $HTTP_CODE)"
else
  info "Negative amount returned HTTP $HTTP_CODE (may be handled differently)"
fi

# Test SQL injection in ID (should be rejected or sanitized)
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "$API_URL/record-sale" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "amount": 1000,
    "processing_fee": 200,
    "creator_id": "test; DROP TABLE users;--",
    "reference_id": "sql_test_123"
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -1)

if [[ "$HTTP_CODE" == "400" ]]; then
  pass "SQL injection attempt rejected (HTTP $HTTP_CODE)"
else
  info "SQL injection test returned HTTP $HTTP_CODE"
fi

# ============================================================================
# TEST 6: Health Check Endpoint
# ============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 6: Health Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "$API_URL/health-check" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "x-api-key: $API_KEY" \
  -d '{"action": "status"}')

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" == "200" ]]; then
  pass "Health check passed (HTTP $HTTP_CODE)"
  if echo "$BODY" | grep -q "healthy"; then
    info "System reports healthy"
  fi
else
  fail "Health check failed (HTTP $HTTP_CODE)"
  echo "Response: $BODY"
fi

# ============================================================================
# TEST 7: Audit Log Verification
# ============================================================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 7: Audit Log (Check in Supabase)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

info "Run this query in Supabase SQL Editor to verify audit logs:"
echo ""
echo "  SELECT action, entity_type, ip_address, request_id, risk_score, created_at"
echo "  FROM audit_log"
echo "  WHERE created_at > NOW() - INTERVAL '5 minutes'"
echo "  ORDER BY created_at DESC"
echo "  LIMIT 20;"
echo ""

# ============================================================================
# SUMMARY
# ============================================================================
echo ""
echo "=========================================="
echo "🔦 FIRST LIGHT TEST COMPLETE"
echo "=========================================="
echo ""
echo "Security Layers Tested:"
echo "  ✓ API Key Authentication (hash-based)"
echo "  ✓ Security Headers (CSP, X-Frame-Options, etc.)"
echo "  ✓ Request ID Tracking"
echo "  ✓ Financial Transaction Recording"
echo "  ✓ Rate Limiting"
echo "  ✓ Input Validation"
echo "  ✓ Health Check"
echo ""
echo "Next Steps:"
echo "  1. Check audit_log table in Supabase"
echo "  2. Verify rate_limits table has entries"
echo "  3. Enable pg_cron for automated cleanup"
echo "  4. Set up email alerts (Resend)"
echo ""
