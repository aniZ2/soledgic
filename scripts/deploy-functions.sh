#!/bin/bash
# Deploy all security-hardened Soledgic Edge Functions
# Run: chmod +x scripts/deploy-functions.sh && ./scripts/deploy-functions.sh

set -e

echo "=========================================="
echo "Deploying Security-Hardened Edge Functions"
echo "=========================================="
echo ""

cd "$(dirname "$0")/.."

# Core transaction functions
echo "[1/6] Deploying core transaction functions..."
supabase functions deploy record-sale --no-verify-jwt
supabase functions deploy record-expense --no-verify-jwt
supabase functions deploy record-income --no-verify-jwt
supabase functions deploy record-transfer --no-verify-jwt
supabase functions deploy reverse-transaction --no-verify-jwt

# Treasury resource functions
echo "[2/6] Deploying treasury resource functions..."
supabase functions deploy participants --no-verify-jwt
supabase functions deploy wallets --no-verify-jwt
supabase functions deploy transfers --no-verify-jwt
supabase functions deploy holds --no-verify-jwt
supabase functions deploy checkout-sessions --no-verify-jwt
supabase functions deploy payouts --no-verify-jwt
supabase functions deploy refunds --no-verify-jwt

# Query functions
echo "[3/6] Deploying query functions..."
supabase functions deploy get-transactions --no-verify-jwt

# Payout execution functions
echo "[4/6] Deploying payout execution functions..."
supabase functions deploy execute-payout --no-verify-jwt

# Reporting functions
echo "[5/6] Deploying reporting functions..."
supabase functions deploy trial-balance --no-verify-jwt
supabase functions deploy profit-loss --no-verify-jwt

# Management & Reconciliation
echo "[6/6] Deploying management functions..."
supabase functions deploy reconcile --no-verify-jwt
supabase functions deploy manage-splits --no-verify-jwt
supabase functions deploy create-ledger --no-verify-jwt
supabase functions deploy webhooks --no-verify-jwt

echo ""
echo "=========================================="
echo "✅ Deployment Complete!"
echo "=========================================="
echo ""
echo "Functions deployed with the resource-first treasury surface:"
echo ""
echo "Core Transactions:"
echo "  ✓ record-sale, record-expense, record-income"
echo "  ✓ record-transfer, reverse-transaction"
echo ""
echo "Treasury Resources:"
echo "  ✓ participants, wallets, transfers"
echo "  ✓ holds, checkout-sessions, payouts, refunds"
echo ""
echo "Queries & Payout Execution:"
echo "  ✓ get-transactions, execute-payout"
echo ""
echo "Reports & Management:"
echo "  ✓ trial-balance, profit-loss"
echo "  ✓ reconcile, manage-splits, create-ledger"
echo ""
echo "Integrations:"
echo "  ✓ webhook handlers"
echo ""
echo "Run tests: cd test-data && ./test-api.sh"
