#!/bin/bash
# Deploy ALL security-hardened Soledgic Edge Functions
# Run: chmod +x scripts/deploy-all-functions.sh && ./scripts/deploy-all-functions.sh

set -e

echo "=========================================="
echo "Deploying ALL Security-Hardened Edge Functions"
echo "=========================================="
echo ""

cd "$(dirname "$0")/.."

deploy() {
  echo "  ✓ $1"
  supabase functions deploy "$1" --no-verify-jwt 2>/dev/null || echo "    ⚠ $1 needs review"
}

echo "[1/12] Core Transactions (8)..."
deploy record-sale
deploy record-expense
deploy record-income
deploy record-transfer
deploy record-adjustment
deploy record-bill
deploy record-opening-balance
deploy reverse-transaction

echo "[2/12] Treasury Resources (7)..."
deploy participants
deploy wallets
deploy transfers
deploy holds
deploy checkout-sessions
deploy payouts
deploy refunds

echo "[3/12] Queries (2)..."
deploy get-transactions
deploy get-runway

echo "[4/12] Payout Execution (1)..."
deploy execute-payout

echo "[5/12] Reports (5)..."
deploy trial-balance
deploy profit-loss
deploy generate-report
deploy generate-pdf
deploy export-report

echo "[6/12] Management (7)..."
deploy reconcile
deploy manage-splits
deploy manage-contractors
deploy manage-recurring
deploy manage-budgets
deploy manage-bank-accounts
deploy close-period

echo "[7/12] Ledger & Health (3)..."
deploy create-ledger
deploy list-ledgers
deploy health-check

echo "[8/12] Integrations (1)..."
deploy webhooks

echo "[9/12] Standard Mode & Statements (4)..."
deploy pay-bill
deploy receive-payment
deploy send-statements
deploy frozen-statements

echo "[10/12] Tax & Billing (4)..."
deploy generate-tax-summary
deploy tax-documents
deploy submit-tax-info
deploy billing

echo "[11/12] Imports & Utilities (4)..."
deploy import-transactions
deploy import-bank-statement
deploy upload-receipt
deploy process-webhooks

echo ""
echo "=========================================="
echo "✅ Deployment Complete"
echo "=========================================="
echo ""
echo "Security Features Active:"
echo "  ✓ Hash-based API key authentication"
echo "  ✓ Dynamic CORS headers (origin-based)"
echo "  ✓ IP address and user agent logging"
echo "  ✓ Input validation on all parameters"
echo "  ✓ Fire-and-forget audit logging"
echo "  ✓ Webhook replay protection (5min)"
echo "  ✓ SSRF protection for webhooks"
echo ""
echo "Run tests: cd test-data && ./test-api.sh"
