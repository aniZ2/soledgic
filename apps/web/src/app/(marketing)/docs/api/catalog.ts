export type ApiParameter = {
  in: 'query' | 'body' | 'path'
  name: string
  type: string
  required: boolean
}

export type ApiEndpointDoc = {
  endpoint: string
  title: string
  path: string
  methods: string[]
  auth: 'API key' | 'Public/JWT' | 'Webhook signature' | 'Custom/internal'
  internal: boolean
  deprecated: boolean
  description: string
  source: string
  parameters: ApiParameter[]
}

const TREASURY_RESOURCE_ENDPOINTS: ApiEndpointDoc[] = [
  {
    endpoint: 'participants',
    title: 'Participants',
    path: '/v1/participants',
    methods: ['GET', 'POST'],
    auth: 'API key',
    internal: false,
    deprecated: false,
    description: 'List treasury participants or create a new participant-backed account.',
    source: 'supabase/functions/participants/index.ts',
    parameters: [
      { in: 'body', name: 'participant_id', type: 'string', required: true },
      { in: 'body', name: 'user_id', type: 'string', required: false },
      { in: 'body', name: 'display_name', type: 'string', required: false },
      { in: 'body', name: 'email', type: 'string', required: false },
      { in: 'body', name: 'default_split_percent', type: 'number', required: false },
      { in: 'body', name: 'tax_info', type: '{', required: false },
      { in: 'body', name: 'payout_preferences', type: '{', required: false },
      { in: 'body', name: 'metadata', type: 'Record<string, unknown>', required: false },
    ],
  },
  {
    endpoint: 'participant-detail',
    title: 'Participant Detail',
    path: '/v1/participants/{participant_id}',
    methods: ['GET'],
    auth: 'API key',
    internal: false,
    deprecated: false,
    description: 'Get a participant balance snapshot, including active holds.',
    source: 'supabase/functions/participants/index.ts',
    parameters: [
      { in: 'path', name: 'participant_id', type: 'string', required: true },
    ],
  },
  {
    endpoint: 'participant-payout-eligibility',
    title: 'Participant Payout Eligibility',
    path: '/v1/participants/{participant_id}/payout-eligibility',
    methods: ['GET'],
    auth: 'API key',
    internal: false,
    deprecated: false,
    description: 'Check whether a participant is currently eligible for payout.',
    source: 'supabase/functions/participants/index.ts',
    parameters: [
      { in: 'path', name: 'participant_id', type: 'string', required: true },
    ],
  },
  {
    endpoint: 'wallet-detail',
    title: 'Wallet Detail',
    path: '/v1/wallets/{participant_id}',
    methods: ['GET'],
    auth: 'API key',
    internal: false,
    deprecated: false,
    description: 'Get the wallet balance for a participant.',
    source: 'supabase/functions/wallets/index.ts',
    parameters: [
      { in: 'path', name: 'participant_id', type: 'string', required: true },
    ],
  },
  {
    endpoint: 'wallet-entries',
    title: 'Wallet Entries',
    path: '/v1/wallets/{participant_id}/entries',
    methods: ['GET'],
    auth: 'API key',
    internal: false,
    deprecated: false,
    description: 'List wallet ledger entries for a participant.',
    source: 'supabase/functions/wallets/index.ts',
    parameters: [
      { in: 'path', name: 'participant_id', type: 'string', required: true },
      { in: 'query', name: 'limit', type: 'number', required: false },
      { in: 'query', name: 'offset', type: 'number', required: false },
    ],
  },
  {
    endpoint: 'wallet-deposit',
    title: 'Wallet Deposit',
    path: '/v1/wallets/{participant_id}/deposits',
    methods: ['POST'],
    auth: 'API key',
    internal: false,
    deprecated: false,
    description: 'Deposit funds into a participant wallet.',
    source: 'supabase/functions/wallets/index.ts',
    parameters: [
      { in: 'path', name: 'participant_id', type: 'string', required: true },
      { in: 'body', name: 'amount', type: 'number', required: true },
      { in: 'body', name: 'reference_id', type: 'string', required: true },
      { in: 'body', name: 'description', type: 'string', required: false },
      { in: 'body', name: 'metadata', type: 'Record<string, unknown>', required: false },
    ],
  },
  {
    endpoint: 'wallet-withdrawal',
    title: 'Wallet Withdrawal',
    path: '/v1/wallets/{participant_id}/withdrawals',
    methods: ['POST'],
    auth: 'API key',
    internal: false,
    deprecated: false,
    description: 'Withdraw funds from a participant wallet.',
    source: 'supabase/functions/wallets/index.ts',
    parameters: [
      { in: 'path', name: 'participant_id', type: 'string', required: true },
      { in: 'body', name: 'amount', type: 'number', required: true },
      { in: 'body', name: 'reference_id', type: 'string', required: true },
      { in: 'body', name: 'description', type: 'string', required: false },
      { in: 'body', name: 'metadata', type: 'Record<string, unknown>', required: false },
    ],
  },
  {
    endpoint: 'transfers',
    title: 'Transfers',
    path: '/v1/transfers',
    methods: ['POST'],
    auth: 'API key',
    internal: false,
    deprecated: false,
    description: 'Move funds between participant wallets.',
    source: 'supabase/functions/transfers/index.ts',
    parameters: [
      { in: 'body', name: 'from_participant_id', type: 'string', required: true },
      { in: 'body', name: 'to_participant_id', type: 'string', required: true },
      { in: 'body', name: 'amount', type: 'number', required: true },
      { in: 'body', name: 'reference_id', type: 'string', required: true },
      { in: 'body', name: 'description', type: 'string', required: false },
      { in: 'body', name: 'metadata', type: 'Record<string, unknown>', required: false },
    ],
  },
  {
    endpoint: 'holds',
    title: 'Holds',
    path: '/v1/holds',
    methods: ['GET'],
    auth: 'API key',
    internal: false,
    deprecated: false,
    description: 'List held funds across participants, with optional readiness filtering.',
    source: 'supabase/functions/holds/index.ts',
    parameters: [
      { in: 'query', name: 'participant_id', type: 'string', required: false },
      { in: 'query', name: 'venture_id', type: 'string', required: false },
      { in: 'query', name: 'ready_only', type: 'boolean', required: false },
      { in: 'query', name: 'limit', type: 'number', required: false },
    ],
  },
  {
    endpoint: 'holds-summary',
    title: 'Holds Summary',
    path: '/v1/holds/summary',
    methods: ['GET'],
    auth: 'API key',
    internal: false,
    deprecated: false,
    description: 'Get an aggregate summary of held and releasable funds.',
    source: 'supabase/functions/holds/index.ts',
    parameters: [],
  },
  {
    endpoint: 'hold-release',
    title: 'Release Hold',
    path: '/v1/holds/{hold_id}/release',
    methods: ['POST'],
    auth: 'API key',
    internal: false,
    deprecated: false,
    description: 'Release a held-funds entry and optionally execute the transfer.',
    source: 'supabase/functions/holds/index.ts',
    parameters: [
      { in: 'path', name: 'hold_id', type: 'string', required: true },
      { in: 'body', name: 'execute_transfer', type: 'boolean', required: false },
    ],
  },
  {
    endpoint: 'checkout-sessions',
    title: 'Checkout Sessions',
    path: '/v1/checkout-sessions',
    methods: ['POST'],
    auth: 'API key',
    internal: false,
    deprecated: false,
    description: 'Create a hosted or direct checkout session for a participant sale.',
    source: 'supabase/functions/checkout-sessions/index.ts',
    parameters: [
      { in: 'body', name: 'participant_id', type: 'string', required: true },
      { in: 'body', name: 'amount', type: 'number', required: true },
      { in: 'body', name: 'currency', type: 'string', required: false },
      { in: 'body', name: 'product_id', type: 'string', required: false },
      { in: 'body', name: 'product_name', type: 'string', required: false },
      { in: 'body', name: 'customer_email', type: 'string', required: false },
      { in: 'body', name: 'customer_id', type: 'string', required: false },
      { in: 'body', name: 'payment_method_id', type: 'string', required: false },
      { in: 'body', name: 'source_id', type: 'string', required: false },
      { in: 'body', name: 'success_url', type: 'string', required: false },
      { in: 'body', name: 'cancel_url', type: 'string', required: false },
      { in: 'body', name: 'idempotency_key', type: 'string', required: false },
      { in: 'body', name: 'metadata', type: 'Record<string, string>', required: false },
    ],
  },
  {
    endpoint: 'payouts',
    title: 'Payouts',
    path: '/v1/payouts',
    methods: ['POST'],
    auth: 'API key',
    internal: false,
    deprecated: false,
    description: 'Create a payout for a participant.',
    source: 'supabase/functions/payouts/index.ts',
    parameters: [
      { in: 'body', name: 'participant_id', type: 'string', required: true },
      { in: 'body', name: 'amount', type: 'number', required: true },
      { in: 'body', name: 'reference_id', type: 'string', required: true },
      { in: 'body', name: 'reference_type', type: 'string', required: false },
      { in: 'body', name: 'description', type: 'string', required: false },
      { in: 'body', name: 'payout_method', type: 'string', required: false },
      { in: 'body', name: 'fees', type: 'number', required: false },
      { in: 'body', name: 'fees_paid_by', type: "'platform' | 'creator'", required: false },
      { in: 'body', name: 'metadata', type: 'Record<string, unknown>', required: false },
    ],
  },
  {
    endpoint: 'refunds',
    title: 'Refunds',
    path: '/v1/refunds',
    methods: ['GET', 'POST'],
    auth: 'API key',
    internal: false,
    deprecated: false,
    description: 'List refunds or create a refund against a recorded sale.',
    source: 'supabase/functions/refunds/index.ts',
    parameters: [
      { in: 'query', name: 'sale_reference', type: 'string', required: false },
      { in: 'query', name: 'limit', type: 'number', required: false },
      { in: 'body', name: 'sale_reference', type: 'string', required: true },
      { in: 'body', name: 'reason', type: 'string', required: true },
      { in: 'body', name: 'amount', type: 'number', required: false },
      { in: 'body', name: 'refund_from', type: "'both' | 'platform_only' | 'creator_only'", required: false },
      { in: 'body', name: 'external_refund_id', type: 'string', required: false },
      { in: 'body', name: 'idempotency_key', type: 'string', required: false },
      { in: 'body', name: 'mode', type: "'ledger_only' | 'processor_refund'", required: false },
      { in: 'body', name: 'processor_payment_id', type: 'string', required: false },
      { in: 'body', name: 'metadata', type: 'Record<string, unknown>', required: false },
    ],
  },
]

