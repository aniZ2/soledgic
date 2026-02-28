# Test Data Directory
# ====================

This directory contains test data and scripts for Soledgic development.

## Contents

- `api-keys.env.example` - Template for local test API keys
- `test-api.sh` - Bash script to test API endpoints

## Usage

```bash
# Make the test script executable
chmod +x test-api.sh

# Create local key file (untracked)
cp api-keys.env.example api-keys.env

# Run all tests
./test-api.sh

# Or run individual tests
source api-keys.env
curl -X GET "$SOLEDGIC_API_URL/get-balance" -H "x-api-key: $SOLEDGIC_API_KEY"
```

## Test Ledger

- **Name:** Booklyverse
- **ID:** 0a885204-e07a-48c1-97e9-495ac96a2581
- **Mode:** Marketplace (80/20 split)
- **Status:** Active

## Test Creators

| Creator ID | Balance |
|------------|---------|
| test_creator | $30.00 |
| author_123 | $20.75 |
| creator_stress_test | $1,303.20 |

## Security Notes

- API keys are hashed (SHA-256) before storage
- Keep plaintext keys only in your local `api-keys.env` (untracked)
- Never commit `api-keys.env` to any repository
