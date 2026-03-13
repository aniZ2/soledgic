#!/usr/bin/env tsx
/**
 * OpenAPI 3.1 Spec Generator
 *
 * Reads the API endpoint catalog and SDK types to produce docs/openapi.yaml.
 * Run: npm run generate:openapi
 */

import { stringify } from 'yaml'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { API_ENDPOINT_CATALOG, type ApiParameter } from '../apps/web/src/app/(marketing)/docs/api/catalog'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// 1. Filter catalog to public API-key endpoints
// ---------------------------------------------------------------------------

const publicEndpoints = API_ENDPOINT_CATALOG.filter(
  (ep) => ep.auth === 'API key' && !ep.internal && !ep.deprecated,
)

// ---------------------------------------------------------------------------
// 2. JSON Schema definitions (snake_case wire format)
// ---------------------------------------------------------------------------

const SCHEMAS: Record<string, object> = {
  // ── Common envelopes ──────────────────────────────────────────────────
  SuccessEnvelope: {
    type: 'object',
    properties: {
      success: { type: 'boolean', const: true },
      request_id: { type: 'string', description: 'Unique request identifier', examples: ['req_abc123'] },
    },
    required: ['success', 'request_id'],
  },
  ErrorEnvelope: {
    type: 'object',
    properties: {
      success: { type: 'boolean', const: false },
      error: { type: 'string' },
      error_code: { type: 'string' },
      request_id: { type: 'string' },
    },
    required: ['success', 'error', 'request_id'],
  },
  RateLimitError: {
    type: 'object',
    properties: {
      success: { type: 'boolean', const: false },
      error: { type: 'string' },
      request_id: { type: 'string' },
      retry_after: { type: 'integer', description: 'Seconds until rate limit resets', examples: [60] },
    },
    required: ['success', 'error', 'request_id', 'retry_after'],
  },

  // ── Request types ─────────────────────────────────────────────────────
  RecordSaleRequest: {
    type: 'object',
    properties: {
      reference_id: { type: 'string', description: 'Your external sale ID (order ID, payment ID, etc.)' },
      creator_id: { type: 'string', description: 'The creator receiving funds' },
      amount: { type: 'integer', description: 'Sale amount in cents' },
      currency: { type: 'string', description: 'Currency code (default: USD)', default: 'USD' },
      description: { type: 'string', description: 'Sale description' },
      reference_type: { type: 'string', description: "Reference type (e.g., 'processor_payment', 'manual')" },
      processing_fee: { type: 'integer', description: 'Processing fee in cents' },
      processing_fee_paid_by: { type: 'string', enum: ['platform', 'creator', 'split'] },
      product_id: { type: 'string' },
      product_name: { type: 'string' },
      creator_percent: { type: 'number', description: 'Override revenue split percentage (0-100)' },
      skip_withholding: { type: 'boolean', description: 'Skip tax withholding for this sale' },
      metadata: { type: 'object', additionalProperties: true },
    },
    required: ['reference_id', 'creator_id', 'amount'],
  },

  CreateCheckoutRequest: {
    type: 'object',
    properties: {
      amount: { type: 'integer', description: 'Amount in cents' },
      creator_id: { type: 'string', description: 'Creator receiving funds' },
      currency: { type: 'string', default: 'USD' },
      product_id: { type: 'string' },
      product_name: { type: 'string' },
      customer_email: { type: 'string', format: 'email' },
      customer_id: { type: 'string' },
      payment_method_id: { type: 'string', description: 'Payment instrument ID for direct charge. When omitted, creates a hosted checkout session.' },
      source_id: { type: 'string', description: 'Backward-compat alias for payment_method_id' },
      idempotency_key: { type: 'string', description: 'Required for direct charges, optional for session mode' },
      success_url: { type: 'string', format: 'uri', description: 'Redirect URL after successful payment (required for session mode)' },
      cancel_url: { type: 'string', format: 'uri', description: 'Redirect URL if buyer cancels (session mode)' },
      metadata: { type: 'object', additionalProperties: { type: 'string' } },
    },
    required: ['amount', 'creator_id'],
  },

  ProcessPayoutRequest: {
    type: 'object',
    properties: {
      reference_id: { type: 'string', description: 'Unique reference ID for this payout' },
      creator_id: { type: 'string', description: 'Creator to pay' },
      amount: { type: 'integer', description: 'Amount in cents' },
      reference_type: { type: 'string' },
      description: { type: 'string' },
      payout_method: { type: 'string' },
      fees: { type: 'integer', description: 'Fees in cents' },
      fees_paid_by: { type: 'string', enum: ['platform', 'creator'] },
      metadata: { type: 'object', additionalProperties: true },
    },
    required: ['reference_id', 'creator_id', 'amount'],
  },

  RecordRefundRequest: {
    type: 'object',
    properties: {
      original_sale_reference: { type: 'string', description: 'Reference ID of the original sale' },
      reason: { type: 'string', description: 'Refund reason (required for audit)' },
      amount: { type: 'integer', description: 'Amount in cents (defaults to full sale amount)' },
      refund_from: { type: 'string', enum: ['both', 'platform_only', 'creator_only'] },
      external_refund_id: { type: 'string' },
      idempotency_key: { type: 'string' },
      mode: { type: 'string', enum: ['ledger_only', 'processor_refund'], default: 'ledger_only' },
      processor_payment_id: { type: 'string' },
      metadata: { type: 'object', additionalProperties: true },
    },
    required: ['original_sale_reference', 'reason'],
  },

  ReverseTransactionRequest: {
    type: 'object',
    properties: {
      transaction_id: { type: 'string', format: 'uuid', description: 'Transaction UUID to reverse' },
      reason: { type: 'string', description: 'Reason for reversal (required for audit)' },
      partial_amount: { type: 'integer', description: 'Partial reversal amount in cents' },
      metadata: { type: 'object', additionalProperties: true },
    },
    required: ['transaction_id', 'reason'],
  },

  GetTransactionsRequest: {
    type: 'object',
    description: 'Query parameters for listing transactions',
    properties: {
      creator_id: { type: 'string' },
      type: { type: 'string', enum: ['sale', 'payout', 'refund', 'reversal', 'fee', 'adjustment', 'transfer'] },
      status: { type: 'string', enum: ['pending', 'completed', 'failed', 'reversed'] },
      start_date: { type: 'string', format: 'date', description: 'ISO date string' },
      end_date: { type: 'string', format: 'date' },
      page: { type: 'integer', minimum: 1 },
      per_page: { type: 'integer', minimum: 1, maximum: 100 },
      include_entries: { type: 'boolean' },
    },
  },

  CreateCreatorRequest: {
    type: 'object',
    properties: {
      creator_id: { type: 'string', description: 'Unique creator identifier' },
      display_name: { type: 'string' },
      email: { type: 'string', format: 'email' },
      default_split_percent: { type: 'number', minimum: 0, maximum: 100 },
      tax_info: {
        type: 'object',
        properties: {
          tax_id_type: { type: 'string', enum: ['ssn', 'ein', 'itin'] },
          tax_id_last4: { type: 'string' },
          legal_name: { type: 'string' },
          business_type: { type: 'string', enum: ['individual', 'sole_proprietor', 'llc', 'corporation', 'partnership'] },
          address: {
            type: 'object',
            properties: {
              line1: { type: 'string' },
              line2: { type: 'string' },
              city: { type: 'string' },
              state: { type: 'string' },
              postal_code: { type: 'string' },
              country: { type: 'string' },
            },
          },
        },
      },
      payout_preferences: {
        type: 'object',
        properties: {
          schedule: { type: 'string', enum: ['manual', 'weekly', 'biweekly', 'monthly'] },
          minimum_amount: { type: 'integer' },
          method: { type: 'string', enum: ['card', 'manual'] },
        },
      },
      metadata: { type: 'object', additionalProperties: true },
    },
    required: ['creator_id'],
  },

  RecordAdjustmentRequest: {
    type: 'object',
    properties: {
      adjustment_type: {
        type: 'string',
        enum: ['correction', 'reclassification', 'accrual', 'deferral', 'depreciation', 'write_off', 'year_end', 'opening_balance', 'other'],
      },
      entries: {
        type: 'array',
        minItems: 2,
        description: 'Journal entries (must balance)',
        items: {
          type: 'object',
          properties: {
            account_type: { type: 'string' },
            entity_id: { type: 'string' },
            entry_type: { type: 'string', enum: ['debit', 'credit'] },
            amount: { type: 'integer' },
          },
          required: ['account_type', 'entry_type', 'amount'],
        },
      },
      reason: { type: 'string', description: 'Reason for adjustment (required for audit)' },
      adjustment_date: { type: 'string', format: 'date', description: 'YYYY-MM-DD' },
      original_transaction_id: { type: 'string', format: 'uuid' },
      supporting_documentation: { type: 'string' },
      prepared_by: { type: 'string' },
    },
    required: ['adjustment_type', 'entries', 'reason', 'prepared_by'],
  },

  RecordOpeningBalanceRequest: {
    type: 'object',
    properties: {
      as_of_date: { type: 'string', format: 'date', description: 'YYYY-MM-DD' },
      source: { type: 'string', enum: ['manual', 'imported', 'migrated', 'year_start'] },
      source_description: { type: 'string' },
      balances: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            account_type: { type: 'string' },
            entity_id: { type: 'string' },
            balance: { type: 'integer' },
          },
          required: ['account_type', 'balance'],
        },
      },
    },
    required: ['as_of_date', 'source', 'balances'],
  },

  RecordTransferRequest: {
    type: 'object',
    properties: {
      from_account_type: { type: 'string' },
      to_account_type: { type: 'string' },
      amount: { type: 'integer', description: 'Amount in cents' },
      transfer_type: {
        type: 'string',
        enum: ['tax_reserve', 'payout_reserve', 'owner_draw', 'owner_contribution', 'operating', 'savings', 'investment', 'other'],
      },
      description: { type: 'string' },
      reference_id: { type: 'string' },
    },
    required: ['from_account_type', 'to_account_type', 'amount', 'transfer_type'],
  },

  RiskEvaluationRequest: {
    type: 'object',
    properties: {
      idempotency_key: { type: 'string' },
      amount: { type: 'integer', description: 'Amount in cents' },
      currency: { type: 'string', default: 'USD' },
      counterparty_name: { type: 'string' },
      authorizing_instrument_id: { type: 'string', format: 'uuid' },
      expected_date: { type: 'string', format: 'date' },
      category: { type: 'string' },
    },
    required: ['idempotency_key', 'amount'],
  },

  ExportReportRequest: {
    type: 'object',
    properties: {
      report_type: {
        type: 'string',
        enum: ['transaction_detail', 'creator_earnings', 'platform_revenue', 'payout_summary', 'reconciliation', 'audit_log'],
      },
      format: { type: 'string', enum: ['csv', 'json'] },
      start_date: { type: 'string', format: 'date' },
      end_date: { type: 'string', format: 'date' },
      creator_id: { type: 'string' },
    },
    required: ['report_type', 'format'],
  },

  UploadReceiptRequest: {
    type: 'object',
    properties: {
      file_url: { type: 'string', format: 'uri', description: 'File URL (must be Supabase storage)' },
      file_name: { type: 'string' },
      file_size: { type: 'integer', description: 'File size in bytes (max 50MB)' },
      mime_type: { type: 'string', enum: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'] },
      merchant_name: { type: 'string' },
      transaction_date: { type: 'string', format: 'date' },
      total_amount: { type: 'integer', description: 'Amount in cents' },
      transaction_id: { type: 'string', format: 'uuid' },
    },
    required: ['file_url'],
  },

  ReceivePaymentRequest: {
    type: 'object',
    properties: {
      amount: { type: 'integer', description: 'Amount in cents' },
      invoice_transaction_id: { type: 'string', format: 'uuid' },
      customer_name: { type: 'string' },
      customer_id: { type: 'string' },
      reference_id: { type: 'string' },
      payment_method: { type: 'string' },
      payment_date: { type: 'string', format: 'date' },
      metadata: { type: 'object', additionalProperties: true },
    },
    required: ['amount'],
  },

  ParticipantCreateRequest: {
    type: 'object',
    properties: {
      participant_id: { type: 'string' },
      user_id: { type: 'string', format: 'uuid' },
      display_name: { type: 'string' },
      email: { type: 'string', format: 'email' },
      default_split_percent: { type: 'number', minimum: 0, maximum: 100 },
      tax_info: { type: 'object', additionalProperties: true },
      payout_preferences: { type: 'object', additionalProperties: true },
      metadata: { type: 'object', additionalProperties: true },
    },
    required: ['participant_id'],
  },

  WalletMutationRequest: {
    type: 'object',
    properties: {
      amount: { type: 'integer', description: 'Amount in cents' },
      reference_id: { type: 'string' },
      description: { type: 'string' },
      metadata: { type: 'object', additionalProperties: true },
    },
    required: ['amount', 'reference_id'],
  },

  TransferFundsRequest: {
    type: 'object',
    properties: {
      from_participant_id: { type: 'string' },
      to_participant_id: { type: 'string' },
      amount: { type: 'integer', description: 'Amount in cents' },
      reference_id: { type: 'string' },
      description: { type: 'string' },
      metadata: { type: 'object', additionalProperties: true },
    },
    required: ['from_participant_id', 'to_participant_id', 'amount', 'reference_id'],
  },

  HoldReleaseRequest: {
    type: 'object',
    properties: {
      execute_transfer: { type: 'boolean', default: true },
    },
  },

  TreasuryCheckoutSessionRequest: {
    type: 'object',
    properties: {
      participant_id: { type: 'string' },
      amount: { type: 'integer', description: 'Amount in cents' },
      currency: { type: 'string', default: 'USD' },
      product_id: { type: 'string' },
      product_name: { type: 'string' },
      customer_email: { type: 'string', format: 'email' },
      customer_id: { type: 'string' },
      payment_method_id: { type: 'string' },
      source_id: { type: 'string' },
      success_url: { type: 'string', format: 'uri' },
      cancel_url: { type: 'string', format: 'uri' },
      idempotency_key: { type: 'string' },
      metadata: { type: 'object', additionalProperties: { type: 'string' } },
    },
    required: ['participant_id', 'amount'],
  },

  TreasuryPayoutRequest: {
    type: 'object',
    properties: {
      participant_id: { type: 'string' },
      amount: { type: 'integer', description: 'Amount in cents' },
      reference_id: { type: 'string' },
      reference_type: { type: 'string' },
      description: { type: 'string' },
      payout_method: { type: 'string' },
      fees: { type: 'integer' },
      fees_paid_by: { type: 'string', enum: ['platform', 'creator'] },
      metadata: { type: 'object', additionalProperties: true },
    },
    required: ['participant_id', 'amount', 'reference_id'],
  },

  TreasuryRefundRequest: {
    type: 'object',
    properties: {
      sale_reference: { type: 'string' },
      reason: { type: 'string' },
      amount: { type: 'integer', description: 'Amount in cents' },
      refund_from: { type: 'string', enum: ['both', 'platform_only', 'creator_only'] },
      external_refund_id: { type: 'string' },
      idempotency_key: { type: 'string' },
      mode: { type: 'string', enum: ['ledger_only', 'processor_refund'] },
      processor_payment_id: { type: 'string' },
      metadata: { type: 'object', additionalProperties: true },
    },
    required: ['sale_reference', 'reason'],
  },

  RefundsListRequest: {
    type: 'object',
    properties: {
      sale_reference: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
    },
  },

  // ── Response types ────────────────────────────────────────────────────
  SaleBreakdown: {
    type: 'object',
    properties: {
      total: { type: 'number', description: 'Gross sale amount in major currency units' },
      creator_amount: { type: 'number' },
      platform_amount: { type: 'number' },
      processing_fee: { type: 'number' },
    },
    required: ['total', 'creator_amount', 'platform_amount'],
  },

  RecordSaleResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      {
        type: 'object',
        properties: {
          transaction_id: { type: 'string', format: 'uuid' },
          breakdown: { $ref: '#/components/schemas/SaleBreakdown' },
        },
      },
    ],
  },

  CheckoutBreakdown: {
    type: 'object',
    properties: {
      gross_amount: { type: 'number' },
      creator_amount: { type: 'number' },
      platform_amount: { type: 'number' },
      creator_percent: { type: 'number' },
    },
  },

  CreateCheckoutResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      {
        type: 'object',
        properties: {
          provider: { type: 'string', enum: ['card'] },
          payment_id: { type: 'string' },
          payment_intent_id: { type: 'string' },
          client_secret: { type: ['string', 'null'] },
          checkout_url: { type: ['string', 'null'] },
          status: { type: ['string', 'null'] },
          requires_action: { type: 'boolean' },
          amount: { type: 'integer' },
          currency: { type: 'string' },
          breakdown: { $ref: '#/components/schemas/CheckoutBreakdown' },
          mode: { type: 'string', enum: ['direct', 'session'] },
          session_id: { type: 'string' },
          expires_at: { type: 'string', format: 'date-time' },
        },
      },
    ],
  },

  GetBalanceResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      {
        type: 'object',
        properties: {
          balance: {
            type: 'object',
            properties: {
              creator_id: { type: 'string' },
              available: { type: 'number' },
              pending: { type: 'number' },
              total_earned: { type: 'number' },
              total_paid_out: { type: 'number' },
              currency: { type: 'string' },
            },
          },
          balances: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                creator_id: { type: 'string' },
                available: { type: 'number' },
                pending: { type: 'number' },
                currency: { type: 'string' },
              },
            },
          },
          platform_summary: {
            type: 'object',
            properties: {
              total_revenue: { type: 'number' },
              total_owed_creators: { type: 'number' },
              total_paid_out: { type: 'number' },
              cash_balance: { type: 'number' },
            },
          },
        },
      },
    ],
  },

  ProcessPayoutResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      {
        type: 'object',
        properties: {
          payout_id: { type: 'string' },
          transaction_id: { type: 'string', format: 'uuid' },
          amount: { type: 'integer' },
          status: { type: 'string' },
        },
      },
    ],
  },

  RecordRefundResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      {
        type: 'object',
        properties: {
          transaction_id: { type: 'string', format: 'uuid' },
          refunded_amount: { type: 'integer' },
          breakdown: {
            type: 'object',
            properties: {
              from_creator: { type: 'number' },
              from_platform: { type: 'number' },
            },
          },
        },
      },
    ],
  },

  ReverseTransactionResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      {
        type: 'object',
        properties: {
          reversal_id: { type: 'string', format: 'uuid' },
          original_transaction_id: { type: 'string', format: 'uuid' },
          reversed_amount: { type: 'integer' },
        },
      },
    ],
  },

  TransactionEntry: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      account_id: { type: 'string', format: 'uuid' },
      entry_type: { type: 'string', enum: ['debit', 'credit'] },
      amount: { type: 'number' },
      account: {
        type: 'object',
        properties: {
          account_type: { type: 'string' },
          entity_id: { type: ['string', 'null'] },
          name: { type: 'string' },
        },
      },
    },
  },

  Transaction: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      transaction_type: { type: 'string' },
      reference_id: { type: ['string', 'null'] },
      reference_type: { type: ['string', 'null'] },
      description: { type: ['string', 'null'] },
      amount: { type: 'number' },
      currency: { type: 'string' },
      status: { type: 'string' },
      metadata: { type: 'object', additionalProperties: true },
      created_at: { type: 'string', format: 'date-time' },
      entries: { type: 'array', items: { $ref: '#/components/schemas/TransactionEntry' } },
    },
  },

  Pagination: {
    type: 'object',
    properties: {
      total: { type: 'integer' },
      page: { type: 'integer' },
      per_page: { type: 'integer' },
      total_pages: { type: 'integer' },
    },
  },

  GetTransactionsResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      {
        type: 'object',
        properties: {
          transactions: { type: 'array', items: { $ref: '#/components/schemas/Transaction' } },
          pagination: { $ref: '#/components/schemas/Pagination' },
        },
      },
    ],
  },

  CreateCreatorResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      {
        type: 'object',
        properties: {
          creator: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              account_id: { type: 'string', format: 'uuid' },
              display_name: { type: ['string', 'null'] },
              email: { type: ['string', 'null'] },
              default_split_percent: { type: 'number' },
              payout_preferences: { type: 'object', additionalProperties: true },
              created_at: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    ],
  },

  RecordAdjustmentResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      {
        type: 'object',
        properties: {
          transaction_id: { type: 'string', format: 'uuid' },
          adjustment_id: { type: 'string', format: 'uuid' },
          entries_created: { type: 'integer' },
        },
      },
    ],
  },

  RecordOpeningBalanceResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      {
        type: 'object',
        properties: {
          opening_balance_id: { type: 'string', format: 'uuid' },
          transaction_id: { type: 'string', format: 'uuid' },
          summary: {
            type: 'object',
            properties: {
              as_of_date: { type: 'string', format: 'date' },
              total_assets: { type: 'number' },
              total_liabilities: { type: 'number' },
              total_equity: { type: 'number' },
              accounts_set: { type: 'integer' },
            },
          },
        },
      },
    ],
  },

  RecordTransferResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      {
        type: 'object',
        properties: {
          transfer_id: { type: 'string', format: 'uuid' },
          transaction_id: { type: 'string', format: 'uuid' },
          amount: { type: 'integer' },
          from_account: { type: 'string' },
          to_account: { type: 'string' },
        },
      },
    ],
  },

  RiskEvaluationResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      {
        type: 'object',
        properties: {
          cached: { type: 'boolean' },
          evaluation: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              signal: { type: 'string', enum: ['within_policy', 'elevated_risk', 'high_risk'] },
              risk_factors: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    policy_id: { type: 'string' },
                    policy_type: { type: 'string' },
                    severity: { type: 'string', enum: ['hard', 'soft'] },
                    indicator: { type: 'string' },
                  },
                },
              },
              valid_until: { type: 'string', format: 'date-time' },
              created_at: { type: 'string', format: 'date-time' },
              acknowledged_at: { type: ['string', 'null'], format: 'date-time' },
            },
          },
        },
      },
    ],
  },

  UploadReceiptResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      {
        type: 'object',
        properties: {
          receipt_id: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: ['uploaded', 'matched', 'orphan'] },
          linked_transaction_id: { type: ['string', 'null'] },
        },
      },
    ],
  },

  ReceivePaymentResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      {
        type: 'object',
        properties: {
          transaction_id: { type: 'string', format: 'uuid' },
          amount: { type: 'integer' },
        },
      },
    ],
  },

  ParticipantSummary: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      linked_user_id: { type: ['string', 'null'], format: 'uuid' },
      name: { type: ['string', 'null'] },
      tier: { type: ['string', 'null'] },
      ledger_balance: { type: 'number' },
      held_amount: { type: 'number' },
      available_balance: { type: 'number' },
    },
  },

  Hold: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      participant_id: { type: ['string', 'null'] },
      participant_name: { type: ['string', 'null'] },
      amount: { type: 'number' },
      currency: { type: 'string' },
      held_since: { type: 'string', format: 'date-time' },
      days_held: { type: 'integer' },
      hold_reason: { type: ['string', 'null'] },
      hold_until: { type: ['string', 'null'], format: 'date-time' },
      ready_for_release: { type: 'boolean' },
      release_status: { type: 'string' },
      transaction_reference: { type: ['string', 'null'] },
      product_name: { type: ['string', 'null'] },
      venture_id: { type: ['string', 'null'] },
      connected_account_ready: { type: 'boolean' },
    },
  },

  ParticipantsListResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      {
        type: 'object',
        properties: {
          participants: {
            type: 'array',
            items: { $ref: '#/components/schemas/ParticipantSummary' },
          },
        },
      },
    ],
  },

  ParticipantDetailResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      {
        type: 'object',
        properties: {
          participant: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              linked_user_id: { type: ['string', 'null'], format: 'uuid' },
              name: { type: ['string', 'null'] },
              tier: { type: ['string', 'null'] },
              custom_split_percent: { type: ['number', 'null'] },
              ledger_balance: { type: 'number' },
              held_amount: { type: 'number' },
              available_balance: { type: 'number' },
              holds: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    amount: { type: 'number' },
                    reason: { type: ['string', 'null'] },
                    release_date: { type: ['string', 'null'], format: 'date-time' },
                    status: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    ],
  },

  ParticipantCreateResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      {
        type: 'object',
        properties: {
          participant: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              account_id: { type: 'string', format: 'uuid' },
              linked_user_id: { type: ['string', 'null'], format: 'uuid' },
              display_name: { type: ['string', 'null'] },
              email: { type: ['string', 'null'] },
              default_split_percent: { type: 'number' },
              payout_preferences: { type: 'object', additionalProperties: true },
              created_at: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    ],
  },

  ParticipantEligibilityResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      {
        type: 'object',
        properties: {
          eligibility: {
            type: 'object',
            properties: {
              participant_id: { type: 'string' },
              eligible: { type: 'boolean' },
              available_balance: { type: 'number' },
              issues: { type: 'array', items: { type: 'string' } },
              requirements: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
    ],
  },

  WalletDetailResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      {
        type: 'object',
        properties: {
          wallet: {
            type: 'object',
            properties: {
              participant_id: { type: 'string' },
              balance: { type: 'number' },
              wallet_exists: { type: 'boolean' },
              account: {
                type: ['object', 'null'],
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  participant_id: { type: 'string' },
                  name: { type: ['string', 'null'] },
                  is_active: { type: 'boolean' },
                  created_at: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
      },
    ],
  },

  WalletEntriesResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      {
        type: 'object',
        properties: {
          entries: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                entry_id: { type: 'string', format: 'uuid' },
                entry_type: { type: 'string', enum: ['debit', 'credit'] },
                amount: { type: 'number' },
                transaction_id: { type: 'string', format: 'uuid' },
                reference_id: { type: ['string', 'null'] },
                transaction_type: { type: 'string' },
                description: { type: ['string', 'null'] },
                status: { type: 'string' },
                metadata: { type: 'object', additionalProperties: true },
                created_at: { type: 'string', format: 'date-time' },
              },
            },
          },
          total: { type: 'integer' },
          limit: { type: 'integer' },
          offset: { type: 'integer' },
        },
      },
    ],
  },

  WalletDepositResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      {
        type: 'object',
        properties: {
          deposit: {
            type: 'object',
            properties: {
              participant_id: { type: 'string' },
              transaction_id: { type: 'string', format: 'uuid' },
              balance: { type: 'number' },
            },
          },
        },
      },
    ],
  },

  WalletWithdrawalResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      {
        type: 'object',
        properties: {
          withdrawal: {
            type: 'object',
            properties: {
              participant_id: { type: 'string' },
              transaction_id: { type: 'string', format: 'uuid' },
              balance: { type: 'number' },
            },
          },
        },
      },
    ],
  },

  TransferFundsResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      {
        type: 'object',
        properties: {
          transfer: {
            type: 'object',
            properties: {
              transaction_id: { type: 'string', format: 'uuid' },
              from_participant_id: { type: ['string', 'null'] },
              to_participant_id: { type: ['string', 'null'] },
              from_balance: { type: 'number' },
              to_balance: { type: 'number' },
            },
          },
        },
      },
    ],
  },

  HoldsListResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      {
        type: 'object',
        properties: {
          holds: { type: 'array', items: { $ref: '#/components/schemas/Hold' } },
          count: { type: 'integer' },
        },
      },
    ],
  },

  HoldsSummaryResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      {
        type: 'object',
        properties: {
          summary: { type: 'object', additionalProperties: true },
        },
      },
    ],
  },

  HoldReleaseResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      {
        type: 'object',
        properties: {
          release: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              hold_id: { type: 'string' },
              executed: { type: 'boolean' },
              transfer_id: { type: ['string', 'null'] },
              transfer_status: { type: ['string', 'null'] },
              amount: { type: ['number', 'null'] },
              currency: { type: ['string', 'null'] },
            },
          },
        },
      },
    ],
  },

  CheckoutSessionResourceResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      {
        type: 'object',
        properties: {
          checkout_session: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              mode: { type: 'string', enum: ['direct', 'session'] },
              checkout_url: { type: ['string', 'null'] },
              payment_id: { type: ['string', 'null'] },
              payment_intent_id: { type: ['string', 'null'] },
              status: { type: ['string', 'null'] },
              requires_action: { type: 'boolean' },
              amount: { type: 'integer' },
              currency: { type: 'string' },
              expires_at: { type: ['string', 'null'], format: 'date-time' },
              breakdown: { $ref: '#/components/schemas/CheckoutBreakdown' },
            },
          },
        },
      },
    ],
  },

  PayoutResourceResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      {
        type: 'object',
        properties: {
          payout: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              transaction_id: { type: 'string', format: 'uuid' },
              gross_amount: { type: ['number', 'null'] },
              fees: { type: ['number', 'null'] },
              net_amount: { type: ['number', 'null'] },
              previous_balance: { type: ['number', 'null'] },
              new_balance: { type: ['number', 'null'] },
            },
          },
        },
      },
    ],
  },

  RefundResourceResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      {
        type: 'object',
        properties: {
          warning: { type: ['string', 'null'] },
          warning_code: { type: ['string', 'null'] },
          refund: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              transaction_id: { type: ['string', 'null'] },
              reference_id: { type: ['string', 'null'] },
              sale_reference: { type: ['string', 'null'] },
              refunded_amount: { type: 'number' },
              currency: { type: ['string', 'null'] },
              status: { type: ['string', 'null'] },
              reason: { type: ['string', 'null'] },
              refund_from: { type: ['string', 'null'] },
              external_refund_id: { type: ['string', 'null'] },
              created_at: { type: ['string', 'null'], format: 'date-time' },
              breakdown: {
                type: ['object', 'null'],
                properties: {
                  from_creator: { type: 'number' },
                  from_platform: { type: 'number' },
                },
              },
              is_full_refund: { type: ['boolean', 'null'] },
              repair_pending: { type: ['boolean', 'null'] },
            },
          },
        },
      },
    ],
  },

  RefundsListResponse: {
    allOf: [
      { $ref: '#/components/schemas/SuccessEnvelope' },
      {
        type: 'object',
        properties: {
          count: { type: 'integer' },
          refunds: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                transaction_id: { type: ['string', 'null'] },
                reference_id: { type: ['string', 'null'] },
                sale_reference: { type: ['string', 'null'] },
                refunded_amount: { type: 'number' },
                currency: { type: 'string' },
                status: { type: 'string' },
                reason: { type: ['string', 'null'] },
                refund_from: { type: ['string', 'null'] },
                external_refund_id: { type: ['string', 'null'] },
                created_at: { type: ['string', 'null'], format: 'date-time' },
                breakdown: {
                  type: ['object', 'null'],
                  properties: {
                    from_creator: { type: 'number' },
                    from_platform: { type: 'number' },
                  },
                },
                repair_pending: { type: ['boolean', 'null'] },
                last_error: { type: ['string', 'null'] },
              },
            },
          },
        },
      },
    ],
  },
}

