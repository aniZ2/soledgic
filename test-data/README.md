# Test Data Directory
# ====================

This directory contains test data and scripts for Soledgic development.

## Contents

- `api-keys.env` - Test API keys (DO NOT commit to public repos)
- `test-api.sh` - Bash script to test API endpoints

## Usage

```bash
# Make the test script executable
chmod +x test-api.sh

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
- The plaintext key in `api-keys.env` is the ONLY copy
- Never commit this file to a public repository
- Add to `.gitignore`:
  ```
  test-data/api-keys.env
  ```
