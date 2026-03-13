import { z } from 'zod'

// ─── Read-only tools ─────────────────────────────────────────────

export const GetBalanceSchema = z.object({
  creator_id: z.string().optional().describe('Filter to a specific participant'),
})

export const GetAllBalancesSchema = z.object({})

export const GetTransactionsSchema = z.object({
  creator_id: z.string().optional().describe('Filter by creator ID'),
  type: z
    .enum([
      'sale',
      'payout',
      'refund',
      'reversal',
      'fee',
      'adjustment',
      'transfer',
    ])
    .optional()
    .describe('Transaction type filter'),
  status: z
    .enum(['pending', 'completed', 'failed', 'reversed'])
    .optional()
    .describe('Status filter'),
  start_date: z.string().optional().describe('Start date (ISO string)'),
  end_date: z.string().optional().describe('End date (ISO string)'),
  page: z.number().int().positive().optional().describe('Page number'),
  per_page: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Results per page (max 100)'),
  include_entries: z
    .boolean()
    .optional()
    .describe('Include journal entry details'),
})

export const GetTrialBalanceSchema = z.object({
  snapshot: z
    .string()
    .optional()
    .describe('Snapshot ID for historical balance'),
  as_of: z.string().optional().describe('As-of date (ISO string)'),
})

export const GetProfitLossSchema = z.object({
  year: z.number().int().optional().describe('Filter by year'),
  month: z.number().int().min(1).max(12).optional().describe('Month (1-12)'),
  quarter: z
    .number()
    .int()
    .min(1)
    .max(4)
    .optional()
    .describe('Quarter (1-4)'),
  breakdown: z
    .boolean()
    .optional()
    .describe('Include expense breakdown'),
  start_date: z
    .string()
    .optional()
    .describe('Start date (YYYY-MM-DD)'),
  end_date: z.string().optional().describe('End date (YYYY-MM-DD)'),
})

export const GetBalanceSheetSchema = z.object({
  as_of_date: z
    .string()
    .optional()
    .describe('As-of date for balance sheet (YYYY-MM-DD)'),
})

export const HealthCheckSchema = z.object({
  action: z
    .enum(['run', 'status', 'history', 'run_all'])
    .describe('Health check action'),
  ledger_id: z.string().optional().describe('Ledger to check'),
})

export const ExportReportSchema = z.object({
  report_type: z
    .enum([
      'transaction_detail',
      'creator_earnings',
      'platform_revenue',
      'payout_summary',
      'reconciliation',
      'audit_log',
    ])
    .describe('Report type'),
  format: z.enum(['csv', 'json']).describe('Export format'),
  start_date: z
    .string()
    .optional()
    .describe('Start date (YYYY-MM-DD)'),
  end_date: z.string().optional().describe('End date (YYYY-MM-DD)'),
  creator_id: z.string().optional().describe('Filter by creator'),
})

export const ManageWebhooksSchema = z.object({
  action: z
    .enum([
      'list',
      'create',
      'update',
      'delete',
      'test',
      'deliveries',
      'retry',
      'rotate_secret',
    ])
    .describe('Webhook management action'),
  endpoint_id: z
    .string()
    .uuid()
    .optional()
    .describe('Webhook endpoint UUID for update/delete/test/rotate_secret'),
  delivery_id: z
    .string()
    .uuid()
    .optional()
    .describe('Webhook delivery UUID for retry'),
  url: z.string().url().optional().describe('Webhook destination URL'),
  description: z.string().optional().describe('Endpoint description'),
  events: z
    .array(z.string())
    .min(1)
    .optional()
    .describe('Event list (use ["*"] for all events)'),
  is_active: z
    .boolean()
    .optional()
    .describe('Enable or disable endpoint'),
}).superRefine((value, ctx) => {
  if (
    ['update', 'delete', 'test', 'rotate_secret'].includes(value.action) &&
    !value.endpoint_id
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endpoint_id'],
      message: 'endpoint_id is required for this action',
    })
  }

  if (value.action === 'retry' && !value.delivery_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['delivery_id'],
      message: 'delivery_id is required for retry',
    })
  }

  if (value.action === 'create' && !value.url) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['url'],
      message: 'url is required for create',
    })
  }
})

// ─── Write tools ─────────────────────────────────────────────────

export const RecordSaleSchema = z.object({
  reference_id: z.string().describe('Your external sale ID'),
  creator_id: z.string().describe('Creator receiving funds'),
  amount: z.number().int().positive().describe('Sale amount in cents'),
  currency: z.string().optional().describe('Currency code (default: USD)'),
  description: z.string().optional().describe('Sale description'),
  reference_type: z
    .string()
    .optional()
    .describe('Reference type (e.g. "processor_payment", "manual")'),
  processing_fee: z
    .number()
    .int()
    .optional()
    .describe('Processing fee in cents'),
  processing_fee_paid_by: z
    .enum(['platform', 'creator', 'split'])
    .optional()
    .describe('Who pays the processing fee'),
  product_id: z.string().optional().describe('Product identifier'),
  product_name: z.string().optional().describe('Product name'),
  creator_percent: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe('Override revenue split (0-100)'),
  skip_withholding: z
    .boolean()
    .optional()
    .describe('Skip tax withholding'),
  idempotency_key: z
    .string()
    .describe('Unique key to prevent duplicate processing (required)'),
  metadata: z.record(z.unknown()).optional().describe('Additional metadata'),
})