// ---------------------------------------------------------------------------
// 3. Endpoint → schema mapping
// ---------------------------------------------------------------------------

type SchemaBinding = {
  request?: string
  response?: string
  get?: { request?: string; response?: string }
  post?: { request?: string; response?: string }
  put?: { request?: string; response?: string }
  patch?: { request?: string; response?: string }
  delete?: { request?: string; response?: string }
}

type MethodSchemaBinding = {
  request?: string
  response?: string
}

const ENDPOINT_SCHEMA_MAP: Record<string, SchemaBinding> = {
  'record-sale': { request: 'RecordSaleRequest', response: 'RecordSaleResponse' },
  'reverse-transaction': { request: 'ReverseTransactionRequest', response: 'ReverseTransactionResponse' },
  'get-transactions': { request: 'GetTransactionsRequest', response: 'GetTransactionsResponse' },
  'record-adjustment': { request: 'RecordAdjustmentRequest', response: 'RecordAdjustmentResponse' },
  'record-opening-balance': { request: 'RecordOpeningBalanceRequest', response: 'RecordOpeningBalanceResponse' },
  'record-transfer': { request: 'RecordTransferRequest', response: 'RecordTransferResponse' },
  'risk-evaluation': { request: 'RiskEvaluationRequest', response: 'RiskEvaluationResponse' },
  'export-report': { request: 'ExportReportRequest' },
  'upload-receipt': { request: 'UploadReceiptRequest', response: 'UploadReceiptResponse' },
  'receive-payment': { request: 'ReceivePaymentRequest', response: 'ReceivePaymentResponse' },
  'participants': {
    get: { response: 'ParticipantsListResponse' },
    post: { request: 'ParticipantCreateRequest', response: 'ParticipantCreateResponse' },
  },
  'participant-detail': { response: 'ParticipantDetailResponse' },
  'participant-payout-eligibility': { response: 'ParticipantEligibilityResponse' },
  'wallet-detail': { response: 'WalletDetailResponse' },
  'wallet-entries': { response: 'WalletEntriesResponse' },
  'wallet-deposit': { request: 'WalletMutationRequest', response: 'WalletDepositResponse' },
  'wallet-withdrawal': { request: 'WalletMutationRequest', response: 'WalletWithdrawalResponse' },
  'transfers': { request: 'TransferFundsRequest', response: 'TransferFundsResponse' },
  'holds': { response: 'HoldsListResponse' },
  'holds-summary': { response: 'HoldsSummaryResponse' },
  'hold-release': { request: 'HoldReleaseRequest', response: 'HoldReleaseResponse' },
  'checkout-sessions': { request: 'TreasuryCheckoutSessionRequest', response: 'CheckoutSessionResourceResponse' },
  'payouts': { request: 'TreasuryPayoutRequest', response: 'PayoutResourceResponse' },
  'refunds': {
    get: { request: 'RefundsListRequest', response: 'RefundsListResponse' },
    post: { request: 'TreasuryRefundRequest', response: 'RefundResourceResponse' },
  },
}

