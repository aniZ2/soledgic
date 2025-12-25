#!/bin/bash
# Deploy all security-hardened Soledgic Edge Functions
# Run: chmod +x scripts/deploy-functions.sh && ./scripts/deploy-functions.sh

set -e

echo "=========================================="
echo "Deploying Security-Hardened Edge Functions"
echo "=========================================="
echo ""

cd /Users/osifo/Desktop/soledgic

# Core transaction functions
echo "[1/6] Deploying core transaction functions..."
supabase functions deploy record-sale --no-verify-jwt
supabase functions deploy record-refund --no-verify-jwt
supabase functions deploy record-expense --no-verify-jwt
supabase functions deploy record-income --no-verify-jwt
supabase functions deploy record-transfer --no-verify-jwt
supabase functions deploy reverse-transaction --no-verify-jwt

# Query functions
echo "[2/6] Deploying query functions..."
supabase functions deploy get-balance --no-verify-jwt
supabase functions deploy get-transactions --no-verify-jwt

# Payout functions
echo "[3/6] Deploying payout functions..."
supabase functions deploy process-payout --no-verify-jwt
supabase functions deploy execute-payout --no-verify-jwt

# Reporting functions
echo "[4/6] Deploying reporting functions..."
supabase functions deploy trial-balance --no-verify-jwt
supabase functions deploy profit-loss --no-verify-jwt

# Management & Reconciliation
echo "[5/6] Deploying management functions..."
supabase functions deploy reconcile --no-verify-jwt
supabase functions deploy manage-splits --no-verify-jwt
supabase functions deploy create-ledger --no-verify-jwt

# Integration functions
echo "[6/6] Deploying integration functions..."
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy plaid --no-verify-jwt
supabase functions deploy webhooks --no-verify-jwt

echo ""
echo "=========================================="
echo "✅ Deployment Complete!"
echo "=========================================="
echo ""
echo "18 functions deployed with security hardening:"
echo ""
echo "Core Transactions:"
echo "  ✓ record-sale, record-refund, record-expense"
echo "  ✓ record-income, record-transfer, reverse-transaction"
echo ""
echo "Queries:"
echo "  ✓ get-balance, get-transactions"
echo ""
echo "Payouts:"
echo "  ✓ process-payout, execute-payout"
echo ""
echo "Reports:"
echo "  ✓ trial-balance, profit-loss"
echo ""
echo "Management:"
echo "  ✓ reconcile, manage-splits, create-ledger"
echo ""
echo "Integrations:"
echo "  ✓ stripe-webhook, plaid, webhooks"
echo ""
echo "Run tests: cd test-data && ./test-api.sh"
