export type ApiParameter = {
  in: 'query' | 'body'
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

export const API_ENDPOINT_CATALOG: ApiEndpointDoc[] = [
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
    "endpoint": "check-payout-eligibility",
    "title": "Check Payout Eligibility",
    "path": "/v1/check-payout-eligibility",
    "methods": [
      "GET",
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Check Payout Eligibility",
    "source": "supabase/functions/check-payout-eligibility/index.ts",
    "parameters": [
      {
        "in": "query",
        "name": "creator_id",
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
    "deprecated": false,
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
    "endpoint": "connected-accounts",
    "title": "Connected Accounts",
    "path": "/v1/connected-accounts",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Connected Accounts",
    "source": "supabase/functions/connected-accounts/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "action",
        "type": "'create' | 'get' | 'list' | 'update_status' | 'create_onboarding_link' | 'cre...",
        "required": true
      },
      {
        "in": "body",
        "name": "entity_type",
        "type": "'creator' | 'venture' | 'merchant'",
        "required": false
      },
      {
        "in": "body",
        "name": "entity_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "email",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "display_name",
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
        "name": "connected_account_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "entity_type_filter",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "status_filter",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "limit",
        "type": "number",
        "required": false
      },
      {
        "in": "body",
        "name": "offset",
        "type": "number",
        "required": false
      },
      {
        "in": "body",
        "name": "return_url",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "refresh_url",
        "type": "string",
        "required": false
      }
    ]
  },
  {
    "endpoint": "create-checkout",
    "title": "Create Checkout",
    "path": "/v1/create-checkout",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Create Checkout",
    "source": "supabase/functions/create-checkout/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "amount",
        "type": "number",
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
        "name": "currency",
        "type": "string",
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
        "name": "capture_method",
        "type": "'automatic' | 'manual'",
        "required": false
      },
      {
        "in": "body",
        "name": "setup_future_usage",
        "type": "'off_session' | 'on_session'",
        "required": false
      },
      {
        "in": "body",
        "name": "metadata",
        "type": "Record<string, string>",
        "required": false
      }
    ]
  },
  {
    "endpoint": "create-creator",
    "title": "Create Creator",
    "path": "/v1/create-creator",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Create Creator",
    "source": "supabase/functions/create-creator/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "creator_id",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "display_name",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "email",
        "type": "string",
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
        "name": "tax_info",
        "type": "{",
        "required": false
      },
      {
        "in": "body",
        "name": "tax_id_type",
        "type": "'ssn' | 'ein' | 'itin'",
        "required": false
      },
      {
        "in": "body",
        "name": "tax_id_last4",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "legal_name",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "business_type",
        "type": "'individual' | 'sole_proprietor' | 'llc' | 'corporation' | 'partnership'",
        "required": false
      },
      {
        "in": "body",
        "name": "address",
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
        "name": "payout_preferences",
        "type": "{",
        "required": false
      },
      {
        "in": "body",
        "name": "schedule",
        "type": "'manual' | 'weekly' | 'biweekly' | 'monthly'",
        "required": false
      },
      {
        "in": "body",
        "name": "minimum_amount",
        "type": "number",
        "required": false
      },
      {
        "in": "body",
        "name": "method",
        "type": "'card' | 'manual'",
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
        "required": true
      },
      {
        "in": "body",
        "name": "ledger_mode",
        "type": "'standard' | 'platform'",
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
    "endpoint": "debug-expense",
    "title": "Debug Expense",
    "path": "/v1/debug-expense",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": true,
    "deprecated": false,
    "description": "Debug version of record-expense to capture actual errors",
    "source": "supabase/functions/debug-expense/index.ts",
    "parameters": []
  },
  {
    "endpoint": "debug-handler",
    "title": "Debug Handler",
    "path": "/v1/debug-handler",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": true,
    "deprecated": false,
    "description": "Debug version using createHandler to isolate the issue",
    "source": "supabase/functions/debug-handler/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "message",
        "type": "string",
        "required": false
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
    "deprecated": false,
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
    "endpoint": "get-balance",
    "title": "Get Balance",
    "path": "/v1/get-balance",
    "methods": [
      "GET"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Get Balance",
    "source": "supabase/functions/get-balance/index.ts",
    "parameters": [
      {
        "in": "query",
        "name": "creator_id",
        "type": "string",
        "required": false
      },
      {
        "in": "query",
        "name": "include_platform",
        "type": "string",
        "required": false
      }
    ]
  },
  {
    "endpoint": "get-balances",
    "title": "Get Balances",
    "path": "/v1/get-balances",
    "methods": [
      "GET",
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Get Balances",
    "source": "supabase/functions/get-balances/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "action",
        "type": "Action",
        "required": true
      },
      {
        "in": "body",
        "name": "account_id",
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
        "name": "as_of_date",
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
    "endpoint": "plaid",
    "title": "Plaid",
    "path": "/v1/plaid",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Plaid Integration",
    "source": "supabase/functions/plaid/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "action",
        "type": "'create_link_token' | 'exchange_token' | 'list_connections' | 'sync' | 'disco...",
        "required": true
      },
      {
        "in": "body",
        "name": "connection_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "public_token",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "plaid_transaction_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "ledger_transaction_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "rule",
        "type": "{",
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
        "name": "conditions",
        "type": "Record<string, any>",
        "required": true
      },
      {
        "in": "body",
        "name": "action",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "action_config",
        "type": "Record<string, any>",
        "required": false
      },
      {
        "in": "body",
        "name": "rule_id",
        "type": "string",
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
    "endpoint": "process-payout",
    "title": "Process Payout",
    "path": "/v1/process-payout",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Process Payout",
    "source": "supabase/functions/process-payout/index.ts",
    "parameters": [
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
        "name": "reference_id",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "reference_type",
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
        "name": "payout_method",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "fees",
        "type": "number",
        "required": false
      },
      {
        "in": "body",
        "name": "fees_paid_by",
        "type": "'platform' | 'creator'",
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
    "deprecated": false,
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
    "endpoint": "record-refund",
    "title": "Record Refund",
    "path": "/v1/record-refund",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Record Refund",
    "source": "supabase/functions/record-refund/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "original_sale_reference",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "amount",
        "type": "number",
        "required": false
      },
      {
        "in": "body",
        "name": "reason",
        "type": "string",
        "required": true
      },
      {
        "in": "body",
        "name": "refund_from",
        "type": "'both' | 'platform_only' | 'creator_only'",
        "required": false
      },
      {
        "in": "body",
        "name": "external_refund_id",
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
    "endpoint": "release-funds",
    "title": "Release Funds",
    "path": "/v1/release-funds",
    "methods": [
      "POST"
    ],
    "auth": "API key",
    "internal": false,
    "deprecated": false,
    "description": "Release Funds",
    "source": "supabase/functions/release-funds/index.ts",
    "parameters": [
      {
        "in": "body",
        "name": "action",
        "type": "'release' | 'batch_release' | 'void' | 'get_held' | 'get_summary' | 'auto_rel...",
        "required": true
      },
      {
        "in": "body",
        "name": "entry_id",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "entry_ids",
        "type": "string[]",
        "required": false
      },
      {
        "in": "body",
        "name": "void_reason",
        "type": "string",
        "required": false
      },
      {
        "in": "body",
        "name": "venture_id",
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
        "name": "ready_only",
        "type": "boolean",
        "required": false
      },
      {
        "in": "body",
        "name": "limit",
        "type": "number",
        "required": false
      },
      {
        "in": "body",
        "name": "offset",
        "type": "number",
        "required": false
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
    "deprecated": false,
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
    "deprecated": false,
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
  }
]