// ---------------------------------------------------------------------------
// 3b. Explicit body schema overrides for endpoints with weak catalog types
// ---------------------------------------------------------------------------
// These override the auto-generated catalog schemas for endpoints whose
// catalog type strings use custom type names, `{` openers, or truncated unions.

const BODY_SCHEMA_OVERRIDES: Record<string, object> = {
  'execute-payout': {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['execute', 'batch_execute', 'get_status', 'configure_rail', 'list_rails'] },
      payout_id: { type: 'string', format: 'uuid' },
      payout_ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
      rail: { type: 'string', description: 'Payout rail identifier' },
      rail_config: { type: 'object', additionalProperties: true, description: 'Rail-specific configuration' },
    },
    required: ['action'],
  },
  'frozen-statements': {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['generate', 'list', 'get', 'compare'] },
      period_id: { type: 'string', format: 'uuid' },
      statement_type: { type: 'string', enum: ['balance_sheet', 'income_statement', 'trial_balance'] },
    },
    required: ['action'],
  },
  'generate-pdf': {
    type: 'object',
    properties: {
      report_type: { type: 'string', enum: ['invoice', 'statement', 'balance_sheet', 'income_statement', 'trial_balance', '1099_nec'] },
      period_id: { type: 'string', format: 'uuid' },
      creator_id: { type: 'string' },
      start_date: { type: 'string', format: 'date' },
      end_date: { type: 'string', format: 'date' },
      tax_year: { type: 'integer' },
      ledger_id: { type: 'string', format: 'uuid' },
    },
    required: ['report_type'],
  },
  'generate-report': {
    type: 'object',
    properties: {
      report_type: { type: 'string', enum: ['transaction_detail', 'creator_earnings', 'platform_revenue', 'payout_summary', 'reconciliation'] },
      start_date: { type: 'string', format: 'date' },
      end_date: { type: 'string', format: 'date' },
      creator_id: { type: 'string' },
      format: { type: 'string', enum: ['json', 'csv'] },
    },
    required: ['report_type'],
  },
  'manage-splits': {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['get', 'set', 'set_product', 'delete_product', 'list_product'] },
      creator_id: { type: 'string' },
      creator_percent: { type: 'number', minimum: 0, maximum: 100 },
      product_id: { type: 'string' },
    },
    required: ['action'],
  },
  'reconcile': {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['start', 'match', 'unmatch', 'complete', 'status'] },
      transaction_id: { type: 'string', format: 'uuid' },
      bank_transaction_id: { type: 'string', format: 'uuid' },
      period_id: { type: 'string', format: 'uuid' },
      as_of_date: { type: 'string', format: 'date' },
    },
    required: ['action'],
  },
  'import-transactions': {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['parse_preview', 'import', 'get_templates', 'save_template'] },
      format: { type: 'string', enum: ['csv', 'ofx', 'qfx', 'auto'] },
      data: { type: 'string', description: 'Raw file content' },
      mapping: { type: 'object', additionalProperties: true, description: 'Column mapping configuration' },
      template_id: { type: 'string' },
      template: { type: 'object', additionalProperties: true },
      transactions: { type: 'array', items: { type: 'object', additionalProperties: true } },
      account_name: { type: 'string' },
    },
    required: ['action'],
  },
  'import-bank-statement': {
    type: 'object',
    properties: {
      bank_account_id: { type: 'string', format: 'uuid' },
      lines: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string', format: 'date' },
            description: { type: 'string' },
            amount: { type: 'number' },
            type: { type: 'string', enum: ['debit', 'credit'] },
          },
          required: ['date', 'description', 'amount'],
        },
      },
      auto_match: { type: 'boolean' },
    },
    required: ['bank_account_id', 'lines'],
  },
  'register-instrument': {
    type: 'object',
    properties: {
      external_ref: { type: 'string', description: 'External reference for the instrument' },
      extracted_terms: {
        type: 'object',
        description: 'Contract terms extracted from the instrument',
        additionalProperties: true,
      },
    },
    required: ['external_ref', 'extracted_terms'],
  },
  'send-statements': {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['send_monthly_statements', 'send_single_statement', 'preview', 'get_queue'] },
      ledger_id: { type: 'string', format: 'uuid' },
      creator_id: { type: 'string' },
      year: { type: 'integer' },
      month: { type: 'integer', minimum: 1, maximum: 12 },
      email_config: { type: 'object', additionalProperties: true },
    },
    required: ['action'],
  },
  'tax-documents': {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['calculate', 'generate_all', 'list', 'get', 'export', 'mark_filed'] },
      tax_year: { type: 'integer' },
      creator_id: { type: 'string' },
      document_id: { type: 'string', format: 'uuid' },
      format: { type: 'string', enum: ['csv', 'json'] },
    },
    required: ['action'],
  },
  'webhooks': {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['list', 'create', 'update', 'delete', 'test', 'deliveries', 'retry'] },
      endpoint_id: { type: 'string', format: 'uuid' },
      delivery_id: { type: 'string', format: 'uuid' },
      url: { type: 'string', format: 'uri' },
      description: { type: 'string' },
      events: { type: 'array', items: { type: 'string' } },
      is_active: { type: 'boolean' },
    },
    required: ['action'],
  },
  'configure-alerts': {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['list', 'create', 'update', 'delete', 'test'] },
      config_id: { type: 'string', format: 'uuid' },
      alert_type: { type: 'string', enum: ['breach_risk', 'projection_created', 'instrument_invalidated'] },
      channel: { type: 'string', enum: ['slack', 'email', 'webhook'] },
      config: { type: 'object', additionalProperties: true },
      webhook_url: { type: 'string', format: 'uri' },
      recipients: { type: 'array', items: { type: 'string' } },
      thresholds: {
        type: 'object',
        properties: {
          coverage_ratio_below: { type: 'number' },
          shortfall_above: { type: 'number' },
        },
      },
      is_active: { type: 'boolean' },
    },
    required: ['action'],
  },
  'invoices': {
    type: 'object',
    properties: {
      customer_name: { type: 'string' },
      customer_email: { type: 'string', format: 'email' },
      customer_id: { type: 'string' },
      customer_address: {
        type: 'object',
        properties: {
          line1: { type: 'string' },
          line2: { type: 'string' },
          city: { type: 'string' },
          state: { type: 'string' },
          postal_code: { type: 'string' },
          country: { type: 'string' },
        },
      },
      line_items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            quantity: { type: 'number' },
            unit_price: { type: 'integer', description: 'Price in cents' },
            amount: { type: 'integer', description: 'Line total in cents' },
          },
          required: ['description', 'amount'],
        },
      },
      due_date: { type: 'string', format: 'date' },
      notes: { type: 'string' },
      terms: { type: 'string' },
      reference_id: { type: 'string' },
      metadata: { type: 'object', additionalProperties: true },
    },
    required: ['customer_name', 'line_items'],
  },
  'configure-risk-policy': {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['create', 'list', 'delete'] },
      policy_type: { type: 'string', enum: ['require_instrument', 'budget_cap', 'projection_guard'] },
      config: { type: 'object', additionalProperties: true },
      severity: { type: 'string', enum: ['hard', 'soft'] },
      priority: { type: 'integer' },
      policy_id: { type: 'string', format: 'uuid' },
    },
    required: ['action'],
  },
}