export const ProcessPayoutSchema = z.object({
  creator_id: z.string().describe('Creator to pay'),
  amount: z.number().int().positive().describe('Amount in cents'),
  reference_id: z.string().describe('Unique reference ID for payout'),
  reference_type: z.string().optional().describe('Reference type'),
  description: z.string().optional().describe('Payout description'),
  payout_method: z.string().optional().describe('Payout method'),
  fees: z.number().int().optional().describe('Fees in cents'),
  fees_paid_by: z
    .enum(['platform', 'creator'])
    .optional()
    .describe('Who pays fees'),
  idempotency_key: z
    .string()
    .describe('Unique key to prevent duplicate processing (required)'),
  metadata: z.record(z.unknown()).optional().describe('Additional metadata'),
})

export const RecordRefundSchema = z.object({
  original_sale_reference: z
    .string()
    .describe('Reference ID of original sale'),
  reason: z.string().describe('Refund reason (required for audit)'),
  amount: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Amount in cents (defaults to full sale)'),
  refund_from: z
    .enum(['both', 'platform_only', 'creator_only'])
    .optional()
    .describe('Who absorbs the refund'),
  external_refund_id: z.string().optional().describe('External refund ID'),
  idempotency_key: z
    .string()
    .describe('Unique key to prevent duplicate processing (required)'),
  mode: z
    .enum(['ledger_only', 'processor_refund'])
    .optional()
    .describe('Refund mode'),
  processor_payment_id: z
    .string()
    .optional()
    .describe('Processor payment ID to refund'),
  metadata: z.record(z.unknown()).optional().describe('Additional metadata'),
})

export const ReverseTransactionSchema = z.object({
  transaction_id: z.string().uuid().describe('Transaction UUID to reverse'),
  reason: z.string().describe('Reason for reversal (required for audit)'),
  partial_amount: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Partial reversal amount in cents'),
  idempotency_key: z
    .string()
    .describe('Unique key to prevent duplicate processing (required)'),
  metadata: z.record(z.unknown()).optional().describe('Additional metadata'),
})

export const CreateCreatorSchema = z.object({
  creator_id: z.string().describe('Unique creator identifier'),
  display_name: z.string().optional().describe('Display name'),
  email: z.string().email().optional().describe('Email address'),
  default_split_percent: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe('Default revenue split (0-100)'),
  tax_info: z
    .object({
      tax_id_type: z.enum(['ssn', 'ein', 'itin']).optional(),
      tax_id_last4: z.string().optional(),
      legal_name: z.string().optional(),
      business_type: z
        .enum([
          'individual',
          'sole_proprietor',
          'llc',
          'corporation',
          'partnership',
        ])
        .optional(),
      address: z
        .object({
          line1: z.string().optional(),
          line2: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          postal_code: z.string().optional(),
          country: z.string().optional(),
        })
        .optional(),
    })
    .optional()
    .describe('Tax information'),
  payout_preferences: z
    .record(z.unknown())
    .optional()
    .describe('Payout preferences'),
  idempotency_key: z
    .string()
    .describe('Unique key to prevent duplicate processing (required)'),
  metadata: z.record(z.unknown()).optional().describe('Additional metadata'),
})

export const CreateCheckoutSchema = z.object({
  amount: z.number().int().positive().describe('Amount in cents'),
  creator_id: z.string().describe('Creator receiving funds'),
  currency: z.string().optional().describe('Currency code (default: USD)'),
  product_id: z.string().optional().describe('Product identifier'),
  product_name: z.string().optional().describe('Product name'),
  customer_email: z.string().email().optional().describe('Customer email'),
  customer_id: z.string().optional().describe('Customer ID'),
  payment_method_id: z
    .string()
    .optional()
    .describe('Payment instrument ID for direct charge'),
  idempotency_key: z
    .string()
    .describe('Unique key to prevent duplicate processing (required)'),
  success_url: z
    .string()
    .url()
    .optional()
    .describe('Redirect URL after success'),
  cancel_url: z
    .string()
    .url()
    .optional()
    .describe('Redirect URL if cancelled'),
  metadata: z.record(z.unknown()).optional().describe('Additional metadata'),
})

export const RecordAdjustmentSchema = z.object({
  adjustment_type: z
    .enum([
      'correction',
      'reclassification',
      'accrual',
      'deferral',
      'depreciation',
      'write_off',
      'year_end',
      'opening_balance',
      'other',
    ])
    .describe('Adjustment type'),
  entries: z
    .array(
      z.object({
        account_type: z.string().describe('Account type'),
        entity_id: z.string().optional().describe('Entity ID'),
        entry_type: z.enum(['debit', 'credit']).describe('Debit or credit'),
        amount: z.number().int().positive().describe('Amount in cents'),
      }),
    )
    .min(2)
    .describe('Journal entries (min 2, must balance)'),
  reason: z.string().describe('Reason for adjustment (required for audit)'),
  adjustment_date: z
    .string()
    .optional()
    .describe('Adjustment date (YYYY-MM-DD)'),
  original_transaction_id: z
    .string()
    .uuid()
    .optional()
    .describe('Original transaction being corrected'),
  supporting_documentation: z
    .string()
    .optional()
    .describe('Supporting documentation'),
  prepared_by: z.string().describe('Person who prepared adjustment'),
  idempotency_key: z
    .string()
    .describe('Unique key to prevent duplicate processing (required)'),
  metadata: z.record(z.unknown()).optional().describe('Additional metadata'),
})

export const ClosePeriodSchema = z.object({
  year: z.number().int().describe('Fiscal year to close'),
  month: z
    .number()
    .int()
    .min(1)
    .max(12)
    .optional()
    .describe('Month for monthly close (1-12)'),
  quarter: z
    .number()
    .int()
    .min(1)
    .max(4)
    .optional()
    .describe('Quarter for quarterly close (1-4)'),
  notes: z.string().optional().describe('Notes on period closure'),
  idempotency_key: z
    .string()
    .describe('Unique key to prevent duplicate processing (required)'),
})