const RAW_API_ENDPOINT_CATALOG: ApiEndpointDoc[] = [
  ...TREASURY_RESOURCE_ENDPOINTS,
  {
    "endpoint": "ap-aging",
    "title": "Ap Aging",
    "path": "/v1/ap-aging",
    "methods": [
      "GET"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Accounts Payable Aging Report",
    "source": "supabase/functions/ap-aging/index.ts",
    "parameters": [
      {
        "in": "query",
        "name": "as_of_date",
        "type": "string",
        "required": false
      }
    ]
  },
  {
    "endpoint": "ar-aging",
    "title": "Ar Aging",
    "path": "/v1/ar-aging",
    "methods": [
      "GET"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Accounts Receivable Aging Report",
    "source": "supabase/functions/ar-aging/index.ts",
    "parameters": [
      {
        "in": "query",
        "name": "as_of_date",
        "type": "string",
        "required": false
      }
    ]
  },
  {
    "endpoint": "balance-sheet",
    "title": "Balance Sheet",
    "path": "/v1/balance-sheet",
    "methods": [
      "GET"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Balance Sheet Report",
    "source": "supabase/functions/balance-sheet/index.ts",
    "parameters": [
      {
        "in": "query",
        "name": "as_of_date",
        "type": "string",
        "required": false
      }
    ]
  },
  {
    "endpoint": "billing",
    "title": "Billing",
    "path": "/v1/billing",
    "methods": [
      "POST"
    ],
    "auth": "Public/JWT",
    "internal": false,
    "deprecated": false,
    "description": "Usage-based billing summary (overages). Subscription actions are disabled.",
    "source": "supabase/functions/billing/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "action",
        "type": "'get_subscription' | 'get_usage' | 'get_plans' | 'get_invoices' | 'get_payment_methods'",
        "required": true
      },
      {
        "in": "body",
        "name": "organization_id",
        "type": "string",
        "required": false
      }
    ]
  },
  {
    "endpoint": "close-period",
    "title": "Close Period",
    "path": "/v1/close-period",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Close Accounting Period",
    "source": "supabase/functions/close-period/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "year",
        "type": "number",
        "required": true
      },
      {
        "in": "body",
        "name": "month",
        "type": "number",
        "required": false
      },
      {
        "in": "body",
        "name": "quarter",
        "type": "number",
        "required": false
      },
      {
        "in": "body",
        "name": "notes",
        "type": "string",
        "required": false
      }
    ]
  },
  {
    "endpoint": "configure-alerts",
    "title": "Configure Alerts",
    "path": "/v1/configure-alerts",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Configure Alerts",
    "source": "supabase/functions/configure-alerts/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "action",
        "type": "'list' | 'create' | 'update' | 'delete' | 'test'",
        "required": true
      },
      {
        "in": "body",
        "name": "config_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "alert_type",
        "type": "'breach_risk' | 'projection_created' | 'instrument_invalidated'",
        "required": false
      },
      {
        "in": "body",
        "name": "channel",
        "type": "'slack' | 'email' | 'webhook'",
        "required": false
      },
      {
        "in": "body",
        "name": "config",
        "type": "{",
        "required": false
      },
      {
        "in": "body",
        "name": "webhook_url",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "channel",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "recipients",
        "type": "string[]",
        "required": false
      },
      {
        "in": "body",
        "name": "thresholds",
        "type": "{",
        "required": false
      },
      {
        "in": "body",
        "name": "coverage_ratio_below",
        "type": "number",
        "required": false
      },
      {
        "in": "body",
        "name": "shortfall_above",
        "type": "number",
        "required": false
      },
      {
        "in": "body",
        "name": "is_active",
        "type": "boolean",
        "required": false
      },
      {
        "in": "body",
        "name": "limit",
        "type": "number",
        "required": false
      }
    ]
  },
  {
    "endpoint": "configure-risk-policy",
    "title": "Configure Risk Policy",
    "path": "/v1/configure-risk-policy",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": true,
    "description": "Configure Risk Policy",
    "source": "supabase/functions/configure-risk-policy/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "action",
        "type": "'create' | 'list' | 'delete'",
        "required": true
      },
      {
        "in": "body",
        "name": "policy_type",
        "type": "'require_instrument' | 'budget_cap' | 'projection_guard'",
        "required": false
      },
      {
        "in": "body",
        "name": "config",
        "type": "Record<string, any>",
        "required": false
      },
      {
        "in": "body",
        "name": "severity",
        "type": "'hard' | 'soft'",
        "required": false
      },
      {
        "in": "body",
        "name": "priority",
        "type": "number",
        "required": false
      },
      {
        "in": "body",
        "name": "policy_id",
        "type": "string",
        "required": false
      }
    ]
  },
  {
    "endpoint": "create-ledger",
    "title": "Create Ledger",
    "path": "/v1/create-ledger",
    "methods": [
      "POST"
    ],
    "auth": "Public/JWT",
    "internal": false,
    "deprecated": false,
    "description": "Create Ledger",
    "source": "supabase/functions/create-ledger/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "business_name",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "owner_email",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "ledger_mode",
        "type": "'standard' | 'marketplace' | 'platform'",
        "required": false
      },
      {
        "in": "body",
        "name": "settings",
        "type": "{",
        "required": false
      },
      {
        "in": "body",
        "name": "default_tax_rate",
        "type": "number",
        "required": false
      },
      {
        "in": "body",
        "name": "fiscal_year_start",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "receipt_threshold",
        "type": "number",
        "required": false
      },
      {
        "in": "body",
        "name": "default_split_percent",
        "type": "number",
        "required": false
      },
      {
        "in": "body",
        "name": "platform_fee_percent",
        "type": "number",
        "required": false
      },
      {
        "in": "body",
        "name": "min_payout_amount",
        "type": "number",
        "required": false
      },
      {
        "in": "body",
        "name": "payout_schedule",
        "type": "'manual' | 'weekly' | 'monthly'",
        "required": false
      },
      {
        "in": "body",
        "name": "tax_withholding_percent",
        "type": "number",
        "required": false
      },
      {
        "in": "body",
        "name": "currency",
        "type": "string",
        "required": false
      }
    ]
  },
  {
    "endpoint": "delete-creator",
    "title": "Delete Creator",
    "path": "/v1/delete-creator",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Soft-delete a creator (sets is_active = false with transaction guard)",
    "source": "supabase/functions/delete-creator/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "creator_id",
        "type": "string",
        "required": true
      }
    ]
  },
  {
    "endpoint": "execute-payout",
    "title": "Execute Payout",
    "path": "/v1/execute-payout",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Soledgic Processor Adapter",
    "source": "supabase/functions/execute-payout/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "action",
        "type": "'execute' | 'batch_execute' | 'get_status' | 'configure_rail' | 'list_rails' ...",
        "required": true
      },
      {
        "in": "body",
        "name": "payout_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "payout_ids",
        "type": "string[]",
        "required": false
      },
      {
        "in": "body",
        "name": "rail",
        "type": "PayoutRail",
        "required": false
      },
      {
        "in": "body",
        "name": "rail_config",
        "type": "RailConfig",
        "required": false
      }
    ]
  },
  {
    "endpoint": "export-report",
    "title": "Export Report",
    "path": "/v1/export-report",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Export Report",
    "source": "supabase/functions/export-report/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "report_type",
        "type": "'transaction_detail' | 'creator_earnings' | 'platform_revenue' |",
        "required": true
      },
      {
        "in": "body",
        "name": "format",
        "type": "'csv' | 'json'",
        "required": true
      },
      {
        "in": "body",
        "name": "start_date",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "end_date",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "creator_id",
        "type": "string",
        "required": false
      }
    ]
  },
  {
    "endpoint": "frozen-statements",
    "title": "Frozen Statements",
    "path": "/v1/frozen-statements",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Frozen Statements",
    "source": "supabase/functions/frozen-statements/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "action",
        "type": "Action",
        "required": true
      },
      {
        "in": "body",
        "name": "period_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "statement_type",
        "type": "StatementType",
        "required": false
      }
    ]
  },
  {
    "endpoint": "generate-pdf",
    "title": "Generate Pdf",
    "path": "/v1/generate-pdf",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Generate PDF Reports",
    "source": "supabase/functions/generate-pdf/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "report_type",
        "type": "ReportType",
        "required": true
      },
      {
        "in": "body",
        "name": "period_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "creator_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "start_date",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "end_date",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "tax_year",
        "type": "number",
        "required": false
      },
      {
        "in": "body",
        "name": "ledger_id",
        "type": "string",
        "required": false
      }
    ]
  },
  {
    "endpoint": "generate-report",
    "title": "Generate Report",
    "path": "/v1/generate-report",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Generate Report",
    "source": "supabase/functions/generate-report/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "report_type",
        "type": "ReportType",
        "required": true
      },
      {
        "in": "body",
        "name": "start_date",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "end_date",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "creator_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "format",
        "type": "'json' | 'csv'",
        "required": false
      }
    ]
  },
  {
    "endpoint": "generate-tax-summary",
    "title": "Generate Tax Summary",
    "path": "/v1/generate-tax-summary",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": true,
    "description": "Generate Tax Summary",
    "source": "supabase/functions/generate-tax-summary/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "tax_year",
        "type": "number",
        "required": true
      },
      {
        "in": "body",
        "name": "creator_id",
        "type": "string",
        "required": false
      }
    ]
  },
  {
    "endpoint": "get-runway",
    "title": "Get Runway",
    "path": "/v1/get-runway",
    "methods": [
      "GET"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Get Runway",
    "source": "supabase/functions/get-runway/index.ts",
    "parameters": []
  },
  {
    "endpoint": "get-transactions",
    "title": "Get Transactions",
    "path": "/v1/get-transactions",
    "methods": [
      "GET"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Get Transactions",
    "source": "supabase/functions/get-transactions/index.ts",
    "parameters": [
      {
        "in": "query",
        "name": "creator_id",
        "type": "string",
        "required": false
      },
      {
        "in": "query",
        "name": "type",
        "type": "string",
        "required": false
      },
      {
        "in": "query",
        "name": "status",
        "type": "string",
        "required": false
      },
      {
        "in": "query",
        "name": "start_date",
        "type": "string",
        "required": false
      },
      {
        "in": "query",
        "name": "end_date",
        "type": "string",
        "required": false
      },
      {
        "in": "query",
        "name": "page",
        "type": "string",
        "required": false
      },
      {
        "in": "query",
        "name": "per_page",
        "type": "string",
        "required": false
      },
      {
        "in": "query",
        "name": "include_entries",
        "type": "string",
        "required": false
      }
    ]
  },
  {
    "endpoint": "health-check",
    "title": "Health Check",
    "path": "/v1/health-check",
    "methods": [
      "POST"
    ],
    "auth": "Public/JWT",
    "internal": true,
    "deprecated": false,
    "description": "Health Check",
    "source": "supabase/functions/health-check/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "action",
        "type": "'run' | 'status' | 'history' | 'run_all'",
        "required": true
      },
      {
        "in": "body",
        "name": "ledger_id",
        "type": "string",
        "required": false
      }
    ]
  },
  {
    "endpoint": "import-bank-statement",
    "title": "Import Bank Statement",
    "path": "/v1/import-bank-statement",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Import Bank Statement",
    "source": "supabase/functions/import-bank-statement/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "bank_account_id",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "lines",
        "type": "BankStatementLine[]",
        "required": true
      },
      {
        "in": "body",
        "name": "auto_match",
        "type": "boolean",
        "required": false
      }
    ]
  },
  {
    "endpoint": "import-transactions",
    "title": "Import Transactions",
    "path": "/v1/import-transactions",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Import Transactions",
    "source": "supabase/functions/import-transactions/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "action",
        "type": "'parse_preview' | 'import' | 'get_templates' | 'save_template'",
        "required": true
      },
      {
        "in": "body",
        "name": "format",
        "type": "'csv' | 'ofx' | 'qfx' | 'auto'",
        "required": false
      },
      {
        "in": "body",
        "name": "data",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "mapping",
        "type": "ColumnMapping",
        "required": false
      },
      {
        "in": "body",
        "name": "template_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "template",
        "type": "ImportTemplate",
        "required": false
      },
      {
        "in": "body",
        "name": "transactions",
        "type": "ParsedTransaction[]",
        "required": false
      },
      {
        "in": "body",
        "name": "account_name",
        "type": "string",
        "required": false
      }
    ]
  },
  {
    "endpoint": "invoices",
    "title": "Invoices",
    "path": "/v1/invoices",
    "methods": [
      "GET",
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Invoice Management",
    "source": "supabase/functions/invoices/index.ts",
    "parameters": [
      {
        "in": "query",
        "name": "status",
        "type": "string",
        "required": false
      },
      {
        "in": "query",
        "name": "customer_id",
        "type": "string",
        "required": false
      },
      {
        "in": "query",
        "name": "limit",
        "type": "string",
        "required": false
      },
      {
        "in": "query",
        "name": "offset",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "customer_name",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "customer_email",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "customer_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "customer_address",
        "type": "{",
        "required": false
      },
      {
        "in": "body",
        "name": "line1",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "line2",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "city",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "state",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "postal_code",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "country",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "line_items",
        "type": "InvoiceLineItem[]",
        "required": true
      },
      {
        "in": "body",
        "name": "due_date",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "notes",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "terms",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "reference_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "metadata",
        "type": "Record<string, any>",
        "required": false
      }
    ]
  },
  {
    "endpoint": "list-ledgers",
    "title": "List Ledgers",
    "path": "/v1/list-ledgers",
    "methods": [
      "GET"
    ],
    "auth": "Public/JWT",
    "internal": false,
    "deprecated": false,
    "description": "List Ledgers",
    "source": "supabase/functions/list-ledgers/index.ts",
    "parameters": []
  },
  {
    "endpoint": "manage-bank-accounts",
    "title": "Manage Bank Accounts",
    "path": "/v1/manage-bank-accounts",
    "methods": [
      "GET",
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Manage Bank Accounts",
    "source": "supabase/functions/manage-bank-accounts/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "bank_name",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "account_name",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "account_type",
        "type": "'checking' | 'savings' | 'credit_card' | 'other'",
        "required": true
      },
      {
        "in": "body",
        "name": "account_last_four",
        "type": "string",
        "required": false
      }
    ]
  },
  {
    "endpoint": "manage-budgets",
    "title": "Manage Budgets",
    "path": "/v1/manage-budgets",
    "methods": [
      "GET",
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Manage Budgets",
    "source": "supabase/functions/manage-budgets/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "name",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "category_code",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "budget_amount",
        "type": "number",
        "required": true
      },
      {
        "in": "body",
        "name": "budget_period",
        "type": "'weekly' | 'monthly' | 'quarterly' | 'annual'",
        "required": true
      },
      {
        "in": "body",
        "name": "alert_at_percentage",
        "type": "number",
        "required": false
      }
    ]
  },
  {
    "endpoint": "manage-contractors",
    "title": "Manage Contractors",
    "path": "/v1/manage-contractors",
    "methods": [
      "GET",
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Manage Contractors",
    "source": "supabase/functions/manage-contractors/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "contractor_id",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "amount",
        "type": "number",
        "required": true
      },
      {
        "in": "body",
        "name": "payment_date",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "payment_method",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "payment_reference",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "description",
        "type": "string",
        "required": false
      }
    ]
  },
  {
    "endpoint": "manage-recurring",
    "title": "Manage Recurring",
    "path": "/v1/manage-recurring",
    "methods": [
      "GET",
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Manage Recurring Expenses",
    "source": "supabase/functions/manage-recurring/index.ts",
    "parameters": [
      {
        "in": "query",
        "name": "days",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "name",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "merchant_name",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "category_code",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "amount",
        "type": "number",
        "required": true
      },
      {
        "in": "body",
        "name": "recurrence_interval",
        "type": "'weekly' | 'monthly' | 'quarterly' | 'annual'",
        "required": true
      },
      {
        "in": "body",
        "name": "recurrence_day",
        "type": "number",
        "required": false
      },
      {
        "in": "body",
        "name": "start_date",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "end_date",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "business_purpose",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "is_variable_amount",
        "type": "boolean",
        "required": false
      }
    ]
  },
  {
    "endpoint": "manage-splits",
    "title": "Manage Splits",
    "path": "/v1/manage-splits",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Manage Splits",
    "source": "supabase/functions/manage-splits/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "action",
        "type": "Action",
        "required": true
      },
      {
        "in": "body",
        "name": "creator_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "creator_percent",
        "type": "number",
        "required": false
      },
      {
        "in": "body",
        "name": "product_id",
        "type": "string",
        "required": false
      }
    ]
  },
  {
    "endpoint": "pay-bill",
    "title": "Pay Bill",
    "path": "/v1/pay-bill",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Records payment of a bill (reduces A/P, reduces Cash)",
    "source": "supabase/functions/pay-bill/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "bill_transaction_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "amount",
        "type": "number",
        "required": true
      },
      {
        "in": "body",
        "name": "vendor_name",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "reference_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "payment_method",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "payment_date",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "metadata",
        "type": "Record<string, any>",
        "required": false
      }
    ]
  },
  {
    "endpoint": "preflight-authorization",
    "title": "Preflight Authorization",
    "path": "/v1/preflight-authorization",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Preflight Authorization",
    "source": "supabase/functions/preflight-authorization/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "idempotency_key",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "amount",
        "type": "number",
        "required": true
      },
      {
        "in": "body",
        "name": "currency",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "counterparty_name",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "authorizing_instrument_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "expected_date",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "category",
        "type": "string",
        "required": false
      }
    ]
  },
  {
    "endpoint": "process-webhooks",
    "title": "Process Webhooks",
    "path": "/v1/process-webhooks",
    "methods": [
      "POST"
    ],
    "auth": "Custom/internal",
    "internal": true,
    "deprecated": false,
    "description": "Process Webhooks",
    "source": "supabase/functions/process-webhooks/index.ts",
    "parameters": []
  },
  {
    "endpoint": "profit-loss",
    "title": "Profit Loss",
    "path": "/v1/profit-loss",
    "methods": [
      "GET",
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Profit & Loss Report",
    "source": "supabase/functions/profit-loss/index.ts",
    "parameters": [
      {
        "in": "query",
        "name": "year",
        "type": "string",
        "required": false
      },
      {
        "in": "query",
        "name": "month",
        "type": "string",
        "required": false
      },
      {
        "in": "query",
        "name": "quarter",
        "type": "string",
        "required": false
      },
      {
        "in": "query",
        "name": "breakdown",
        "type": "string",
        "required": false
      },
      {
        "in": "query",
        "name": "start_date",
        "type": "string",
        "required": false
      },
      {
        "in": "query",
        "name": "end_date",
        "type": "string",
        "required": false
      }
    ]
  },
  {
    "endpoint": "project-intent",
    "title": "Project Intent",
    "path": "/v1/project-intent",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Project Intent",
    "source": "supabase/functions/project-intent/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "authorizing_instrument_id",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "until_date",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "horizon_count",
        "type": "number",
        "required": false
      }
    ]
  },
  {
    "endpoint": "receive-payment",
    "title": "Receive Payment",
    "path": "/v1/receive-payment",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Receive Payment",
    "source": "supabase/functions/receive-payment/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "invoice_transaction_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "amount",
        "type": "number",
        "required": true
      },
      {
        "in": "body",
        "name": "customer_name",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "customer_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "reference_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "payment_method",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "payment_date",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "metadata",
        "type": "Record<string, any>",
        "required": false
      }
    ]
  },
  {
    "endpoint": "reconcile",
    "title": "Reconcile",
    "path": "/v1/reconcile",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": true,
    "description": "Reconciliation",
    "source": "supabase/functions/reconcile/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "action",
        "type": "Action",
        "required": true
      },
      {
        "in": "body",
        "name": "transaction_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "bank_transaction_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "period_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "as_of_date",
        "type": "string",
        "required": false
      }
    ]
  },
  {
    "endpoint": "record-adjustment",
    "title": "Record Adjustment",
    "path": "/v1/record-adjustment",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Record Adjustment Journal",
    "source": "supabase/functions/record-adjustment/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "adjustment_type",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "adjustment_date",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "entries",
        "type": "AdjustmentEntry[]",
        "required": true
      },
      {
        "in": "body",
        "name": "reason",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "original_transaction_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "supporting_documentation",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "prepared_by",
        "type": "string",
        "required": true
      }
    ]
  },
  {
    "endpoint": "record-bill",
    "title": "Record Bill",
    "path": "/v1/record-bill",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Record Bill",
    "source": "supabase/functions/record-bill/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "amount",
        "type": "number",
        "required": true
      },
      {
        "in": "body",
        "name": "description",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "vendor_name",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "vendor_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "reference_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "due_date",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "expense_category",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "paid",
        "type": "boolean",
        "required": false
      },
      {
        "in": "body",
        "name": "metadata",
        "type": "Record<string, any>",
        "required": false
      },
      {
        "in": "body",
        "name": "authorizing_instrument_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "risk_evaluation_id",
        "type": "string",
        "required": false
      }
    ]
  },
  {
    "endpoint": "record-expense",
    "title": "Record Expense",
    "path": "/v1/record-expense",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Record Expense",
    "source": "supabase/functions/record-expense/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "reference_id",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "amount",
        "type": "number",
        "required": true
      },
      {
        "in": "body",
        "name": "description",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "category",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "vendor_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "vendor_name",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "paid_from",
        "type": "'cash' | 'credit_card' | string",
        "required": false
      },
      {
        "in": "body",
        "name": "receipt_url",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "tax_deductible",
        "type": "boolean",
        "required": false
      },
      {
        "in": "body",
        "name": "metadata",
        "type": "Record<string, any>",
        "required": false
      },
      {
        "in": "body",
        "name": "authorizing_instrument_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "risk_evaluation_id",
        "type": "string",
        "required": false
      }
    ]
  },
  {
    "endpoint": "record-income",
    "title": "Record Income",
    "path": "/v1/record-income",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Record Income",
    "source": "supabase/functions/record-income/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "reference_id",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "amount",
        "type": "number",
        "required": true
      },
      {
        "in": "body",
        "name": "description",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "category",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "customer_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "customer_name",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "received_to",
        "type": "'cash' | string",
        "required": false
      },
      {
        "in": "body",
        "name": "invoice_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "metadata",
        "type": "Record<string, any>",
        "required": false
      }
    ]
  },
  {
    "endpoint": "record-opening-balance",
    "title": "Record Opening Balance",
    "path": "/v1/record-opening-balance",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Record Opening Balances",
    "source": "supabase/functions/record-opening-balance/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "as_of_date",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "source",
        "type": "'manual' | 'imported' | 'migrated' | 'year_start'",
        "required": true
      },
      {
        "in": "body",
        "name": "source_description",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "balances",
        "type": "OpeningBalanceEntry[]",
        "required": true
      }
    ]
  },
  {
    "endpoint": "record-sale",
    "title": "Record Sale",
    "path": "/v1/record-sale",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Record Sale",
    "source": "supabase/functions/record-sale/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "reference_id",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "creator_id",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "amount",
        "type": "number",
        "required": true
      },
      {
        "in": "body",
        "name": "processing_fee",
        "type": "number",
        "required": false
      },
      {
        "in": "body",
        "name": "processing_fee_paid_by",
        "type": "'platform' | 'creator' | 'split'",
        "required": false
      },
      {
        "in": "body",
        "name": "product_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "product_name",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "creator_percent",
        "type": "number",
        "required": false
      },
      {
        "in": "body",
        "name": "skip_withholding",
        "type": "boolean",
        "required": false
      },
      {
        "in": "body",
        "name": "metadata",
        "type": "Record<string, any>",
        "required": false
      }
    ]
  },
  {
    "endpoint": "record-transfer",
    "title": "Record Transfer",
    "path": "/v1/record-transfer",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Record Internal Transfer",
    "source": "supabase/functions/record-transfer/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "from_account_type",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "to_account_type",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "amount",
        "type": "number",
        "required": true
      },
      {
        "in": "body",
        "name": "transfer_type",
        "type": "'tax_reserve' | 'payout_reserve' | 'owner_draw' |",
        "required": true
      },
      {
        "in": "body",
        "name": "description",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "reference_id",
        "type": "string",
        "required": false
      }
    ]
  },
  {
    "endpoint": "register-instrument",
    "title": "Register Instrument",
    "path": "/v1/register-instrument",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Register Authorizing Instrument",
    "source": "supabase/functions/register-instrument/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "external_ref",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "extracted_terms",
        "type": "ExtractedTerms",
        "required": true
      }
    ]
  },
  {
    "endpoint": "reverse-transaction",
    "title": "Reverse Transaction",
    "path": "/v1/reverse-transaction",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Reverse Transaction",
    "source": "supabase/functions/reverse-transaction/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "transaction_id",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "reason",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "partial_amount",
        "type": "number",
        "required": false
      },
      {
        "in": "body",
        "name": "metadata",
        "type": "Record<string, any>",
        "required": false
      }
    ]
  },
  {
    "endpoint": "risk-evaluation",
    "title": "Risk Evaluation",
    "path": "/v1/risk-evaluation",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": true,
    "description": "Risk Evaluation",
    "source": "supabase/functions/risk-evaluation/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "idempotency_key",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "amount",
        "type": "number",
        "required": true
      },
      {
        "in": "body",
        "name": "currency",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "counterparty_name",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "authorizing_instrument_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "expected_date",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "category",
        "type": "string",
        "required": false
      }
    ]
  },
  {
    "endpoint": "scheduled-payouts",
    "title": "Scheduled Payouts",
    "path": "/v1/scheduled-payouts",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": true,
    "deprecated": false,
    "description": "Scheduled Payouts",
    "source": "supabase/functions/scheduled-payouts/index.ts",
    "parameters": []
  },
  {
    "endpoint": "security-alerts",
    "title": "Security Alerts",
    "path": "/v1/security-alerts",
    "methods": [
      "POST"
    ],
    "auth": "Public/JWT",
    "internal": true,
    "deprecated": false,
    "description": "Security Alerts",
    "source": "supabase/functions/security-alerts/index.ts",
    "parameters": []
  },
  {
    "endpoint": "send-breach-alert",
    "title": "Send Breach Alert",
    "path": "/v1/send-breach-alert",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": true,
    "deprecated": false,
    "description": "Send Breach Alert",
    "source": "supabase/functions/send-breach-alert/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "cash_balance",
        "type": "number",
        "required": true
      },
      {
        "in": "body",
        "name": "pending_total",
        "type": "number",
        "required": true
      },
      {
        "in": "body",
        "name": "shortfall",
        "type": "number",
        "required": true
      },
      {
        "in": "body",
        "name": "coverage_ratio",
        "type": "number",
        "required": true
      },
      {
        "in": "body",
        "name": "triggered_by",
        "type": "'project_intent' | 'get_runway' | 'manual'",
        "required": true
      },
      {
        "in": "body",
        "name": "instrument_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "external_ref",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "projections_created",
        "type": "number",
        "required": false
      },
      {
        "in": "body",
        "name": "channel",
        "type": "'slack' | 'email' | 'webhook'",
        "required": false
      }
    ]
  },
  {
    "endpoint": "send-statements",
    "title": "Send Statements",
    "path": "/v1/send-statements",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Soledgic Auto-Email Service",
    "source": "supabase/functions/send-statements/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "action",
        "type": "'send_monthly_statements' | 'send_single_statement' | 'preview' | 'get_queue'...",
        "required": true
      },
      {
        "in": "body",
        "name": "ledger_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "creator_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "year",
        "type": "number",
        "required": false
      },
      {
        "in": "body",
        "name": "month",
        "type": "number",
        "required": false
      },
      {
        "in": "body",
        "name": "email_config",
        "type": "EmailConfig",
        "required": false
      }
    ]
  },
  {
    "endpoint": "submit-tax-info",
    "title": "Submit Tax Info",
    "path": "/v1/submit-tax-info",
    "methods": [
      "POST"
    ],
    "auth": "Public/JWT",
    "internal": false,
    "deprecated": true,
    "description": "Submit Tax Info",
    "source": "supabase/functions/submit-tax-info/index.ts",
    "parameters": []
  },
  {
    "endpoint": "tax-documents",
    "title": "Tax Documents",
    "path": "/v1/tax-documents",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": true,
    "description": "Tax Documents",
    "source": "supabase/functions/tax-documents/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "action",
        "type": "'calculate' | 'generate_all' | 'list' | 'get' | 'export' | 'mark_filed'",
        "required": true
      },
      {
        "in": "body",
        "name": "tax_year",
        "type": "number",
        "required": false
      },
      {
        "in": "body",
        "name": "creator_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "document_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "format",
        "type": "'csv' | 'json'",
        "required": false
      }
    ]
  },
  {
    "endpoint": "test-cleanup",
    "title": "Test Cleanup",
    "path": "/v1/test-cleanup",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": true,
    "deprecated": false,
    "description": "Test Data Cleanup",
    "source": "supabase/functions/test-cleanup/index.ts",
    "parameters": []
  },
  {
    "endpoint": "trial-balance",
    "title": "Trial Balance",
    "path": "/v1/trial-balance",
    "methods": [
      "GET",
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Trial Balance",
    "source": "supabase/functions/trial-balance/index.ts",
    "parameters": [
      {
        "in": "query",
        "name": "snapshot",
        "type": "string",
        "required": false
      },
      {
        "in": "query",
        "name": "as_of",
        "type": "string",
        "required": false
      }
    ]
  },
  {
    "endpoint": "upload-receipt",
    "title": "Upload Receipt",
    "path": "/v1/upload-receipt",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Upload Receipt",
    "source": "supabase/functions/upload-receipt/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "file_url",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "file_name",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "file_size",
        "type": "number",
        "required": false
      },
      {
        "in": "body",
        "name": "mime_type",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "merchant_name",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "transaction_date",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "total_amount",
        "type": "number",
        "required": false
      },
      {
        "in": "body",
        "name": "transaction_id",
        "type": "string",
        "required": false
      }
    ]
  },
  {
    "endpoint": "webhooks",
    "title": "Webhooks",
    "path": "/v1/webhooks",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Webhooks Management",
    "source": "supabase/functions/webhooks/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "action",
        "type": "'list' | 'create' | 'update' | 'delete' | 'test' | 'deliveries' | 'retry' | '...",
        "required": true
      },
      {
        "in": "body",
        "name": "endpoint_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "delivery_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "url",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "description",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "events",
        "type": "string[]",
        "required": false
      },
      {
        "in": "body",
        "name": "is_active",
        "type": "boolean",
        "required": false
      }
    ]
  },
  {
    "endpoint": "reconciliations-unmatched",
    "title": "Reconciliations Unmatched",
    "path": "/v1/reconciliations/unmatched",
    "methods": [
      "GET"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "List unmatched ledger transactions that still need settlement or bank reconciliation.",
    "source": "supabase/functions/reconciliations/index.ts",
    "parameters": [
      {
        "in": "query",
        "name": "limit",
        "type": "number",
        "required": false
      }
    ]
  },
  {
    "endpoint": "reconciliations-match-create",
    "title": "Create Reconciliation Match",
    "path": "/v1/reconciliations/matches",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Match a ledger transaction to an external bank or settlement transaction.",
    "source": "supabase/functions/reconciliations/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "transaction_id",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "bank_transaction_id",
        "type": "string",
        "required": true
      }
    ]
  },
  {
    "endpoint": "reconciliations-match-delete",
    "title": "Delete Reconciliation Match",
    "path": "/v1/reconciliations/matches/{transaction_id}",
    "methods": [
      "DELETE"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Remove an existing reconciliation match for a transaction.",
    "source": "supabase/functions/reconciliations/index.ts",
    "parameters": [
      {
        "in": "path",
        "name": "transaction_id",
        "type": "string",
        "required": true
      }
    ]
  },
  {
    "endpoint": "reconciliations-snapshot-create",
    "title": "Create Reconciliation Snapshot",
    "path": "/v1/reconciliations/snapshots",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Create a reconciliation snapshot for an accounting period or as-of date.",
    "source": "supabase/functions/reconciliations/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "period_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "as_of_date",
        "type": "string",
        "required": false
      }
    ]
  },
  {
    "endpoint": "reconciliations-snapshot-detail",
    "title": "Reconciliation Snapshot Detail",
    "path": "/v1/reconciliations/snapshots/{period_id}",
    "methods": [
      "GET"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Fetch the latest reconciliation snapshot for a period and verify its integrity hash.",
    "source": "supabase/functions/reconciliations/index.ts",
    "parameters": [
      {
        "in": "path",
        "name": "period_id",
        "type": "string",
        "required": true
      }
    ]
  },
  {
    "endpoint": "reconciliations-auto-match",
    "title": "Auto Match Settlement Transaction",
    "path": "/v1/reconciliations/auto-match",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Attempt to automatically match a bank aggregator transaction to a ledger transaction.",
    "source": "supabase/functions/reconciliations/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "bank_aggregator_transaction_id",
        "type": "string",
        "required": true
      }
    ]
  },
  {
    "endpoint": "fraud-evaluations",
    "title": "Fraud Evaluations",
    "path": "/v1/fraud/evaluations",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Evaluate a proposed transaction against configured fraud and policy rules.",
    "source": "supabase/functions/fraud/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "idempotency_key",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "amount",
        "type": "number",
        "required": true
      },
      {
        "in": "body",
        "name": "currency",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "counterparty_name",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "authorizing_instrument_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "expected_date",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "category",
        "type": "string",
        "required": false
      }
    ]
  },
  {
    "endpoint": "fraud-evaluation-detail",
    "title": "Fraud Evaluation Detail",
    "path": "/v1/fraud/evaluations/{evaluation_id}",
    "methods": [
      "GET"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Get a previously created fraud evaluation.",
    "source": "supabase/functions/fraud/index.ts",
    "parameters": [
      {
        "in": "path",
        "name": "evaluation_id",
        "type": "string",
        "required": true
      }
    ]
  },
  {
    "endpoint": "fraud-policies",
    "title": "Fraud Policies",
    "path": "/v1/fraud/policies",
    "methods": [
      "GET",
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "List configured fraud policies or create a new policy rule.",
    "source": "supabase/functions/fraud/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "policy_type",
        "type": "'require_instrument' | 'budget_cap' | 'projection_guard'",
        "required": false
      },
      {
        "in": "body",
        "name": "config",
        "type": "Record<string, unknown>",
        "required": false
      },
      {
        "in": "body",
        "name": "severity",
        "type": "'hard' | 'soft'",
        "required": false
      },
      {
        "in": "body",
        "name": "priority",
        "type": "number",
        "required": false
      }
    ]
  },
  {
    "endpoint": "fraud-policy-delete",
    "title": "Delete Fraud Policy",
    "path": "/v1/fraud/policies/{policy_id}",
    "methods": [
      "DELETE"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Delete a configured fraud policy.",
    "source": "supabase/functions/fraud/index.ts",
    "parameters": [
      {
        "in": "path",
        "name": "policy_id",
        "type": "string",
        "required": true
      }
    ]
  },
  {
    "endpoint": "compliance-overview",
    "title": "Compliance Overview",
    "path": "/v1/compliance/overview",
    "methods": [
      "GET"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Get a ledger-scoped overview of compliance and monitoring signals.",
    "source": "supabase/functions/compliance/index.ts",
    "parameters": [
      {
        "in": "query",
        "name": "days",
        "type": "number",
        "required": false
      },
      {
        "in": "query",
        "name": "hours",
        "type": "number",
        "required": false
      }
    ]
  },
  {
    "endpoint": "compliance-access-patterns",
    "title": "Compliance Access Patterns",
    "path": "/v1/compliance/access-patterns",
    "methods": [
      "GET"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "List suspicious or high-volume access patterns for the current ledger.",
    "source": "supabase/functions/compliance/index.ts",
    "parameters": [
      {
        "in": "query",
        "name": "hours",
        "type": "number",
        "required": false
      },
      {
        "in": "query",
        "name": "limit",
        "type": "number",
        "required": false
      }
    ]
  },
  {
    "endpoint": "compliance-financial-activity",
    "title": "Compliance Financial Activity",
    "path": "/v1/compliance/financial-activity",
    "methods": [
      "GET"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Summarize payout, sale, refund, and dispute activity for compliance review.",
    "source": "supabase/functions/compliance/index.ts",
    "parameters": [
      {
        "in": "query",
        "name": "days",
        "type": "number",
        "required": false
      }
    ]
  },
  {
    "endpoint": "compliance-security-summary",
    "title": "Compliance Security Summary",
    "path": "/v1/compliance/security-summary",
    "methods": [
      "GET"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Summarize risk-scored security and audit events for the current ledger.",
    "source": "supabase/functions/compliance/index.ts",
    "parameters": [
      {
        "in": "query",
        "name": "days",
        "type": "number",
        "required": false
      }
    ]
  },
  {
    "endpoint": "tax-documents-v2",
    "title": "Tax Documents",
    "path": "/v1/tax/documents",
    "methods": [
      "GET"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "List generated tax documents for a tax year.",
    "source": "supabase/functions/tax/index.ts",
    "parameters": [
      {
        "in": "query",
        "name": "tax_year",
        "type": "number",
        "required": false
      }
    ]
  },
  {
    "endpoint": "tax-documents-generate",
    "title": "Generate Tax Documents",
    "path": "/v1/tax/documents/generate",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Generate tax documents for all participants that cross the filing threshold.",
    "source": "supabase/functions/tax/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "tax_year",
        "type": "number",
        "required": false
      }
    ]
  },
  {
    "endpoint": "tax-documents-export",
    "title": "Export Tax Documents",
    "path": "/v1/tax/documents/export",
    "methods": [
      "GET"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Export generated tax documents as CSV or JSON.",
    "source": "supabase/functions/tax/index.ts",
    "parameters": [
      {
        "in": "query",
        "name": "tax_year",
        "type": "number",
        "required": false
      },
      {
        "in": "query",
        "name": "format",
        "type": "'csv' | 'json'",
        "required": false
      }
    ]
  },
  {
    "endpoint": "tax-document-detail",
    "title": "Tax Document Detail",
    "path": "/v1/tax/documents/{document_id}",
    "methods": [
      "GET"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Fetch a single generated tax document.",
    "source": "supabase/functions/tax/index.ts",
    "parameters": [
      {
        "in": "path",
        "name": "document_id",
        "type": "string",
        "required": true
      }
    ]
  },
  {
    "endpoint": "tax-document-mark-filed",
    "title": "Mark Tax Document Filed",
    "path": "/v1/tax/documents/{document_id}/mark-filed",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Mark a generated tax document as filed.",
    "source": "supabase/functions/tax/index.ts",
    "parameters": [
      {
        "in": "path",
        "name": "document_id",
        "type": "string",
        "required": true
      }
    ]
  },
  {
    "endpoint": "tax-calculation",
    "title": "Tax Calculation",
    "path": "/v1/tax/calculations/{participant_id}",
    "methods": [
      "GET"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Calculate participant-level tax totals and shared tax profile status for a year.",
    "source": "supabase/functions/tax/index.ts",
    "parameters": [
      {
        "in": "path",
        "name": "participant_id",
        "type": "string",
        "required": true
      },
      {
        "in": "query",
        "name": "tax_year",
        "type": "number",
        "required": false
      }
    ]
  },
  {
    "endpoint": "tax-summary",
    "title": "Tax Summary",
    "path": "/v1/tax/summaries/{tax_year}",
    "methods": [
      "GET"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Generate and return tax summary totals for one year, optionally filtered to a participant.",
    "source": "supabase/functions/tax/index.ts",
    "parameters": [
      {
        "in": "path",
        "name": "tax_year",
        "type": "number",
        "required": true
      },
      {
        "in": "query",
        "name": "participant_id",
        "type": "string",
        "required": false
      }
    ]
  },
  {
    "endpoint": "bill-overages",
    "title": "Bill Overages",
    "path": "/v1/bill-overages",
    "methods": [
      "POST"
    ],
    "auth": "Custom/internal",
    "internal": true,
    "deprecated": false,
    "description": "Calculate and record usage-based billing overages",
    "source": "supabase/functions/bill-overages/index.ts",
    "parameters": []
  },
  {
    "endpoint": "ops-monitor",
    "title": "Ops Monitor",
    "path": "/v1/ops-monitor",
    "methods": [
      "POST"
    ],
    "auth": "Custom/internal",
    "internal": true,
    "deprecated": false,
    "description": "Production observability: monitors payment pipeline health",
    "source": "supabase/functions/ops-monitor/index.ts",
    "parameters": []
  },
  {
    "endpoint": "process-processor-inbox",
    "title": "Process Processor Inbox",
    "path": "/v1/process-processor-inbox",
    "methods": [
      "POST"
    ],
    "auth": "Custom/internal",
    "internal": true,
    "deprecated": false,
    "description": "Process pending processor webhook inbox events",
    "source": "supabase/functions/process-processor-inbox/index.ts",
    "parameters": []
  },
  {
    "endpoint": "reconcile-checkout-ledger",
    "title": "Reconcile Checkout Ledger",
    "path": "/v1/reconcile-checkout-ledger",
    "methods": [
      "POST"
    ],
    "auth": "Custom/internal",
    "internal": true,
    "deprecated": false,
    "description": "Retry charged-but-unrecorded checkout sessions (charged_pending_ledger → sale)",
    "source": "supabase/functions/reconcile-checkout-ledger/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "limit",
        "type": "number",
        "required": false
      },
      {
        "in": "body",
        "name": "dry_run",
        "type": "boolean",
        "required": false
      }
    ]
  }
]

export const API_ENDPOINT_CATALOG: ApiEndpointDoc[] = RAW_API_ENDPOINT_CATALOG