// ---------------------------------------------------------------------------
// 4. Tag mapping
// ---------------------------------------------------------------------------

const TAG_MAP: Record<string, string> = {
  // Payments
  'record-sale': 'Payments',
  'execute-payout': 'Payments',
  'reverse-transaction': 'Payments',
  'receive-payment': 'Payments',
  'checkout-sessions': 'Payments',
  'payouts': 'Payments',
  'refunds': 'Payments',
  // Treasury
  'participants': 'Treasury',
  'participant-detail': 'Treasury',
  'participant-payout-eligibility': 'Treasury',
  'wallet-detail': 'Treasury',
  'wallet-entries': 'Treasury',
  'wallet-deposit': 'Treasury',
  'wallet-withdrawal': 'Treasury',
  'transfers': 'Treasury',
  'holds': 'Treasury',
  'holds-summary': 'Treasury',
  'hold-release': 'Treasury',
  // Creators
  'delete-creator': 'Creators',
  'manage-splits': 'Creators',
  'manage-contractors': 'Creators',
  // Balances
  'get-runway': 'Balances',
  // Transactions
  'get-transactions': 'Transactions',
  'import-transactions': 'Transactions',
  // Accounting
  'record-adjustment': 'Accounting',
  'record-opening-balance': 'Accounting',
  'record-transfer': 'Accounting',
  'record-bill': 'Accounting',
  'record-expense': 'Accounting',
  'record-income': 'Accounting',
  'pay-bill': 'Accounting',
  'close-period': 'Accounting',
  'reconcile': 'Accounting',
  'manage-budgets': 'Accounting',
  'manage-recurring': 'Accounting',
  'upload-receipt': 'Accounting',
  // Reports
  'balance-sheet': 'Reports',
  'profit-loss': 'Reports',
  'trial-balance': 'Reports',
  'ap-aging': 'Reports',
  'ar-aging': 'Reports',
  'generate-report': 'Reports',
  'export-report': 'Reports',
  'frozen-statements': 'Reports',
  'send-statements': 'Reports',
  // Tax
  'tax-documents': 'Tax',
  'generate-tax-summary': 'Tax',
  // Risk
  'risk-evaluation': 'Risk',
  'configure-risk-policy': 'Risk',
  'configure-alerts': 'Risk',
  'preflight-authorization': 'Risk',
  'register-instrument': 'Risk',
  'project-intent': 'Risk',
  // Invoicing
  'invoices': 'Invoicing',
  'generate-pdf': 'Invoicing',
  // Webhooks
  'webhooks': 'Webhooks',
  // Banking
  'manage-bank-accounts': 'Banking',
  'import-bank-statement': 'Banking',
}

