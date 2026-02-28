#!/bin/bash
# Soledgic API Test Scripts
# ==========================

# Load API key
ENV_FILE="$(dirname "$0")/api-keys.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE"
  echo "Create it from test-data/api-keys.env.example and set local test keys."
  exit 1
fi
source "$ENV_FILE"

BASE_URL="$SOLEDGIC_API_URL"
API_KEY="$SOLEDGIC_API_KEY"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Soledgic API Tests"
echo "=========================================="
echo ""

# Test 1: Get Balance
echo -e "${YELLOW}Test 1: Get All Balances${NC}"
curl -s -X GET "$BASE_URL/get-balance" \
  -H "x-api-key: $API_KEY" | jq .
echo ""

# Test 2: Get Single Creator Balance
echo -e "${YELLOW}Test 2: Get Single Creator Balance${NC}"
curl -s -X GET "$BASE_URL/get-balance?creator_id=test_creator" \
  -H "x-api-key: $API_KEY" | jq .
echo ""

# Test 3: Record Sale
SALE_REF="test_sale_$(date +%s)"
echo -e "${YELLOW}Test 3: Record Sale (ref: $SALE_REF)${NC}"
curl -s -X POST "$BASE_URL/record-sale" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"reference_id\": \"$SALE_REF\",
    \"creator_id\": \"test_creator\",
    \"amount\": 1999,
    \"product_name\": \"Test Product\"
  }" | jq .
echo ""

# Test 4: Get Transactions
echo -e "${YELLOW}Test 4: Get Recent Transactions${NC}"
curl -s -X GET "$BASE_URL/get-transactions?per_page=5" \
  -H "x-api-key: $API_KEY" | jq .
echo ""

# Test 5: Invalid API Key (should fail)
echo -e "${YELLOW}Test 5: Invalid API Key (should fail)${NC}"
curl -s -X GET "$BASE_URL/get-balance" \
  -H "x-api-key: invalid_key" | jq .
echo ""

echo "=========================================="
echo "Tests Complete"
echo "=========================================="
