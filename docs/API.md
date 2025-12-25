# Soledgic API Documentation

**Soledgic** - Double-Entry Accounting for Creator Platforms

## Overview

Soledgic provides a complete accounting backend for platforms that need to:
- Track revenue splits between platform and creators
- Manage creator balances and payouts
- Handle refunds with configurable policies
- Maintain an immutable audit trail

## Authentication

All API calls require an API key passed in the `x-api-key` header:

```bash
curl -X POST https://your-project.supabase.co/functions/v1/record-sale \
  -H "x-api-key: your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{"creator_id": "123", "amount": 1999, "reference_id": "sale_abc"}'
```

---

## Endpoints

### Record Sale

Records a new sale with automatic revenue split.

**POST** `/functions/v1/record-sale`

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `reference_id` | string | Yes | Your external sale ID (Stripe payment_intent, etc.) |
| `creator_id` | string | Yes | The creator receiving funds |
| `amount` | number | Yes | Sale amount **in cents** |
| `currency` | string | No | Default: "USD" |
| `platform_fee_percent` | number | No | Override default fee (e.g., 20 for 20%) |
| `description` | string | No | Sale description |
| `metadata` | object | No | Additional data to store |

#### Response

```json
{
  "success": true,
  "transaction_id": "uuid",
  "breakdown": {
    "total": 19.99,
    "creator_amount": 15.99,
    "platform_amount": 4.00
  }
}
```

---

### Get Balance

Returns balance for a creator or all creators.

**GET** `/functions/v1/get-balance`

#### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `creator_id` | string | Get single creator balance |
| `include_platform` | boolean | Include platform summary |

#### Response (Single Creator)

```json
{
  "success": true,
  "balance": {
    "creator_id": "123",
    "available": 150.00,
    "pending": 25.00,
    "total_earned": 500.00,
    "total_paid_out": 325.00,
    "currency": "USD"
  }
}
```

#### Response (All Creators)

```json
{
  "success": true,
  "balances": [
    {"creator_id": "123", "available": 150.00, "pending": 0, "currency": "USD"},
    {"creator_id": "456", "available": 75.50, "pending": 0, "currency": "USD"}
  ],
  "platform_summary": {
    "total_revenue": 500.00,
    "total_owed_creators": 225.50,
    "total_paid_out": 1000.00,
    "cash_balance": 2500.00
  }
}
```

---

### Process Payout

Initiates a payout to a creator.

**POST** `/functions/v1/process-payout`

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `creator_id` | string | Yes | Creator to pay |
| `payment_method` | string | Yes | `stripe`, `paypal`, `bank_transfer`, `manual` |
| `amount` | number | No | Amount in cents (defaults to full balance) |
| `payment_reference` | string | No | External payment ID |
| `description` | string | No | Payout description |

#### Response

```json
{
  "success": true,
  "payout_id": "uuid",
  "transaction_id": "uuid",
  "amount": 150.00,
  "status": "pending"
}
```

---

### Record Refund

Records a refund and adjusts balances.

**POST** `/functions/v1/record-refund`

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `original_sale_reference` | string | Yes | Reference ID of the original sale |
| `reason` | string | Yes | Refund reason |
| `amount` | number | No | Amount in cents (defaults to full sale) |
| `refund_from` | string | No | `both`, `platform_only`, `creator_only` |
| `external_refund_id` | string | No | Your refund ID |

#### Response

```json
{
  "success": true,
  "transaction_id": "uuid",
  "refunded_amount": 19.99,
  "breakdown": {
    "from_creator": 15.99,
    "from_platform": 4.00
  }
}
```

---

### Reverse Transaction

Creates a reversal for any transaction (immutable ledger pattern).

**POST** `/functions/v1/reverse-transaction`

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `transaction_id` | string | Yes | Transaction UUID to reverse |
| `reason` | string | Yes | Reason for reversal |
| `partial_amount` | number | No | Partial reversal amount in cents |

#### Response

```json
{
  "success": true,
  "reversal_id": "uuid",
  "original_transaction_id": "uuid",
  "reversed_amount": 19.99
}
```

---

### Get Transactions

Returns transaction history with filtering.

**GET** `/functions/v1/get-transactions`

#### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `creator_id` | string | Filter by creator |
| `type` | string | `sale`, `payout`, `refund`, `reversal`, etc. |
| `status` | string | `pending`, `completed`, `failed`, `reversed` |
| `start_date` | string | ISO date string |
| `end_date` | string | ISO date string |
| `page` | number | Page number (default: 1) |
| `per_page` | number | Results per page (max: 100) |
| `include_entries` | boolean | Include entry details (default: true) |

#### Response

```json
{
  "success": true,
  "transactions": [
    {
      "id": "uuid",
      "transaction_type": "sale",
      "reference_id": "stripe_pi_xxx",
      "amount": 19.99,
      "status": "completed",
      "created_at": "2025-12-18T10:00:00Z",
      "entries": [...]
    }
  ],
  "pagination": {
    "total": 150,
    "page": 1,
    "per_page": 50,
    "total_pages": 3
  }
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": "Error message here"
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (invalid API key) |
| 403 | Forbidden (ledger suspended) |
| 404 | Not Found |
| 409 | Conflict (duplicate, already reversed) |
| 500 | Internal Server Error |

---

## Webhooks (Coming Soon)

Configure webhooks to receive real-time notifications for:
- `sale.recorded`
- `payout.initiated`
- `payout.completed`
- `refund.processed`
- `balance.threshold` (low balance alerts)

---

## SDK Installation

### JavaScript/TypeScript

```bash
npm install @soledgic/sdk
```

```typescript
import { Soledgic } from '@soledgic/sdk'

const soledgic = new Soledgic('your_api_key')

// Record a sale
const sale = await soledgic.recordSale({
  creatorId: 'author_123',
  amount: 1999,
  referenceId: 'stripe_pi_xxx'
})

// Get creator balance
const balance = await soledgic.getBalance('author_123')
```

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| All endpoints | 1000 requests/minute |
| `record-sale` | 100 requests/second |

---

## Support

- Documentation: https://docs.soledgic.com
- API Status: https://status.soledgic.com
- Email: support@soledgic.com