// ---------------------------------------------------------------------------
// 5. Helpers
// ---------------------------------------------------------------------------

/** Convert a catalog type string to JSON Schema. */
function catalogTypeToJsonSchema(typeStr: string): object {
  const t = typeStr.trim()

  // Quoted union: "'csv' | 'json'" → enum
  const quotedUnionMatch = t.match(/^'[^']+(?:'\s*\|\s*'[^']+)*'/)
  if (quotedUnionMatch) {
    const values = t.match(/'([^']+)'/g)?.map((v) => v.replace(/'/g, '')) ?? []
    return { type: 'string', enum: values }
  }

  // Array types
  if (t.endsWith('[]')) {
    const inner = t.slice(0, -2)
    if (inner === 'string') return { type: 'array', items: { type: 'string' } }
    if (inner === 'number') return { type: 'array', items: { type: 'number' } }
    // Complex array (custom types) - return generic object array
    return { type: 'array', items: { type: 'object', additionalProperties: true } }
  }

  // Record types
  if (t.startsWith('Record<')) return { type: 'object', additionalProperties: true }

  // Truncated union (contains '...' or ends with '|')
  if (t.includes('...') || t.endsWith('|')) return { type: 'string' }

  // Object opener '{'
  if (t === '{') return { type: 'object', additionalProperties: true }

  // Named complex types (Action, ReportType, etc.) - treat as string
  if (/^[A-Z]/.test(t)) return { type: 'string' }

  // Primitives
  switch (t) {
    case 'string': return { type: 'string' }
    case 'number': return { type: 'number' }
    case 'boolean': return { type: 'boolean' }
    default: return { type: 'string' }
  }
}

/** Build a JSON Schema object from catalog parameters (body params only). */
function catalogParamsToSchema(params: ApiParameter[]): object | null {
  const bodyParams = params.filter((p) => p.in === 'body')
  if (bodyParams.length === 0) return null

  const properties: Record<string, object> = {}
  const required: string[] = []

  for (const p of bodyParams) {
    // Skip nested sub-properties (e.g., address fields under tax_info)
    // They have simple names that are children of an object opener
    properties[p.name] = catalogTypeToJsonSchema(p.type)
    if (p.required) required.push(p.name)
  }

  const schema: Record<string, unknown> = { type: 'object', properties }
  if (required.length > 0) schema.required = required
  return schema
}

/** Build query/path parameters from catalog. */
function catalogOperationParams(
  params: ApiParameter[],
  options: { includeQuery?: boolean; includePath?: boolean } = {},
): object[] {
  const includeQuery = options.includeQuery ?? true
  const includePath = options.includePath ?? true
  return params
    .filter((p) => (includeQuery && p.in === 'query') || (includePath && p.in === 'path'))
    .map((p) => ({
      name: p.name,
      in: p.in,
      required: p.required,
      schema: catalogTypeToJsonSchema(p.type),
    }))
}

/** Standard response headers. */
const RESPONSE_HEADERS = {
  'X-Request-Id': {
    description: 'Unique request identifier',
    schema: { type: 'string', examples: ['req_abc123'] },
  },
  'Soledgic-Version': {
    description: 'API version used',
    schema: { type: 'string', examples: ['2026-03-01'] },
  },
  'X-RateLimit-Remaining': {
    description: 'Remaining requests in current window',
    schema: { type: 'integer' },
  },
  'X-RateLimit-Reset': {
    description: 'Unix timestamp when rate limit resets',
    schema: { type: 'integer' },
  },
}

/** Endpoints that can return non-JSON content types. */
const CONTENT_TYPE_OVERRIDES: Record<string, Record<string, object>> = {
  'export-report': {
    'application/json': { schema: { $ref: '#/components/schemas/SuccessEnvelope' } },
    'text/csv': { schema: { type: 'string', description: 'CSV file content' } },
  },
  'generate-pdf': {
    'application/pdf': { schema: { type: 'string', format: 'binary' } },
    'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } },
  },
}

/** Build the standard responses block for an endpoint. */
function buildResponses(endpointName: string, responseSchemaRef?: string): Record<string, object> {
  const contentOverride = CONTENT_TYPE_OVERRIDES[endpointName]
  const successContent = contentOverride
    ?? (responseSchemaRef
      ? { 'application/json': { schema: { $ref: `#/components/schemas/${responseSchemaRef}` } } }
      : { 'application/json': { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } })

  return {
    '200': {
      description: 'Success',
      headers: RESPONSE_HEADERS,
      content: successContent,
    },
    '400': { $ref: '#/components/responses/BadRequest' },
    '401': { $ref: '#/components/responses/Unauthorized' },
    '404': { $ref: '#/components/responses/NotFound' },
    '409': { $ref: '#/components/responses/Conflict' },
    '429': { $ref: '#/components/responses/RateLimited' },
    '500': { $ref: '#/components/responses/InternalError' },
  }
}

/** Generate a single OpenAPI path item from a catalog entry. */
function generatePathItem(ep: typeof publicEndpoints[number]): Record<string, object> {
  const tag = TAG_MAP[ep.endpoint] ?? 'Other'
  const mapping = ENDPOINT_SCHEMA_MAP[ep.endpoint]
  const pathItem: Record<string, object> = {}
  const hasMultipleMethods = ep.methods.length > 1

  for (const method of ep.methods) {
    const m = method.toLowerCase()
    const methodMapping: MethodSchemaBinding =
      mapping && (mapping.get || mapping.post || mapping.put || mapping.patch || mapping.delete)
        ? mapping[m as 'get' | 'post' | 'put' | 'patch' | 'delete'] || {}
        : mapping || {}
    // Use distinct operationIds for multi-method endpoints
    const operationId = hasMultipleMethods ? `${ep.endpoint}-${m}` : ep.endpoint
    const operation: Record<string, unknown> = {
      operationId,
      summary: ep.description || ep.title,
      tags: [tag],
    }

    // Query parameters come from catalog for GET; non-GET operations keep only path params here.
    const qp = catalogOperationParams(ep.parameters, { includeQuery: true, includePath: true })
    if (m === 'get') {
      // GET: use catalog query params + any mapped request schema fields as additional query params
      const allParams = [...qp]
      if (methodMapping.request && SCHEMAS[methodMapping.request]) {
        const reqSchema = SCHEMAS[methodMapping.request] as Record<string, unknown>
        const props = (reqSchema.properties ?? {}) as Record<string, object>
        const existingNames = new Set(qp.map((p) => (p as { name: string }).name))
        const extraParams = Object.entries(props)
          .filter(([name]) => !existingNames.has(name))
          .map(([name, schema]) => ({
            name,
            in: 'query',
            required: ((reqSchema.required as string[]) ?? []).includes(name),
            schema,
          }))
        allParams.push(...extraParams)
      }
      if (allParams.length > 0) {
        operation.parameters = allParams
      }
    } else {
      // POST/PUT/PATCH: keep path params on the operation and body params in requestBody.
      const pathParams = catalogOperationParams(ep.parameters, { includeQuery: false, includePath: true })
      if (pathParams.length > 0) {
        operation.parameters = pathParams
      }

      let bodySchema: object | null = null
      if (methodMapping.request) {
        bodySchema = { $ref: `#/components/schemas/${methodMapping.request}` }
      } else if (BODY_SCHEMA_OVERRIDES[ep.endpoint]) {
        bodySchema = BODY_SCHEMA_OVERRIDES[ep.endpoint]
      } else {
        bodySchema = catalogParamsToSchema(ep.parameters)
      }

      if (bodySchema) {
        operation.requestBody = {
          required: true,
          content: { 'application/json': { schema: bodySchema } },
        }
      }
    }

    // Responses
    operation.responses = buildResponses(ep.endpoint, methodMapping.response)

    pathItem[m] = operation
  }

  return pathItem
}

// ---------------------------------------------------------------------------
// 6. Assemble spec
// ---------------------------------------------------------------------------

const TAG_DESCRIPTIONS: Record<string, string> = {
  Payments: 'Checkout sessions, payouts, refunds, and payment-adjacent platform flows',
  Treasury: 'Platform treasury resources for participants, wallets, holds, and internal transfers',
  Creators: 'Create and manage creator accounts, splits, and contractor relationships',
  Balances: 'Query creator balances, platform summary, and cash runway',
  Transactions: 'List and import transactions',
  Accounting: 'Journal adjustments, opening balances, transfers, bills, expenses, income, period close',
  Reports: 'Financial reports — balance sheet, P&L, trial balance, aging, statements',
  Tax: 'Tax document generation and summaries',
  Risk: 'Risk evaluation, policy configuration, alerts, and preflight authorization',
  Invoicing: 'Invoice management and PDF generation',
  Webhooks: 'Webhook endpoint management',
  Banking: 'Bank account management and statement import',
}

const usedTags = new Set<string>()
const paths: Record<string, object> = {}

for (const ep of publicEndpoints) {
  const tag = TAG_MAP[ep.endpoint] ?? 'Other'
  usedTags.add(tag)
  paths[ep.path] = generatePathItem(ep)
}

const tags = [...usedTags]
  .sort()
  .map((name) => ({
    name,
    description: TAG_DESCRIPTIONS[name] ?? '',
  }))

const UNUSED_REQUEST_SCHEMAS = new Set([
  'CreateCheckoutRequest',
  'ProcessPayoutRequest',
  'RecordRefundRequest',
  'CreateCreatorRequest',
  'RefundsListRequest',
])

const spec = {
  openapi: '3.1.0',
  info: {
    title: 'Soledgic API',
    version: '2026-03-01',
    description: 'Financial infrastructure API for digital platforms. All amounts are in cents.',
    license: { name: 'Proprietary', identifier: 'LicenseRef-Proprietary' },
  },
  servers: [
    {
      url: 'https://{project}.supabase.co/functions',
      variables: {
        project: {
          default: 'your-project-ref',
          description: 'Your Supabase project reference',
        },
      },
    },
  ],
  security: [{ ApiKeyAuth: [] as string[] }],
  tags,
  paths,
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
        description: 'Your Soledgic API key',
      },
    },
    schemas: Object.fromEntries(
      Object.entries(SCHEMAS).filter(([name]) => {
        if (UNUSED_REQUEST_SCHEMAS.has(name)) {
          return false
        }
        // Exclude request schemas that are only used to expand GET query params
        // (never $ref'd in the output — avoids no-unused-components warnings)
        const mapping = Object.values(ENDPOINT_SCHEMA_MAP).find((m) => m.request === name)
        if (!mapping) return true
        const ep = publicEndpoints.find((e) => ENDPOINT_SCHEMA_MAP[e.endpoint]?.request === name)
        if (!ep) return true
        // If the endpoint only has GET methods, the request schema is expanded into query params
        return !ep.methods.every((m) => m === 'GET')
      }),
    ),
    responses: {
      BadRequest: {
        description: 'Validation error',
        headers: RESPONSE_HEADERS,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorEnvelope' },
          },
        },
      },
      Unauthorized: {
        description: 'Invalid or missing API key',
        headers: RESPONSE_HEADERS,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorEnvelope' },
          },
        },
      },
      NotFound: {
        description: 'Resource not found',
        headers: RESPONSE_HEADERS,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorEnvelope' },
          },
        },
      },
      Conflict: {
        description: 'Conflict (duplicate reference_id, idempotency collision, etc.)',
        headers: RESPONSE_HEADERS,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorEnvelope' },
          },
        },
      },
      RateLimited: {
        description: 'Rate limit exceeded',
        headers: RESPONSE_HEADERS,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/RateLimitError' },
          },
        },
      },
      InternalError: {
        description: 'Internal server error',
        headers: RESPONSE_HEADERS,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorEnvelope' },
          },
        },
      },
    },
  },
}

// ---------------------------------------------------------------------------
// 7. Write YAML output
// ---------------------------------------------------------------------------

const yamlOutput = stringify(spec, {
  lineWidth: 120,
  defaultStringType: 'QUOTE_DOUBLE',
  defaultKeyType: 'PLAIN',
})

const outDir = join(__dirname, '..', 'docs')
mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, 'openapi.yaml')
writeFileSync(outPath, yamlOutput, 'utf-8')

console.log(`✓ Generated ${outPath}`)
console.log(`  ${publicEndpoints.length} public endpoints`)
console.log(`  ${Object.keys(SCHEMAS).length} schema definitions`)
console.log(`  ${tags.length} tags: ${tags.map((t) => t.name).join(', ')}`)

// ---------------------------------------------------------------------------
// 8. Coverage report — detect unmapped endpoints
// ---------------------------------------------------------------------------

const mappedEndpoints = new Set([
  ...Object.keys(ENDPOINT_SCHEMA_MAP),
  ...Object.keys(BODY_SCHEMA_OVERRIDES),
])
const unmappedEndpoints = publicEndpoints.filter((ep) => !mappedEndpoints.has(ep.endpoint))

if (unmappedEndpoints.length > 0) {
  console.log(`\n⚠ ${unmappedEndpoints.length} endpoints using auto-generated schemas (no manual mapping):`)
  for (const ep of unmappedEndpoints) {
    console.log(`  - ${ep.endpoint} (${ep.methods.join(', ')})`)
  }
}

// Check for endpoints with weak catalog types that lack overrides
const WEAK_TYPE_PATTERNS = [/^\{$/, /^[A-Z][a-zA-Z]+$/, /\.\.\./, /\|$/]
const weakEndpoints = publicEndpoints.filter((ep) => {
  if (mappedEndpoints.has(ep.endpoint)) return false
  return ep.parameters.some((p) => WEAK_TYPE_PATTERNS.some((re) => re.test(p.type.trim())))
})

if (weakEndpoints.length > 0) {
  console.log(`\n⚠ ${weakEndpoints.length} endpoints with weak catalog types need overrides:`)
  for (const ep of weakEndpoints) {
    const weakParams = ep.parameters.filter((p) => WEAK_TYPE_PATTERNS.some((re) => re.test(p.type.trim())))
    console.log(`  - ${ep.endpoint}: ${weakParams.map((p) => `${p.name}=${p.type}`).join(', ')}`)
  }
  // Exit with error code if --strict flag is passed (for CI)
  if (process.argv.includes('--strict')) {
    console.error('\n✗ Strict mode: all endpoints must have explicit schema mappings')
    process.exit(1)
  }
}
