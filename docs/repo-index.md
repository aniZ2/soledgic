---
name: repo-index
description: Machine-parsable code knowledge graph — stable IDs, risk levels, call graph, test map, critical paths, invariants, env boundaries
type: reference
---

# Soledgic Repository Index

Creator economy payment platform. Monorepo: Next.js web app + Supabase Edge Functions + Finix payment processor. Double-entry ledger with 71 edge function dirs (70 services + _shared), 90+ tables, 150 SDK methods.

**Domains:** Checkout, Sales, Refunds, Reversals, Payouts, Wallets, Tax/1099, Compliance, Reconciliation, Invoices, Webhooks, Billing

---

## Critical Paths (must never break)

```
CRITICAL_PATH: CHECKOUT_COMPLETION
  chain: checkout-sessions → SVC_CHECKOUT_ORCHESTRATOR → EXT_FINIX charge → RPC_RECORD_SALE_ATOMIC → TRG_UPDATE_ACCOUNT_BALANCE
  invariants: INVARIANT_DOUBLE_ENTRY, INVARIANT_LEDGER_BALANCE

CRITICAL_PATH: REFUND_PROCESSING
  chain: refunds → SVC_REFUND_ENGINE → RPC_RECORD_REFUND_ATOMIC_V2 → TRG_UPDATE_ACCOUNT_BALANCE
  invariants: INVARIANT_REFUND_CAP, INVARIANT_IDEMPOTENCY, INVARIANT_DOUBLE_ENTRY

CRITICAL_PATH: PAYOUT_EXECUTION
  chain: payouts → SVC_PAYOUT_ENGINE → RPC_PROCESS_PAYOUT_ATOMIC → execute-payout → EXT_FINIX transfer
  invariants: INVARIANT_NONNEGATIVE_BALANCE, INVARIANT_DOUBLE_ENTRY

CRITICAL_PATH: REVERSAL_PROCESSING
  chain: reverse-transaction → SVC_REVERSAL_ENGINE → RPC_VOID_TRANSACTION_ATOMIC → TRG_UPDATE_ACCOUNT_BALANCE
  invariants: INVARIANT_REVERSAL_CAP, INVARIANT_IDEMPOTENCY, INVARIANT_DOUBLE_ENTRY

CRITICAL_PATH: WEBHOOK_DELIVERY
  chain: queue_webhook → CRON_PROCESS_WEBHOOKS → HMAC sign → HTTP POST → mark delivered/failed
  invariants: INVARIANT_WEBHOOK_SIGNATURE
```

---

## Invariants (rules that must never be violated)

```
INVARIANT_LEDGER_BALANCE
  accounts.balance must equal sum(entries) for each account
  enforced_by: TRG_UPDATE_ACCOUNT_BALANCE, check_balance_equation RPC
  verified_by: health-check (check #1)

INVARIANT_DOUBLE_ENTRY
  sum(debits) must equal sum(credits) per transaction
  enforced_by: validate_double_entry trigger, record_refund_atomic_v2 inline check
  verified_by: health-check (check #2)

INVARIANT_REFUND_CAP
  total net refunds ≤ original sale amount
  enforced_by: get_net_refunded_cents RPC + record_refund_atomic_v2 guard
  concurrency: FOR UPDATE on sale row

INVARIANT_REVERSAL_CAP
  total reversals ≤ original transaction amount
  enforced_by: cumulative reversal query in reverse-transaction/index.ts
  concurrency: unique reference_id via deterministic ID or idempotency_key

INVARIANT_NONNEGATIVE_BALANCE
  creator_balance and wallet accounts cannot go negative
  enforced_by: trg_payout_negative_balance_guard_fn, enforce_wallet_nonnegative_balance

INVARIANT_IDEMPOTENCY
  reference_id unique per (ledger_id, reference_id) — prevents duplicate transactions
  enforced_by: idx_transactions_ledger_reference_unique partial index
  handled_by: EXCEPTION WHEN unique_violation in atomic RPCs

INVARIANT_AUDIT_CHAIN
  audit_log rows form a hash chain (seq_num, prev_hash, row_hash)
  enforced_by: trg_audit_log_chain_hash_fn trigger
  verified_by: verify_audit_chain RPC
  immutability: prevent_audit_log_modification trigger blocks UPDATE/DELETE

INVARIANT_WEBHOOK_SIGNATURE
  all outbound webhooks signed with HMAC-SHA256 using endpoint secret
  enforced_by: webhook-signing.ts buildWebhookHeaders

INVARIANT_LEDGER_BALANCE — timing
  enforcement: REAL-TIME (trigger on every entry INSERT)
  detection: SCHEDULED (health-check cron, ~5min intervals)
  gap: violation could persist up to 5min before alerting

INVARIANT_DOUBLE_ENTRY — timing
  enforcement: REAL-TIME (CONSTRAINT TRIGGER, deferred to commit)
  detection: REAL-TIME (transaction ROLLBACK if debits != credits)
  gap: none — blocks commit

INVARIANT_REFUND_CAP — timing
  enforcement: REAL-TIME (FOR UPDATE lock + guard in RPC)
  detection: POST-COMMIT (health-check)
  gap: none — blocks the refund

INVARIANT_NONNEGATIVE_BALANCE — timing
  enforcement: REAL-TIME (BEFORE INSERT trigger on entries)
  detection: POST-COMMIT (health-check)
  gap: none — blocks the payout entry

INVARIANT_IDEMPOTENCY — timing
  enforcement: REAL-TIME (unique partial index on reference_id)
  detection: REAL-TIME (unique_violation exception)
  gap: none — blocks duplicate INSERT

INVARIANT_AUDIT_CHAIN — timing
  enforcement: REAL-TIME (trigger on audit_log INSERT)
  detection: SCHEDULED (verify_audit_chain RPC, manual)
  gap: audit log writes are async for non-critical ops — entry could be lost on crash

INVARIANT_WEBHOOK_SIGNATURE — timing
  enforcement: REAL-TIME (HMAC computed before HTTP POST)
  detection: none (consumer-side verification)
  gap: none — unsigned webhooks never sent
```

---

## Lock Ordering Hierarchy

```
GLOBAL RULE: Each atomic RPC acquires ONE primary lock, then INSERTs entries.
             Entry INSERT fires update_account_balance trigger (implicit row lock, µs).
             Two-account operations (wallet_transfer_atomic) use UUID-ordered locking.

LOCK_ORDER: wallet_transfer_atomic
  1. accounts(min_uuid) FOR UPDATE
  2. accounts(max_uuid) FOR UPDATE
  3. transactions INSERT
  4. entries INSERT (2x) → trigger: update_account_balance
  note: deterministic UUID ordering eliminates A→B / B→A deadlocks

LOCK_ORDER: record_sale_atomic
  1. accounts(creator_balance) FOR UPDATE
  2. transactions INSERT
  3. entries INSERT (3-4x) → trigger: update_account_balance
  note: single-row lock, no deadlock risk

LOCK_ORDER: record_refund_atomic_v2
  1. transactions(original_sale) FOR UPDATE
  2. transactions INSERT (refund)
  3. entries INSERT (2-3x) → trigger: update_account_balance
  note: locks SALE row (not account) to serialize concurrent refunds of same sale

LOCK_ORDER: process_payout_atomic
  1. accounts(creator_balance) FOR UPDATE
  2. transactions INSERT
  3. entries INSERT (2-3x) → triggers: update_account_balance + payout_negative_balance_guard
  note: guard trigger runs WITHIN same txn, sees locked balance

LOCK_ORDER: void_transaction_atomic
  1. transactions(original) FOR UPDATE
  2. transactions INSERT (reversal)
  3. entries INSERT (N x flipped debit↔credit) → trigger: update_account_balance
  4. transactions(original).status UPDATE → 'voided'

LOCK_ORDER: complete_fund_release
  1. escrow_releases FOR UPDATE
  2. entries UPDATE (release_status)

DEADLOCK SAFETY:
  - Single-lock RPCs (sale, payout, refund, void): inherently deadlock-free
  - Two-lock RPCs (wallet_transfer): UUID-ordered locking prevents deadlocks
  - Trigger locks: update_account_balance runs WITHIN parent txn (no new lock acquisition)
  - Payout guard trigger: reads held_funds without lock (protected by parent FOR UPDATE on account)
```

---

## Failure States & Compensating Actions

```
CRITICAL_PATH: CHECKOUT_COMPLETION
  FAILURE: Finix charge OK → record_sale_atomic fails
    state: checkout_sessions.status = 'charged_pending_ledger'
    recovery: AUTO — reconcile-checkout-ledger cron retries (30-day window)
    detection: audit log entry 'reconcile_stale_session' after 24h

  FAILURE: Finix charge fails
    state: no ledger entry, no session state change
    recovery: MANUAL — client retries payment

  FAILURE: record_sale_atomic OK → queue_webhook fails
    state: transaction recorded, no customer notification
    recovery: MANUAL — ops replays webhook

CRITICAL_PATH: REFUND_PROCESSING
  FAILURE: ledger booking OK → processor refund fails
    state: refund entries created but no cash movement
    recovery: AUTO — void_transaction_atomic called inline (flips entries, restores balances)

  FAILURE: processor refund OK → ledger booking fails
    state: orphan refund in processor, row in pending_processor_refunds
    recovery: MANUAL — ops queries pending_processor_refunds, inserts matching ledger entry

CRITICAL_PATH: PAYOUT_EXECUTION
  FAILURE: process_payout_atomic OK → execute-payout (Finix transfer) fails
    state: payout transaction recorded, creator balance debited, no cash sent
    recovery: MANUAL — ops retries execute-payout (idempotent by payout_id) OR reverses via reverse-transaction

  FAILURE: process_payout_atomic fails
    state: no payout transaction
    recovery: MANUAL — client retries (insufficient balance, duplicate, etc.)

CRITICAL_PATH: REVERSAL_PROCESSING
  FAILURE: transaction in locked/closed period
    state: 403 rejection, no ledger change
    recovery: MANUAL — ops reopens period, retries reversal

  FAILURE: reversal of refund → sale state stale
    state: refund reversed but sale still marked 'reversed'
    recovery: AUTO — syncSaleRefundStateAfterRefundReversal() restores sale to 'completed'

CRITICAL_PATH: WEBHOOK_DELIVERY
  FAILURE: HTTP POST fails (4xx/5xx/timeout/SSRF)
    state: webhook_deliveries.status = 'retrying', next_retry_at set
    recovery: AUTO — exponential backoff (1m → 4h cap), max ~10 retries over ~4 days
    after max: status = 'failed', no more retries, manual replay possible
```

---

## Environment Boundaries

```
ENV: production
  EXT_STRIPE: live processor (default, PAYMENT_PROVIDER=stripe)
  EXT_FINIX: legacy processor (PAYMENT_PROVIDER=finix)
  EXT_RESEND: live email delivery
  write_gates: SOLEDGIC_ALLOW_WRITES + SOLEDGIC_ALLOW_LIVE_WRITES (MCP)
  crons: all active (process-webhooks, scheduled-payouts, ops-monitor, etc.)

ENV: test / staging
  EXT_STRIPE: sandbox processor (sk_test_* API keys)
  EXT_FINIX: sandbox (if PAYMENT_PROVIDER=finix)
  EXT_RESEND: sandbox (emails not delivered)
  crons: active but hitting sandbox

ENV: local
  edge functions: supabase functions serve
  DB: local PostgreSQL via supabase start
  no external processors unless env vars set
```

---

## Architecture Layers

```
Client (Booklyverse, etc.)
  │  x-api-key
  ▼
Next.js API Routes (apps/web/src/app/api/)     ← dashboard UI + v1 proxy
  │  Authorization: Bearer <anon_key>
  ▼
Supabase Edge Functions (supabase/functions/)   ← business logic
  │  imports
  ▼
Shared Services (supabase/functions/_shared/)   ← reusable domain logic
  │  supabase.rpc() / .from()
  ▼
PostgreSQL RPCs + Tables (supabase/migrations/) ← atomic operations, triggers
```

**Key proxy paths:**
- `/v1/*` — public API proxy (`apps/web/src/app/api/v1/[[...path]]/route.ts`), injects `Authorization` from anon key
- `/api/ledger-functions/[[...endpoint]]` — internal dashboard proxy, allowlisted endpoints, injects service-role auth

---

## Edge Functions (by domain)

### Payments & Checkout

| Function | Auth | Methods | Shared Service | Key RPCs |
|---|---|---|---|---|
| `checkout-sessions` | createHandler (API key) | POST | checkout-service.ts → payment-provider.ts | checkout_sessions table, record_sale_atomic |
| `record-sale` | createHandler (API key) | POST | (inline) | calculate_sale_split, record_sale_atomic |
| `receive-payment` | createHandler (API key) | POST | (inline) | receive_payment_atomic |
| `reconcile-checkout-ledger` | Bearer service-role | POST | (inline, cron) | record_sale_atomic (retry stuck sessions) |
| `preflight-authorization` | createHandler (API key) | POST | (inline) | check_authorization_decision |
| `register-instrument` | createHandler (API key) | POST | (inline) | authorizing_instruments table |

### Refunds & Reversals

| Function | Auth | Methods | Shared Service | Key RPCs |
|---|---|---|---|---|
| `refunds` | createHandler (API key) | GET, POST | refund-service.ts → payment-provider.ts | record_refund_atomic_v2, get_net_refunded_cents |
| `reverse-transaction` | createHandler (API key) | POST | (inline) | void_transaction_atomic, entries reversal |

### Payouts

| Function | Auth | Methods | Shared Service | Key RPCs |
|---|---|---|---|---|
| `payouts` | createHandler (API key) | POST | payout-service.ts | process_payout_atomic |
| `execute-payout` | createHandler (API key) | POST | payment-provider.ts | Finix transfer via CardProcessorRail, NACHA generation |
| `scheduled-payouts` | Bearer service-role / cron | POST | (inline, cron) | Batch payout execution on schedule |

### Participants & Identity

| Function | Auth | Methods | Shared Service | Key RPCs |
|---|---|---|---|---|
| `participants` | createHandler (API key) | GET, POST | participants-service.ts → identity-service.ts | accounts table, participant_identity_links |
| `submit-tax-info` | createHandler (API key) | POST | identity-service.ts | tax_info_submissions, shared_tax_profiles |
| `delete-creator` | createHandler (API key) | POST | (inline) | delete_creator_atomic |

### Wallets & Transfers

| Function | Auth | Methods | Shared Service | Key RPCs |
|---|---|---|---|---|
| `wallets` | createHandler (API key) | GET, POST | wallet-service.ts | wallet_deposit_atomic, wallet_withdraw_atomic, accounts table |
| `transfers` | createHandler (API key) | POST | wallet-service.ts | wallet_transfer_atomic |
| `holds` | createHandler (API key) | GET, POST | holds-service.ts → payment-provider.ts | get_held_funds_dashboard, release_held_funds, escrow_releases |

### Tax & Compliance

| Function | Auth | Methods | Shared Service | Key RPCs |
|---|---|---|---|---|
| `tax` | createHandler (API key) | GET, POST | tax-service.ts | compute_tax_year_summaries, generate_1099_documents, tax_documents, tax_year_summaries |
| `compliance` | createHandler (API key) | GET | compliance-service.ts | audit_log queries |
| `compliance-v1` | (re-exports compliance) | — | — | — |
| `fraud` | createHandler (API key) | GET, POST | fraud-service.ts | risk_evaluations, risk_policies |
| `risk-evaluation` | createHandler (API key) | POST | (inline) | Signal engine, advisory only |
| `configure-risk-policy` | createHandler (API key) | POST | (inline) | risk_policies, risk_score_definitions |

### Reconciliation

| Function | Auth | Methods | Shared Service | Key RPCs |
|---|---|---|---|---|
| `reconcile` | createHandler (API key) | POST | (inline) | bank_matches, reconciliation_snapshots, auto_match_bank_aggregator_transaction |
| `reconciliations` | createHandler (API key) | GET, POST, DELETE | reconciliations-service.ts | Same as reconcile (resource-style API) |

### Reports & Accounting

| Function | Auth | Methods | Shared Service | Key RPCs |
|---|---|---|---|---|
| `balance-sheet` | createHandler (API key) | GET | (inline) | account_balances_as_of, check_balance_equation |
| `profit-loss` | createHandler (API key) | GET | (inline) | account_balances_for_period |
| `trial-balance` | createHandler (API key) | GET | (inline) | calculate_trial_balance, create_trial_balance_snapshot |
| `generate-report` | createHandler (API key) | POST | (inline) | Various export RPCs |
| `export-report` | createHandler (API key) | POST | (inline) | export_general_ledger, export_trial_balance, export_profit_loss |
| `close-period` | createHandler (API key) | POST | (inline) | close_accounting_period |
| `generate-pdf` | createHandler (API key) | POST | (inline) | PDF rendering for statements/reports |
| `frozen-statements` | createHandler (API key) | GET | (inline) | reconciliation_snapshots |
| `ap-aging` | createHandler (API key) | GET | (inline) | Accounts payable aging |
| `ar-aging` | createHandler (API key) | GET | (inline) | Accounts receivable aging |
| `get-runway` | createHandler (API key) | GET | (inline) | calculate_runway, runway_snapshots |
| `get-transactions` | createHandler (API key) | GET | (inline) | transactions + entries queries |

### Ledger Management

| Function | Auth | Methods | Shared Service | Key RPCs |
|---|---|---|---|---|
| `create-ledger` | createHandler (no auth, rate-limited) | POST | (inline) | create_organization_with_ledger, initialize_ledger_accounts |
| `list-ledgers` | createHandler (API key) | GET | (inline) | ledgers table |
| `record-adjustment` | createHandler (API key) | POST | (inline) | adjustment_journals, entries |
| `record-expense` | createHandler (API key) | POST | (inline) | transactions + entries (expense type) |
| `record-income` | createHandler (API key) | POST | (inline) | transactions + entries (income type) |
| `record-transfer` | createHandler (API key) | POST | (inline) | internal_transfers |
| `record-bill` | createHandler (API key) | POST | (inline) | transactions (bill type) |
| `record-opening-balance` | createHandler (API key) | POST | (inline) | opening_balances, accounts |
| `import-transactions` | createHandler (API key) | POST | (inline) | Bulk CSV/JSON import |

### Invoices

| Function | Auth | Methods | Shared Service | Key RPCs |
|---|---|---|---|---|
| `invoices` | createHandler (API key) | GET, POST | (inline) | invoices, invoice_payments, record_invoice_payment_atomic, safe_void_invoice, send_invoice_atomic |
| `pay-bill` | createHandler (API key) | POST | (inline) | record_bill_payment_atomic |

### Webhooks

| Function | Auth | Methods | Shared Service | Key RPCs |
|---|---|---|---|---|
| `webhooks` | createHandler (API key) | POST | webhook-signing.ts, webhook-management.ts | webhook_endpoints, webhook_deliveries, rotate_webhook_secret |
| `process-webhooks` | x-cron-secret (cron) | POST | webhook-signing.ts | get_pending_webhooks, mark_webhook_delivered/failed |
| `process-processor-inbox` | Bearer service-role | POST | processor-webhook-adapters.ts | claim_processor_webhook_inbox, payout/refund/dispute handlers |
| ~~bank-aggregator-webhooks~~ | _removed_ | — | — | — |

### Banking & Aggregation

| Function | Auth | Methods | Shared Service | Key RPCs |
|---|---|---|---|---|
| ~~bank-aggregator~~ | _removed_ | — | — | — |
| ~~sync-bank-feeds~~ | _removed_ | — | — | — |
| `import-bank-statement` | createHandler (API key) | POST | (inline) | bank_statement_lines, bank_statements |
| `manage-bank-accounts` | createHandler (API key) | POST | (inline) | bank_accounts table |

### Operations & Monitoring

| Function | Auth | Methods | Shared Service | Key RPCs |
|---|---|---|---|---|
| `health-check` | API key / cron / proxy token | POST | (inline) | run_ledger_health_check, run_all_health_checks |
| `ops-monitor` | x-cron-secret (cron) | POST | (inline) | Slack alerts, pipeline health |
| `security-alerts` | createHandler (API key) | POST | (inline) | security_alerts table |
| `send-breach-alert` | createHandler (API key) | POST | (inline) | Resend email for breach alerts |
| `configure-alerts` | createHandler (API key) | POST | (inline) | alert_configurations |

### Billing & Settings

| Function | Auth | Methods | Shared Service | Key RPCs |
|---|---|---|---|---|
| `billing` | createHandler (JWT auth) | POST | (inline) | billing_overage_charges, subscriptions, organizations |
| `bill-overages` | cron / service-role | POST | (inline) | billing_overage_charges |
| `manage-budgets` | createHandler (API key) | POST | (inline) | budget_envelopes |
| `manage-contractors` | createHandler (API key) | POST | (inline) | contractors, contractor_payments |
| `manage-recurring` | createHandler (API key) | POST | (inline) | recurring_expense_templates |
| `manage-splits` | createHandler (API key) | POST | (inline) | product_splits, set_creator_split |
| `send-statements` | API key / cron | POST | (inline) | get_creators_for_statements, email_log |
| `upload-receipt` | createHandler (API key) | POST | (inline) | receipts, Supabase Storage |
| `project-intent` | createHandler (API key) | POST | (inline) | projected_transactions (ghost entries) |
| `test-cleanup` | createHandler (API key) | POST | (inline) | Test data teardown |

---

## Shared Services (_shared/)

| Service File | Exported Functions | Used By | Key Tables/RPCs |
|---|---|---|---|
| **utils.ts** | createHandler, jsonResponse, errorResponse, validateApiKey, validate*, getClientIp, timingSafeEqual, isPrivateIP, validateWebhookUrl, logSecurityEvent, createAuditLogAsync, sanitizeForAudit, getSupabaseClient, escapeHtml | All edge functions | api_keys, api_key_scopes, rate_limits, audit_log |
| **treasury-resource.ts** | resourceOk, resourceError, respondWithResult, getResourceSegments, asJsonObject, getNumberParam, getBooleanParam | Resource-style functions (tax, wallets, holds, fraud, compliance, reconciliations, participants, refunds, payouts, transfers, checkout-sessions) | — |
| **payment-provider.ts** | getPaymentProvider (returns PaymentProvider with createPaymentIntent, getPaymentStatus, refundPayment) | checkout-service, refund-service, holds-service, execute-payout | Finix API (via PROCESSOR_BASE_URL) |
| **checkout-service.ts** | createCheckoutResponse | checkout-sessions | checkout_sessions, record_sale_atomic, payment-provider |
| **refund-service.ts** | listRefundsResponse, recordRefundResponse | refunds | record_refund_atomic_v2, payment-provider (processor refunds) |
| **payout-service.ts** | processPayoutResponse | payouts | process_payout_atomic |
| **wallet-service.ts** | listWalletsResponse, createWalletResponse, getWalletByIdResponse, getWalletBalanceResponse, listWalletEntriesResponse, listWalletEntriesByIdResponse, topUpWalletByIdResponse, withdrawFromWalletByIdResponse, withdrawFromWalletResponse, depositToWalletResponse, transferWalletFundsResponse | wallets, transfers | wallet_deposit_atomic, wallet_withdraw_atomic, wallet_transfer_atomic, accounts |
| **tax-service.ts** | listTaxDocumentsResponse, getTaxDocumentResponse, generateTaxDocumentsResponse, getTaxSummaryResponse, calculateParticipantTaxResponse, exportTaxDocumentsResponse, markTaxDocumentFiledResponse, markTaxDocumentsFiledBulkResponse, issueCorrectedTaxDocumentResponse, generateTaxDocumentPdfResponse, generateTaxDocumentPdfBatchResponse, deliverTaxDocumentCopyBResponse | tax | compute_tax_year_summaries, tax_documents, tax_year_summaries, participant_identity_links |
| **compliance-service.ts** | getComplianceOverviewResponse, listComplianceAccessPatternsResponse, listComplianceFinancialActivityResponse, listComplianceSecuritySummaryResponse | compliance | audit_log |
| **fraud-service.ts** | createFraudEvaluationResponse, createFraudPolicyResponse, deleteFraudPolicyResponse, getFraudEvaluationResponse, listFraudPoliciesResponse | fraud | risk_evaluations, risk_policies |
| **holds-service.ts** | listHeldFundsResponse, getHeldFundsSummaryResponse, releaseHeldFundsResponse | holds | get_held_funds_dashboard, get_held_funds_summary, release_held_funds, escrow_releases/release_queue |
| **participants-service.ts** | createParticipantResponse, getParticipantBalanceResponse, getParticipantPayoutEligibilityResponse, listParticipantBalancesResponse | participants | accounts, identity-service |
| **identity-service.ts** | getLinkedUserIdForParticipant, getLinkedUserIdsForParticipants, linkParticipantToUser, upsertSharedTaxProfile, upsertSharedPayoutProfile | participants-service, tax-service, submit-tax-info | participant_identity_links, shared_tax_profiles, shared_payout_profiles |
| **reconciliations-service.ts** | autoMatchReconciliationResponse, createReconciliationMatchResponse, createReconciliationSnapshotResponse, deleteReconciliationMatchResponse, getReconciliationSnapshotResponse, listUnmatchedTransactionsResponse | reconciliations | bank_matches, reconciliation_snapshots, auto_match_bank_aggregator_transaction |
| **webhook-signing.ts** | buildWebhookHeaders, signWebhookPayload, verifyWebhookSignature | webhooks, process-webhooks | — (crypto only) |
| **webhook-management.ts** | buildWebhookReplayUpdate, normalizeWebhookDelivery | webhooks | webhook_deliveries |
| **processor-webhook-adapters.ts** | getProcessorWebhookAdapter, NormalizedProcessorEvent, ProcessorWebhookInboxRow | process-processor-inbox | processor_webhook_inbox |
| **financial-file-parsers.ts** | parseFinancialFile (OFX, CAMT.053, BAI2, MT940) | import-transactions | — |
| **error-tracking.ts** | scrubPII, captureException (Sentry HTTP envelope) | utils.ts | — |

---

## Database Layer

### Core Ledger Tables
- **ledgers** — One per business/marketplace; settings, payout_rails, currency
- **accounts** — Chart of accounts per ledger (creator_balance, platform_revenue, cash, expense, etc.)
- **transactions** — All financial events (sale, payout, refund, reversal, expense, income, bill, transfer, adjustment)
- **entries** — Double-entry journal lines (debit/credit per account), with hold/release fields
- **accounting_periods** — Fiscal periods with open/closed/locked status

### Payments & Checkout
- **checkout_sessions** — Hosted checkout state machine (pending → charged_pending_ledger → completed)
- **connected_accounts** — Processor identity per creator (setup_state, processor_identity_id)
### Participants & Identity
- **participant_identity_links** — Maps participant_id to auth user_id across ledgers
- **shared_tax_profiles** — W-9 data keyed by user_id (cross-ledger)
- **shared_payout_profiles** — Payout preferences keyed by user_id (cross-ledger)
- **tax_info_submissions** — Raw tax info submission records

### Payouts
- **payouts** — Payout records with status tracking
- **payout_requests** — Creator-initiated payout requests
- **payout_executions** — Rail execution records
- **payout_schedule_runs** — Scheduled payout batch runs
- **nacha_files** — Generated NACHA/ACH files

### Tax & 1099
- **tax_documents** — Generated 1099 documents per creator per year
- **tax_year_summaries** — Aggregated earnings/refunds per participant per year
- **tax_buckets** — Tax withholding buckets
- **creator_payout_summaries** — Annual payout totals per creator
- **contractor_payments** — 1099-reportable payments

### Reconciliation & Banking
- **bank_matches** — Ledger-to-bank transaction matches
- **reconciliation_snapshots** — Frozen reconciliation state with integrity hash
- **bank_connections** — Aggregator connections (Teller)
- **bank_aggregator_transactions** — Synced bank feed transactions (added post-baseline)
- **bank_statement_lines** — Manual CSV-imported bank lines
- **bank_transactions** — Legacy reconciliation table
- **auto_match_rules** — Rule-based auto-matching config

### Webhooks
- **webhook_endpoints** — Registered webhook URLs with secrets
- **webhook_deliveries** — Delivery attempts with status/retry
- **processor_webhook_inbox** — Inbound processor webhook queue

### Risk & Compliance
- **risk_evaluations** — Transaction risk assessments
- **risk_policies** — Configurable risk rules
- **authorizing_instruments** — Immutable financial authorization records
- **projected_transactions** — Ghost entries for future obligations
- **security_alerts** — Security event records

### Audit & Ops
- **audit_log** — Tamper-evident chain (seq_num, prev_hash, row_hash)
- **audit_log_archive** — Rotated audit entries
- **health_check_results** — Ledger health check history
- **ops_monitor_runs** — Pipeline monitoring results
- **drift_alerts** — Balance drift detection

### Billing & Orgs
- **organizations** — Multi-tenant org with plan, limits
- **organization_members** — User-org membership with roles
- **billing_overage_charges** — Usage-based overage billing
- **subscriptions** — Subscription records
- **usage_records** / **usage_aggregates** — API usage tracking

### Other
- **invoices** / **invoice_payments** — Invoice lifecycle
- **budget_envelopes** — Budget tracking per category
- **expense_categories** — IRS-aligned expense taxonomy
- **receipts** / **expense_attachments** — Receipt storage
- **recurring_expense_templates** — Recurring expense automation
- **email_log** — Outbound email tracking
- **escrow_releases** / **release_queue** / **held_funds** — Escrow hold/release pipeline
- **products** / **product_splits** / **creator_tiers** — Product and split configuration
- **ecosystems** / **ecosystem_memberships** — Multi-org ecosystem layer

### Key RPCs (grouped)

**Sales & Splits:** record_sale_atomic, calculate_sale_split, calculate_split, get_effective_split, set_creator_split, clear_creator_split
**Refunds:** record_refund_atomic_v2, get_net_refunded_cents, process_processor_refund
**Reversals:** void_transaction_atomic (soft delete + balance correction)
**Payouts:** process_payout_atomic, auto_release_ready_funds, request_fund_release, complete_fund_release
**Wallets:** wallet_deposit_atomic, wallet_withdraw_atomic, wallet_transfer_atomic
**Tax:** compute_tax_year_summaries, generate_1099_documents, calculate_1099_totals, export_1099_summary, populate_tax_document_withholding
**Reports:** calculate_trial_balance, create_trial_balance_snapshot, export_general_ledger, export_profit_loss, export_trial_balance, account_balances_as_of, account_balances_for_period, calculate_runway, diagnose_balance_sheet
**Reconciliation:** auto_match_bank_aggregator_transaction, auto_match_bank_lines
**Periods:** close_accounting_period, is_period_closed, check_period_lock
**Health:** run_ledger_health_check, run_all_health_checks, check_balance_equation, check_balance_invariants, check_double_entry_balance, verify_ledger_integrity, run_money_invariants
**Webhooks:** get_pending_webhooks, mark_webhook_delivered, mark_webhook_failed, queue_webhook, rotate_webhook_secret
**Billing:** check_usage_limits, record_api_usage, aggregate_daily_usage, get_current_period_usage
**Auth/Org:** validate_api_key_secure, create_organization_with_ledger, create_organization_for_user, handle_new_user, user_has_permission
**Ledger Init:** initialize_ledger_accounts, initialize_marketplace_accounts, initialize_standard_accounts, initialize_expense_accounts, initialize_expense_categories, initialize_tax_buckets
**Audit:** create_audit_entry, prevent_audit_log_modification, trg_audit_log_chain_hash_fn, verify_audit_chain, detect_audit_gaps, cleanup_audit_log
**Triggers:** update_account_balance (entry → account balance sync), validate_double_entry, trg_entries_immutability_fn, trg_payout_negative_balance_guard_fn, enforce_wallet_nonnegative_balance, track_transaction_usage

---

## MCP Server (packages/mcp-server/)

**Package:** `@soledgic/mcp-server` v0.1.0 — Exposes Soledgic API as AI-callable MCP tools. Executable: `soledgic-mcp`.

**Read-only tools:** get_balance, get_all_balances, get_transactions, get_trial_balance, get_profit_loss, get_balance_sheet, health_check, export_report, manage_webhooks (list/deliveries)
**Write tools:** record_sale, process_payout, record_refund, reverse_transaction, create_creator, create_checkout, record_adjustment, close_period

| File | Purpose |
|---|---|
| `src/index.ts` | MCP server entry point + stdio transport |
| `src/tools.ts` | Tool definitions + HTTP client (calls edge functions) |
| `src/schemas.ts` | Zod schemas for tool parameters |

---

## Web App Pages

### Dashboard (`apps/web/src/app/(dashboard)/`)

| Page | Path | Depends On |
|---|---|---|
| Onboarding wizard | `/onboarding` | create-ledger, organizations |
| Getting started | `/getting-started` | — |
| Dashboard home | `/dashboard` | get-transactions, balance summary |
| Transactions list | `/dashboard/transactions` | get-transactions |
| Transaction detail | `/dashboard/transactions/[id]` | get-transactions |
| Creators list | `/dashboard/creators` | participants |
| Creator detail | `/dashboard/creators/[id]` | participants |
| New creator | `/dashboard/creators/new` | participants |
| Payouts | `/dashboard/payouts` | payouts, execute-payout |
| Expenses | `/dashboard/expenses` | record-expense |
| Invoices | `/dashboard/invoices` | invoices |
| Wallets | `/dashboard/wallets` | wallets |
| Holds | `/dashboard/holds` | holds |
| Reconciliation | `/dashboard/reconciliation` | reconcile |
| Reconciliation import | `/dashboard/reconciliation/import` | import-bank-statement |
| Contractors | `/dashboard/contractors` | manage-contractors |
| Compliance | `/dashboard/compliance` | compliance |
| Reports hub | `/dashboard/reports` | — |
| P&L report | `/dashboard/reports/profit-loss` | profit-loss |
| Trial balance | `/dashboard/reports/trial-balance` | trial-balance |
| Creator statements | `/dashboard/reports/creator-statements` | send-statements, generate-pdf |
| 1099 reports | `/dashboard/reports/1099` | tax |
| Provenance | `/dashboard/reports/provenance` | reconciliation/provenance |
| Ledger list | `/ledgers` | list-ledgers |
| Ledger detail | `/ledgers/[id]` | list-ledgers |
| Ledger expenses | `/ledgers/[id]/expenses` | record-expense |
| Ledger new expense | `/ledgers/[id]/expenses/new` | record-expense |
| Ledger new sale | `/ledgers/[id]/sales/new` | record-sale |
| Ledger reports | `/ledgers/[id]/reports` | profit-loss, trial-balance |
| New ledger | `/ledgers/new` | create-ledger |
| ~~Connect~~ | `/connect` | _removed (Teller)_ |
| Billing | `/billing` | billing |

### Dashboard Settings (`/dashboard/settings/` and `/settings/`)

| Page | Path | Depends On |
|---|---|---|
| Settings home | `/dashboard/settings` | — |
| Billing settings | `/dashboard/settings/billing` | billing |
| Team management | `/dashboard/settings/team` | team API |
| API keys | `/settings/api-keys` | settings/api-keys |
| Webhooks | `/settings/webhooks` | webhooks |
| Alerts | `/settings/alerts` | configure-alerts |
| Bank accounts | `/settings/bank-accounts` | manage-bank-accounts |
| Budgets | `/settings/budgets` | manage-budgets |
| Developer tools | `/settings/developer-tools` | — |
| Ecosystem | `/settings/ecosystem` | ecosystems |
| Fraud policies | `/settings/fraud-policies` | fraud |
| Identity | `/settings/identity` | identity API |
| Notifications | `/settings/notifications` | notifications |
| Organization | `/settings/organization` | organizations |
| Payment rails | `/settings/payment-rails` | payment-rails |
| Recurring | `/settings/recurring` | manage-recurring |
| Security | `/settings/security` | — |
| Splits | `/settings/splits` | manage-splits |
| Team | `/settings/team` | team API |
| Audit log | `/settings/audit-log` | audit_log queries |

### Creator Portal (`apps/web/src/app/(creator-portal)/creator/`)

| Page | Path | Depends On |
|---|---|---|
| Creator home | `/creator` | participants |
| Login | `/creator/login` | Supabase Auth |
| Earnings | `/creator/earnings` | get-transactions |
| Payouts | `/creator/payouts` | payouts |
| Request payout | `/creator/payouts/request` | payouts |
| Statements | `/creator/statements` | send-statements, generate-pdf |
| Settings | `/creator/settings` | identity API |
| Connect | `/creator/connect` | creator/payout-setup |

### Next.js API Routes (`apps/web/src/app/api/`)

| Route | Purpose |
|---|---|
| `v1/[[...path]]` | Public API proxy → Supabase edge functions |
| `ledger-functions/[[...endpoint]]` | Internal dashboard proxy with allowlist + step-up auth |
| `webhooks/processor` | Inbound processor webhook receiver → processor_webhook_inbox |
| `checkout/[id]/setup` | Checkout setup flow |
| `checkout/[id]/complete` | Checkout completion |
| `billing` / `billing-method` | Subscription billing UI |
| `creators` | Creator CRUD for dashboard |
| `ledgers` / `ledgers/[id]/sales` / `ledgers/[id]/expenses` | Ledger management |
| `identity/*` | Profile, tax-profile, payout-profile, portfolio, participants |
| `team/*` | Team member + invitation management |
| `organizations` | Org CRUD |
| `settings/api-keys` | API key management |
| `payment-rails` | Payment rail configuration |
| `reconciliation/provenance` | Transaction provenance |
| `reports/export` | Report export |
| `transactions/lookup` | Transaction search |
| `notifications` | Notification management |
| `ecosystems/current` | Current ecosystem membership |
| `invitations/accept` | Team invitation acceptance |
| `auth/password-changed` | Post-password-change handler |
| `admin/bootstrap-platform` | Platform initialization |
| `admin/reset-test-data` | Test data reset |
| `admin/repair-orphans` | Orphan record repair |
| `creator/payout-setup` | Creator payout method setup |
| `creator/statements/[year]/[month]/[format]` | Statement PDF/CSV download |

---

## Dependency Flows

### Sale → Ledger Entries → Balance
```
checkout-sessions (or record-sale)
  → checkout-service.ts → payment-provider.ts (Finix charge)
  → record_sale_atomic RPC
    → INSERT transactions (type=sale)
    → INSERT entries (debit cash, credit creator_balance, credit platform_revenue)
    → update_account_balance trigger fires → accounts.balance updated
  → queue_webhook('sale.completed', ...)
```

### Refund → Entries → Balance
```
refunds (POST)
  → refund-service.ts
  → record_refund_atomic_v2 RPC
    → INSERT transactions (type=refund, reverses=original_sale_id)
    → INSERT entries (reverse the original sale entries, respecting refund_from)
    → Mark original sale as 'reversed' if fully refunded
    → update_account_balance trigger → balances updated
  → Optional: payment-provider.ts (processor refund via Finix)
```

### Reversal → Void or Reversing Entries
```
reverse-transaction (POST)
  → If NOT reconciled: void_transaction_atomic RPC
    → Mark transaction status='voided', INSERT reversing entries
    → update_account_balance trigger → balances corrected
  → If reconciled: reversing entry pattern
    → INSERT transactions (type=reversal)
    → INSERT entries (flip debit↔credit from original)
    → Mark original as 'reversed' if fully reversed
```

### Payout → Processor Transfer → Ledger
```
payouts (POST)
  → payout-service.ts → process_payout_atomic RPC
    → INSERT transactions (type=payout)
    → INSERT entries (debit creator_balance, credit cash)
    → Validates creator has sufficient balance (trg_payout_negative_balance_guard_fn)
execute-payout (POST)
  → CardProcessorRail → payment-provider.ts → Finix transfer API
  → Update transaction metadata with rail_used, external_id
```

### Tax → Compute Summaries → Generate Documents
```
tax (POST /tax/documents/generate)
  → tax-service.ts → compute_tax_year_summaries RPC
    → Aggregates transactions per participant per year → tax_year_summaries
  → generate_1099_documents RPC
    → Creates tax_documents rows from summaries
  → Optional: generateTaxDocumentPdfResponse → PDF generation
```

### Webhook Delivery → process-webhooks → Retry
```
Any mutation (sale, refund, payout, etc.)
  → queue_webhook RPC → INSERT webhook_deliveries (status=pending)
Cron job → process-webhooks
  → get_pending_webhooks RPC (claims batch)
  → SSRF validation (URL + DNS rebinding check)
  → webhook-signing.ts → HMAC-SHA256 signature
  → HTTP POST to endpoint_url
  → mark_webhook_delivered or mark_webhook_failed
  → Exponential backoff retry via next_retry_at
```

### Processor Webhook Ingest → Bookkeeping
```
External webhook → apps/web/src/app/api/webhooks/processor/route.ts
  → INSERT processor_webhook_inbox
Cron → process-processor-inbox
  → claim_processor_webhook_inbox RPC
  → processor-webhook-adapters.ts → normalize event
  → Handle: payout settled, refund completed, dispute opened
```

### Checkout Session Lifecycle
```
1. checkout-sessions (POST) → creates checkout_sessions row (status=pending)
2. Client → /api/checkout/[id]/setup → payment-provider identity creation
3. Client → /api/checkout/[id]/complete → Finix charge → record_sale_atomic
4. Cron → reconcile-checkout-ledger → retries stuck charged_pending_ledger sessions
```

---

## Core Systems (stable IDs)

```
1.  SVC_CHECKOUT_ORCHESTRATOR   — checkout-service.ts
2.  SVC_REFUND_ENGINE           — refund-service.ts
3.  SVC_REVERSAL_ENGINE         — reverse-transaction/index.ts
4.  SVC_PAYOUT_ENGINE           — payout-service.ts
5.  SVC_PAYMENT_PROVIDER        — payment-provider.ts (Finix adapter)
6.  SVC_TAX_ENGINE              — tax-service.ts
7.  SVC_IDENTITY_ENGINE         — identity-service.ts
8.  SVC_WALLET_ENGINE           — wallet-service.ts
9.  SVC_COMPLIANCE_MONITOR      — compliance-service.ts
10. SVC_WEBHOOK_PROCESSOR       — webhook-signing.ts + process-webhooks
11. SVC_INVOICE_ENGINE          — invoices/index.ts
12. SVC_RECONCILIATION_ENGINE   — reconcile/index.ts
13. SVC_BILLING                 — billing/index.ts
14. SVC_SECURITY_ALERTS         — security-alerts/index.ts
15. SVC_RECORD_EXPENSE          — record-expense/index.ts
16. SVC_RECORD_INCOME           — record-income/index.ts
17. SVC_RECORD_BILL             — record-bill/index.ts
18. SVC_FRAUD_ROUTER            — fraud/index.ts → fraud-service.ts
19. SVC_TRANSFER_ROUTER         — transfers/index.ts → wallet-service.ts
20. SVC_HOLDS_ROUTER            — holds/index.ts → holds-service.ts
21. SVC_WALLET_ROUTER           — wallets/index.ts → wallet-service.ts
22. SVC_SPLIT_MANAGER           — manage-splits/index.ts
23. SVC_RECURRING_MANAGER       — manage-recurring/index.ts
24. SVC_BANK_ACCOUNT_MANAGER    — manage-bank-accounts/index.ts
25. SVC_PDF_GENERATOR           — generate-pdf/index.ts
26. SVC_STATEMENT_SENDER        — send-statements/index.ts
27. SVC_IMPORT_ENGINE           — import-transactions/index.ts
28. SVC_PREFLIGHT_AUTH          — preflight-authorization/index.ts
29. SVC_FROZEN_STATEMENTS       — frozen-statements/index.ts
```

---

## Service Graph (machine-parsable)

```
SERVICE: SVC_REFUND_ENGINE
FILE: supabase/functions/_shared/refund-service.ts
RISK: CRITICAL_LEDGER
CALLS: RPC_RECORD_REFUND_ATOMIC_V2, RPC_GET_NET_REFUNDED_CENTS, RPC_VOID_TRANSACTION_ATOMIC, SVC_PAYMENT_PROVIDER, RPC_QUEUE_WEBHOOK
CALLED_BY: API_REFUNDS
WRITES: transactions, entries, pending_processor_refunds
READS: transactions, entries (net refunded calc)
EXTERNAL: EXT_FINIX (processor refunds)
CONCURRENCY: FOR UPDATE on sale row via RPC; idempotency_key → unique reference_id
TESTED_BY: treasury-services_test.ts (recordRefundResponse, listRefundsResponse), sdk/index.test.ts (createRefund)
CHANGE_IMPACT: API_REFUNDS, MCP_RECORD_REFUND, SDK_createRefund, UI_record-refund-modal, TEST_test-client.createRefund

SERVICE: SVC_REVERSAL_ENGINE
FILE: supabase/functions/reverse-transaction/index.ts
RISK: CRITICAL_LEDGER
CALLS: RPC_VOID_TRANSACTION_ATOMIC, syncSaleRefundStateAfterRefundReversal (inline)
CALLED_BY: API_REVERSE_TRANSACTION
WRITES: transactions (reversal + void), entries
READS: transactions, entries, accounting_periods
CONCURRENCY: cumulative reversal cap query; deterministic reference_id from idempotency_key; unique index prevents duplicates
TESTED_BY: sdk/index.test.ts (reverseTransaction)
CHANGE_IMPACT: API_REVERSE_TRANSACTION, MCP_REVERSE_TRANSACTION, SDK_reverseTransaction, UI_reverse-transaction-modal, TEST_test-client.reverseTransaction

SERVICE: SVC_CHECKOUT_ORCHESTRATOR
FILE: supabase/functions/_shared/checkout-service.ts
RISK: CRITICAL_LEDGER
CALLS: SVC_PAYMENT_PROVIDER (Finix charge), RPC_RECORD_SALE_ATOMIC
CALLED_BY: API_CHECKOUT_SESSIONS
WRITES: checkout_sessions, transactions, entries
READS: checkout_sessions
EXTERNAL: EXT_FINIX (payment charge)
CONCURRENCY: checkout_sessions status state machine; record_sale_atomic is atomic
TESTED_BY: treasury-services_test.ts (createCheckoutResponse)
CHANGE_IMPACT: API_CHECKOUT_SESSIONS, /pay/[id] pages, CRON_RECONCILE_CHECKOUT_LEDGER

SERVICE: SVC_PAYOUT_ENGINE
FILE: supabase/functions/_shared/payout-service.ts
RISK: CRITICAL_LEDGER
CALLS: RPC_PROCESS_PAYOUT_ATOMIC, RPC_QUEUE_WEBHOOK
CALLED_BY: API_PAYOUTS
WRITES: transactions (payout), entries
READS: accounts (balance check)
CONCURRENCY: negative balance guard trigger; deadlock retry (up to 3 attempts)
TESTED_BY: treasury-services_test.ts (processPayoutResponse), sdk/index.test.ts (createPayout)
CHANGE_IMPACT: API_PAYOUTS, API_EXECUTE_PAYOUT, MCP_PROCESS_PAYOUT, SDK_createPayout, UI_process-payout-modal

SERVICE: SVC_PAYMENT_PROVIDER
FILE: supabase/functions/_shared/payment-provider.ts
RISK: CRITICAL_EXTERNAL
CALLS: EXT_FINIX (transfers, refunds, identities, settlements)
CALLED_BY: SVC_CHECKOUT_ORCHESTRATOR, SVC_REFUND_ENGINE, SVC_PAYOUT_ENGINE (execute-payout), holds-service, checkout-sessions/index.ts, refunds/index.ts, holds/index.ts
ENV: PROCESSOR_BASE_URL, PROCESSOR_USERNAME, PROCESSOR_PASSWORD, PROCESSOR_MERCHANT_ID, PROCESSOR_APPLICATION_ID
CONCURRENCY: idempotency_id on all Finix calls; Finix-Version header trim-then-fallback
TESTED_BY: payment-provider_test.ts (16 tests), sdk/index.test.ts (parameterized contract tests)
CHANGE_IMPACT: ALL money movement — checkout, refund, payout execution, holds

SERVICE: SVC_TAX_ENGINE
FILE: supabase/functions/_shared/tax-service.ts
RISK: FINANCIAL_ORCHESTRATION
CALLS: RPC_COMPUTE_TAX_YEAR_SUMMARIES, RPC_GENERATE_1099_DOCUMENTS, FUNC_GENERATE_PDF (internal), EXT_RESEND (Copy B email)
CALLED_BY: API_TAX
WRITES: tax_documents, tax_year_summaries, email_log
READS: tax_documents, tax_year_summaries, participant_identity_links, shared_tax_profiles, accounts
EXTERNAL: EXT_RESEND (email delivery)
TESTED_BY: sdk/index.test.ts (tax methods)
CHANGE_IMPACT: API_TAX, 1099 page, SDK tax methods, creator statements page

SERVICE: SVC_IDENTITY_ENGINE
FILE: supabase/functions/_shared/identity-service.ts
RISK: API_SURFACE
CALLS: (DB queries only)
CALLED_BY: SVC_TAX_ENGINE, participants-service, submit-tax-info
WRITES: participant_identity_links, shared_tax_profiles, shared_payout_profiles
READS: participant_identity_links, shared_tax_profiles, shared_payout_profiles
CHANGE_IMPACT: participant detail, tax calculations, creator portal auth, backup withholding checks

SERVICE: SVC_WALLET_ENGINE
FILE: supabase/functions/_shared/wallet-service.ts
RISK: FINANCIAL_ORCHESTRATION
CALLS: RPC_WALLET_DEPOSIT, RPC_WALLET_WITHDRAW, RPC_WALLET_TRANSFER
CALLED_BY: API_WALLETS, API_TRANSFERS
WRITES: accounts, transactions, entries
CONCURRENCY: enforce_wallet_nonnegative_balance trigger
TESTED_BY: sdk/index.test.ts (wallet methods)
CHANGE_IMPACT: API_WALLETS, API_TRANSFERS, wallets page, SDK wallet methods

SERVICE: SVC_WEBHOOK_PROCESSOR
FILE: supabase/functions/process-webhooks/index.ts + _shared/webhook-signing.ts
RISK: API_SURFACE
CALLS: HTTP POST to webhook_endpoints.url, RPC_GET_PENDING_WEBHOOKS, RPC_MARK_WEBHOOK_DELIVERED
CALLED_BY: CRON (x-cron-secret)
READS: webhook_endpoints, webhook_deliveries
WRITES: webhook_deliveries (status, response, next_retry_at)
CONCURRENCY: claim-then-process pattern; exponential backoff retry
CHANGE_IMPACT: all outbound webhook delivery

SERVICE: SVC_COMPLIANCE_MONITOR
FILE: supabase/functions/_shared/compliance-service.ts
RISK: UI_ONLY
CALLS: (DB queries only — audit_log)
CALLED_BY: API_COMPLIANCE
READS: audit_log
CHANGE_IMPACT: compliance page only

SERVICE: SVC_BILLING
FILE: supabase/functions/billing/index.ts
RISK: API_SURFACE
CALLS: (DB queries only — organizations, ledgers, transactions, billing_overage_charges, organization_members)
CALLED_BY: API_BILLING (JWT auth, not API key)
READS: organizations, organization_members, ledgers, transactions, billing_overage_charges
WRITES: (none — read-only usage/subscription summaries)
CHANGE_IMPACT: API_BILLING, billing settings page, SDK billing methods

SERVICE: SVC_INVOICE_ENGINE
FILE: supabase/functions/invoices/index.ts
RISK: CRITICAL_LEDGER
CALLS: RPC_RECORD_INVOICE_PAYMENT_ATOMIC, RPC_SEND_INVOICE_ATOMIC, RPC_VOID_INVOICE_ATOMIC
CALLED_BY: API_INVOICES
WRITES: invoices, invoice_payments, transactions, entries, audit_log
READS: invoices, invoice_payments
CONCURRENCY: atomic RPCs with row locking (send_invoice_atomic, record_invoice_payment_atomic, void_invoice_atomic)
CHANGE_IMPACT: API_INVOICES, invoices page, SDK invoice methods

SERVICE: SVC_RECONCILIATION_ENGINE
FILE: supabase/functions/reconcile/index.ts
RISK: FINANCIAL_ORCHESTRATION
CALLS: RPC_AUTO_MATCH_BANK_AGGREGATOR_TRANSACTION
CALLED_BY: API_RECONCILE
WRITES: bank_matches, transactions (status → reconciled), reconciliation_snapshots, audit_log
READS: transactions, bank_matches, accounting_periods, reconciliation_snapshots
CONCURRENCY: period lock check before match/unmatch; snapshot integrity hash via SHA-256
CHANGE_IMPACT: API_RECONCILE, reconciliation page, SDK reconciliation methods

SERVICE: SVC_BANK_ACCOUNT_MANAGER
FILE: supabase/functions/manage-bank-accounts/index.ts
RISK: API_SURFACE
CALLS: (DB queries only)
CALLED_BY: API_MANAGE_BANK_ACCOUNTS
WRITES: bank_accounts, accounts (credit_card type), audit_log
READS: bank_accounts
CHANGE_IMPACT: API_MANAGE_BANK_ACCOUNTS, bank accounts settings page, SDK bank account methods

SERVICE: SVC_FRAUD_ROUTER
FILE: supabase/functions/fraud/index.ts
RISK: API_SURFACE
CALLS: SVC_FRAUD_SERVICE (fraud-service.ts — createFraudEvaluationResponse, listFraudPoliciesResponse, deleteFraudPolicyResponse, getFraudEvaluationResponse, createFraudPolicyResponse)
CALLED_BY: API_FRAUD
WRITES: risk_evaluations, risk_policies
READS: risk_evaluations, risk_policies
CHANGE_IMPACT: API_FRAUD, fraud policies settings page, SDK fraud methods

SERVICE: SVC_SECURITY_ALERTS
FILE: supabase/functions/security-alerts/index.ts
RISK: API_SURFACE
CALLS: RPC_GET_RATE_LIMIT_OFFENDERS, EXT_RESEND (email alerts)
CALLED_BY: CRON (x-cron-secret auth)
WRITES: security_alerts, audit_log
READS: audit_log (rate_limited, auth_failed, preauth_rate_limited, blocked_country, ssrf_attempt, handler_error events)
EXTERNAL: EXT_RESEND (security alert emails)
CHANGE_IMPACT: security monitoring, alert emails

SERVICE: SVC_TRANSFER_ROUTER
FILE: supabase/functions/transfers/index.ts
RISK: FINANCIAL_ORCHESTRATION
CALLS: SVC_WALLET_ENGINE (transferWalletFundsResponse → RPC_WALLET_TRANSFER)
CALLED_BY: API_TRANSFERS
WRITES: accounts, transactions, entries (via wallet_transfer_atomic)
READS: accounts
CONCURRENCY: UUID-ordered locking in wallet_transfer_atomic (deadlock-free)
CHANGE_IMPACT: API_TRANSFERS, SDK createTransfer

SERVICE: SVC_HOLDS_ROUTER
FILE: supabase/functions/holds/index.ts
RISK: FINANCIAL_ORCHESTRATION
CALLS: SVC_HOLDS_SERVICE (holds-service.ts — listHeldFundsResponse, getHeldFundsSummaryResponse, releaseHeldFundsResponse)
CALLED_BY: API_HOLDS
WRITES: escrow_releases, entries (via release_held_funds)
READS: entries (held funds), escrow_releases, release_queue
CHANGE_IMPACT: API_HOLDS, holds page, SDK holds methods

SERVICE: SVC_WALLET_ROUTER
FILE: supabase/functions/wallets/index.ts
RISK: FINANCIAL_ORCHESTRATION
CALLS: SVC_WALLET_ENGINE (wallet-service.ts — all wallet operations)
CALLED_BY: API_WALLETS
WRITES: accounts, transactions, entries (via wallet_deposit/withdraw/transfer_atomic)
READS: accounts, entries
CONCURRENCY: enforce_wallet_nonnegative_balance trigger; UUID-ordered locking for transfers
CHANGE_IMPACT: API_WALLETS, wallets page, SDK wallet methods

SERVICE: SVC_SPLIT_MANAGER
FILE: supabase/functions/manage-splits/index.ts
RISK: FINANCIAL_ORCHESTRATION
CALLS: (DB queries only — accounts, creator_tiers, product_splits)
CALLED_BY: API_MANAGE_SPLITS
WRITES: accounts (metadata.custom_split_percent, metadata.tier_id), product_splits, audit_log
READS: accounts, creator_tiers, product_splits
CHANGE_IMPACT: API_MANAGE_SPLITS, splits settings page, SDK split methods, sale split calculations

SERVICE: SVC_RECURRING_MANAGER
FILE: supabase/functions/manage-recurring/index.ts
RISK: API_SURFACE
CALLS: (DB queries only — recurring_expense_templates, expense_categories)
CALLED_BY: API_MANAGE_RECURRING
WRITES: recurring_expense_templates
READS: recurring_expense_templates, expense_categories
CHANGE_IMPACT: API_MANAGE_RECURRING, recurring settings page, SDK recurring methods

SERVICE: SVC_RECORD_EXPENSE
FILE: supabase/functions/record-expense/index.ts
RISK: CRITICAL_LEDGER
CALLS: (inline double-entry — transactions INSERT, entries INSERT)
CALLED_BY: API_RECORD_EXPENSE
WRITES: transactions, entries, accounts (auto-create expense/credit_card), projected_transactions (snap-to match), risk_evaluations (acknowledged_at), audit_log
READS: transactions (duplicate check), accounts, authorizing_instruments, projected_transactions, risk_evaluations
CONCURRENCY: reference_id duplicate check (not atomic — app-level guard)
CHANGE_IMPACT: API_RECORD_EXPENSE, expenses page, SDK recordExpense

SERVICE: SVC_RECORD_INCOME
FILE: supabase/functions/record-income/index.ts
RISK: CRITICAL_LEDGER
CALLS: (inline double-entry — transactions INSERT, entries INSERT)
CALLED_BY: API_RECORD_INCOME
WRITES: transactions, entries, accounts (auto-create revenue), audit_log
READS: transactions (duplicate check), accounts
CONCURRENCY: reference_id duplicate check (not atomic — app-level guard)
CHANGE_IMPACT: API_RECORD_INCOME, SDK recordIncome

SERVICE: SVC_RECORD_BILL
FILE: supabase/functions/record-bill/index.ts
RISK: CRITICAL_LEDGER
CALLS: (inline double-entry — transactions INSERT, entries INSERT)
CALLED_BY: API_RECORD_BILL
WRITES: transactions, entries, accounts (auto-create expense/accounts_payable), projected_transactions (snap-to match), risk_evaluations (acknowledged_at), audit_log
READS: transactions, accounts, expense_categories, authorizing_instruments, projected_transactions, risk_evaluations
CONCURRENCY: reference_id duplicate check (not atomic — app-level guard)
CHANGE_IMPACT: API_RECORD_BILL, SDK recordBill

SERVICE: SVC_PDF_GENERATOR
FILE: supabase/functions/generate-pdf/index.ts
RISK: API_SURFACE
CALLS: (inline PDF rendering — no shared services)
CALLED_BY: SDK generatePDF, getProfitLossPDF, getTrialBalancePDF, get1099PDF, getCreatorStatement
READS: ledgers, transactions, entries, accounts, frozen_statements, tax_documents
WRITES: (none — read-only PDF generation)
TESTED_BY: _shared/__tests__/generate-pdf_test.ts (22 tests)
CHANGE_IMPACT: PDF report downloads, 1099 form generation

SERVICE: SVC_STATEMENT_SENDER
FILE: supabase/functions/send-statements/index.ts
RISK: CRITICAL_EXTERNAL
CALLS: EXT_RESEND
CALLED_BY: SDK configureEmail, sendMonthlyStatements, sendCreatorStatement, CRON
READS: ledgers, transactions, entries, accounts, creators
WRITES: email_log, ledgers (email_config)
TESTED_BY: _shared/__tests__/send-statements_test.ts (28 tests)
CHANGE_IMPACT: Creator statement emails, email configuration

SERVICE: SVC_IMPORT_ENGINE
FILE: supabase/functions/import-transactions/index.ts
RISK: CRITICAL_LEDGER
CALLS: financial-file-parsers.ts (OFX/QFX, CAMT.053, BAI2, MT940), inline CSV parsing, bank_transactions INSERT
CALLED_BY: SDK importTransactions, parseImportFile, getImportTemplates, saveImportTemplate
READS: bank_connections, import_templates
WRITES: bank_transactions, import_templates
TESTED_BY: _shared/__tests__/import-transactions_test.ts (58 tests), _shared/__tests__/financial-file-parsers_test.ts (27 tests)
CHANGE_IMPACT: Bank transaction imports, CSV parsing

SERVICE: SVC_PREFLIGHT_AUTH
FILE: supabase/functions/preflight-authorization/index.ts
RISK: FINANCIAL_ORCHESTRATION
CALLS: (inline policy evaluation — authorization_policies, authorization_decisions)
CALLED_BY: SDK preflightAuthorization, preflightAndRecordExpense, preflightAndRecordBill
READS: authorization_policies, authorization_decisions, authorizing_instruments, projected_transactions
WRITES: authorization_decisions
TESTED_BY: _shared/__tests__/preflight-authorization_test.ts (31 tests)
CHANGE_IMPACT: Expense approval flow, budget enforcement

SERVICE: SVC_FROZEN_STATEMENTS
FILE: supabase/functions/frozen-statements/index.ts
RISK: FINANCIAL_ORCHESTRATION
CALLS: (inline hash verification — SHA-256 integrity)
CALLED_BY: SDK generateFrozenStatements, getFrozenStatement, listFrozenStatements, verifyFrozenStatements
READS: frozen_statements, accounting_periods, transactions, entries, accounts
WRITES: frozen_statements, trial_balance_snapshots
TESTED_BY: _shared/__tests__/frozen-statements_test.ts (46 tests)
CHANGE_IMPACT: Period-end statement generation, audit integrity verification
```

---

## Critical RPCs (with callers, locks, and tests)

```
RPC: RPC_RECORD_SALE_ATOMIC
CALLERS: record-sale/index.ts, SVC_CHECKOUT_ORCHESTRATOR, CRON_RECONCILE_CHECKOUT_LEDGER
TRIGGERS: update_account_balance, validate_double_entry, track_transaction_usage
DOWNSTREAM: RPC_QUEUE_WEBHOOK → CRON_PROCESS_WEBHOOKS
LOCK: implicit row-level on INSERT
TESTED_BY: (integration tests only)

RPC: RPC_RECORD_REFUND_ATOMIC_V2
CALLERS: SVC_REFUND_ENGINE (both ledger-only and pre-processor paths)
DEPENDS_ON: RPC_GET_NET_REFUNDED_CENTS
TRIGGERS: update_account_balance
DOWNSTREAM: RPC_QUEUE_WEBHOOK → CRON_PROCESS_WEBHOOKS
LOCK: FOR UPDATE on original sale row (prevents concurrent refund races)
CONCURRENCY: unique reference_id via idempotency_key; EXCEPTION WHEN unique_violation handled
TESTED_BY: treasury-services_test.ts (refund-after-reversal regression)

RPC: RPC_VOID_TRANSACTION_ATOMIC
CALLERS: SVC_REVERSAL_ENGINE (void path), SVC_REFUND_ENGINE (processor rollback)
CREATES: reversal transaction + flipped entries (proper double-entry)
TRIGGERS: update_account_balance (via entry inserts)
LOCK: FOR UPDATE on transaction row
GUARD: reconciliation check (blocks void on reconciled transactions)

RPC: RPC_PROCESS_PAYOUT_ATOMIC
CALLERS: SVC_PAYOUT_ENGINE
GUARD: trg_payout_negative_balance_guard_fn (prevents overdraft)
TRIGGERS: update_account_balance
LOCK: implicit on entry INSERT

TRIGGER: TRG_UPDATE_ACCOUNT_BALANCE
FIRES_ON: ANY INSERT to entries table
UPDATES: accounts.balance (debit-normal vs credit-normal classification)
RISK: CRITICAL_LEDGER — this is the balance source of truth
CHANGE_IMPACT: every financial operation in the system

TRIGGER: TRG_ENTRIES_IMMUTABILITY
FIRES_ON: BEFORE DELETE OR UPDATE on entries
FUNCTION: trg_entries_immutability_fn
RISK: CRITICAL_LEDGER — prevents tampering with journal entries
ENFORCES: entries rows are append-only (no UPDATE, no DELETE)
CHANGE_IMPACT: all financial operations — removing this would allow ledger tampering

TRIGGER: TRG_PAYOUT_NEGATIVE_BALANCE_GUARD
FIRES_ON: BEFORE INSERT on entries
FUNCTION: trg_payout_negative_balance_guard_fn
RISK: CRITICAL_LEDGER — prevents overdraft on payout
ENFORCES: INVARIANT_NONNEGATIVE_BALANCE (creator_balance cannot go negative)
CHANGE_IMPACT: payout flow — removing this would allow negative balances

TRIGGER: TRG_ENFORCE_DOUBLE_ENTRY
FIRES_ON: CONSTRAINT TRIGGER AFTER INSERT on entries (DEFERRABLE INITIALLY DEFERRED)
FUNCTION: validate_double_entry_at_commit
RISK: CRITICAL_LEDGER — validates sum(debits) == sum(credits) per transaction at COMMIT
ENFORCES: INVARIANT_DOUBLE_ENTRY
CHANGE_IMPACT: every financial operation — removing this would allow unbalanced transactions

TRIGGER: TRG_ENTRIES_DOUBLE_ENTRY_DELETE
FIRES_ON: CONSTRAINT TRIGGER AFTER DELETE on entries (DEFERRABLE INITIALLY DEFERRED)
FUNCTION: validate_double_entry_on_delete
RISK: CRITICAL_LEDGER — prevents deleting entries that would break double-entry balance
ENFORCES: INVARIANT_DOUBLE_ENTRY (on delete path, paired with immutability trigger)

TRIGGER: TRG_AUDIT_LOG_CHAIN_HASH
FIRES_ON: BEFORE INSERT on audit_log
FUNCTION: trg_audit_log_chain_hash_fn
RISK: CRITICAL_LEDGER — tamper-evident hash chain
ENFORCES: INVARIANT_AUDIT_CHAIN (seq_num, prev_hash, row_hash)
CHANGE_IMPACT: audit integrity — removing this would break chain verification

TRIGGER: TRG_AUDIT_LOG_IMMUTABLE
FIRES_ON: BEFORE DELETE OR UPDATE on audit_log
FUNCTION: trg_audit_log_immutable_fn
RISK: CRITICAL_LEDGER — prevents tampering with audit trail
ENFORCES: INVARIANT_AUDIT_CHAIN (immutability half)
CHANGE_IMPACT: audit integrity

TRIGGER: TRG_AUDIT_LOG_ARCHIVE_IMMUTABLE
FIRES_ON: BEFORE DELETE OR UPDATE on audit_log_archive
FUNCTION: trg_audit_log_immutable_fn
RISK: CRITICAL_LEDGER — prevents tampering with archived audit entries
ENFORCES: INVARIANT_AUDIT_CHAIN (archive immutability)

TRIGGER: TRG_WALLET_NONNEG_BALANCE
FIRES_ON: BEFORE INSERT OR UPDATE OF balance, account_type on accounts WHEN (account_type = 'user_wallet')
FUNCTION: enforce_wallet_nonnegative_balance
RISK: CRITICAL_LEDGER — prevents wallet overdraft
ENFORCES: INVARIANT_NONNEGATIVE_BALANCE (wallet accounts)
CHANGE_IMPACT: wallet deposit/withdraw/transfer flows

TRIGGER: TRG_CHECK_PERIOD_CLOSED
FIRES_ON: BEFORE INSERT on transactions
FUNCTION: check_period_not_closed
RISK: FINANCIAL_ORCHESTRATION — blocks transactions in closed accounting periods
ENFORCES: period lock integrity
CHANGE_IMPACT: all transaction creation when periods are closed

TRIGGER: TRG_CHECK_PERIOD_LOCK
FIRES_ON: BEFORE INSERT OR UPDATE on transactions
FUNCTION: check_period_lock
RISK: FINANCIAL_ORCHESTRATION — blocks transactions in locked periods
ENFORCES: period lock integrity (stricter than closed check)

TRIGGER: TRG_TRANSACTION_USAGE
FIRES_ON: AFTER INSERT on transactions
FUNCTION: track_transaction_usage
RISK: API_SURFACE — billing metering
UPDATES: usage tracking for overage billing
CHANGE_IMPACT: billing accuracy

TRIGGER: TRG_ENFORCE_INSTRUMENT_IMMUTABILITY
FIRES_ON: BEFORE UPDATE on authorizing_instruments
FUNCTION: prevent_instrument_update
RISK: CRITICAL_LEDGER — authorizing instruments are immutable financial records
ENFORCES: instrument immutability (contracts, POs cannot be silently changed)

TRIGGER: TRG_PREVENT_INSTRUMENT_DELETE_IF_LINKED
FIRES_ON: BEFORE DELETE on authorizing_instruments
FUNCTION: prevent_linked_instrument_delete
RISK: CRITICAL_LEDGER — prevents deletion of instruments linked to transactions
ENFORCES: referential integrity for financial authorization records

TRIGGER: TRG_CREATE_LEDGER_ACCOUNTS
FIRES_ON: AFTER INSERT on ledgers
FUNCTION: auto_create_ledger_accounts
RISK: FINANCIAL_ORCHESTRATION — auto-provisions chart of accounts for new ledgers
CHANGE_IMPACT: ledger creation flow

TRIGGER: TRG_ENFORCE_LEDGER_LIMIT
FIRES_ON: BEFORE INSERT on ledgers
FUNCTION: enforce_ledger_limit
RISK: API_SURFACE — billing enforcement
ENFORCES: organization max_ledgers limit

TRIGGER: TRG_CONTRACTOR_PAYMENT_YTD
FIRES_ON: AFTER INSERT on contractor_payments
FUNCTION: update_contractor_ytd
RISK: FINANCIAL_ORCHESTRATION — maintains running YTD totals for 1099 reporting
CHANGE_IMPACT: tax/1099 accuracy
```

---

## External System Boundaries

```
EXT_FINIX — Payment processor
  adapter: SVC_PAYMENT_PROVIDER (payment-provider.ts)
  auth: HTTP Basic (PROCESSOR_USERNAME:PROCESSOR_PASSWORD), Finix-Version header (default 2022-02-01)
  base_url: PROCESSOR_BASE_URL (sandbox vs production validated at runtime — cross-env mismatch blocked)
  timeout: PROCESSOR_REQUEST_TIMEOUT_MS (default 30 000 ms, minimum 1 000 ms)
  endpoints_used:
    POST {base}/transfers          — DEBIT (charge): source + merchant; CREDIT (payout): destination + operation_key + processor
    POST {base}/transfers/{id}/reversals — refunds (partial via refund_amount, full if omitted)
    GET  {base}/transfers/{id}     — payment status lookup
    (refundsPathTemplate override: PROCESSOR_REFUNDS_PATH_TEMPLATE env var, replaces {id})
  idempotency: idempotency_id field on transfers AND reversals (processor-level duplicate prevention)
  tag_sanitization: keys lowercase alphanum+underscore max 40 chars, values max 500 chars, max 50 pairs
  merchant_model: shared-merchant (PROCESSOR_MERCHANT_ID from env, override attempts rejected)
  status_mapping: SUCCEEDED/SETTLED/COMPLETED → succeeded; FAILED/CANCELED/REJECTED/DECLINED/RETURNED → failed; PROCESSING/PENDING/CREATED/SENT → processing
  callers:
    SVC_CHECKOUT_ORCHESTRATOR (checkout-service.ts) — DEBIT charges
    SVC_REFUND_ENGINE (refund-service.ts) — reversals
    SVC_PAYOUT_ENGINE (execute-payout/index.ts) — CREDIT payouts
    SVC_HOLDS_ENGINE (holds-service.ts) — hold charges
    CRON_BILL_OVERAGES (bill-overages/index.ts) — platform billing charges

EXT_RESEND — Email delivery (https://api.resend.com/emails)
  auth: Bearer token via RESEND_API_KEY env var
  sender: FROM_EMAIL env var (default noreply@soledgic.com)
  protocol: direct fetch POST to https://api.resend.com/emails (no SDK on Deno side; SDK used in Next.js via `resend` npm package)
  callers_deno (direct fetch):
    send-statements/index.ts — account/creator statement delivery (ResendProvider class)
    _shared/tax-service.ts — 1099 Copy B email to creators
    _shared/payout-service.ts — payout confirmation emails
    security-alerts/index.ts — rate-limit & auth-failure alert emails (CRON)
    send-breach-alert/index.ts — data breach notification emails
    ops-monitor/index.ts — ops alert emails when thresholds breached
    configure-alerts/index.ts — test email for alert configuration
    project-intent/index.ts — new-project notification email
    health-check/index.ts — Resend API connectivity probe (not delivery)
  callers_nextjs (Resend SDK in apps/web/src/lib/email.ts):
    sendTeamInviteEmail — team member invitation (7-day expiry)
    sendWelcomeEmail — post-signup welcome
    sendBillingReminderEmail — billing checkpoint reminder
    sendPaymentFailedEmail — failed payment notification
    sendPayoutProcessedEmail — creator payout confirmation
    sendSecurityAlertEmail — new_login / password_changed / api_key_created alerts

EXT_STRIPE — Payment processor (default, charges/refunds/payouts)
  adapter: stripe-rest.ts (Deno edge functions), stripe.ts (Next.js)
  provider: stripe-payment-provider.ts implements PaymentProvider
  webhook: stripe-webhook-adapter.ts, stripe-billing webhook route
  auth: STRIPE_SECRET_KEY (Bearer), STRIPE_WEBHOOK_SECRET (signature)
  env: PAYMENT_PROVIDER=stripe (default) or finix

EXT_SENTRY — Error tracking
  adapter: error-tracking.ts (HTTP envelope, no SDK)
  auth: DSN in SENTRY_DSN env var

EXT_SUPABASE_STORAGE — File storage (receipts, PDFs, NACHA files)
  adapter: supabase.storage (built-in client)
```

---

## Architecture Health (2026-03-15 snapshot)

```
graph:health output:
  Files:            308
  Dependency edges: 60
  Coupling ratio:   0.19 edges/file
  Status:           HEALTHY

Hub Dependency Ratio (top 5):
  _shared/utils.ts                          8 importers (13.3% of edges)
  _shared/payment-provider.ts               8 importers (13.3% of edges)
  (marketing)/docs/constants.ts             5 importers (8.3% of edges)
  _shared/error-tracking.ts                 3 importers (5.0% of edges)
  sdk/typescript/src/types.ts               3 importers (5.0% of edges)

  HDR (all):    45.0% (includes infra hubs — expected high)
  HDR (domain): 26.7% (CENTRALIZING — warning zone is 30%)

God-service detection: none
```

### Hub Concern: SVC_PAYMENT_PROVIDER (payment-provider.ts)

8 importers (13.3% of edges). **Boundary rule:** Payment provider touches real money — only orchestration services and their entry-point edge functions may import it. The file mixes exported **types** (7 interfaces + 1 type alias, ~90 lines) with the **runtime provider class + factory** (~350 lines). Consumers that only need types (e.g. for function signatures or test stubs) still pull in the full module.

**Importers:** checkout-service.ts, refund-service.ts, execute-payout/index.ts, holds-service.ts, bill-overages/index.ts, checkout-sessions/index.ts, refunds/index.ts, holds/index.ts

**Mitigation:** Extract the type-only exports (`PaymentProviderName`, `PaymentIntentParams`, `PaymentIntentResult`, `CaptureResult`, `RefundParams`, `RefundResult`, `PaymentStatus`, `ProcessorProviderConfig`, `PaymentProviderFactoryOptions`, `PaymentProvider` interface) into a separate `_shared/payment-types.ts`. Consumers that only need types import from `payment-types.ts`; only consumers that call `getPaymentProvider()` import from `payment-provider.ts`. This would reduce the hub's importer count and keep HDR (domain) well below 30%.

---

## Entry Points (full chains)

```
ENTRYPOINT: CHECKOUT
  UI: /pay/[id]/page.tsx → /api/checkout/[id]/setup → /api/checkout/[id]/complete
  API: POST /v1/checkout-sessions
  FUNCTION: checkout-sessions → SVC_CHECKOUT_ORCHESTRATOR → SVC_PAYMENT_PROVIDER
  RPC: record_sale_atomic → entries → TRG_UPDATE_ACCOUNT_BALANCE
  CRON: reconcile-checkout-ledger (retries stuck sessions)

ENTRYPOINT: REFUND
  UI: record-refund-modal.tsx → callLedgerFunction('refunds')
  API: POST /v1/refunds
  FUNCTION: refunds → SVC_REFUND_ENGINE
  RPC: record_refund_atomic_v2 → entries → TRG_UPDATE_ACCOUNT_BALANCE
  EXTERNAL: SVC_PAYMENT_PROVIDER (optional processor refund)

ENTRYPOINT: REVERSAL
  UI: reverse-transaction-modal.tsx → callLedgerFunction('reverse-transaction')
  API: POST /v1/reverse-transaction
  FUNCTION: reverse-transaction → SVC_REVERSAL_ENGINE
  RPC: void_transaction_atomic (or inline reversing entries) → TRG_UPDATE_ACCOUNT_BALANCE

ENTRYPOINT: PAYOUT
  UI: process-payout-modal.tsx → callLedgerFunction('payouts')
  API: POST /v1/payouts → POST /v1/execute-payout
  FUNCTION: payouts → SVC_PAYOUT_ENGINE → execute-payout → SVC_PAYMENT_PROVIDER
  RPC: process_payout_atomic → entries → TRG_UPDATE_ACCOUNT_BALANCE
  EXTERNAL: EXT_FINIX (ACH/card push transfer)

ENTRYPOINT: TAX_1099
  UI: 1099/page.tsx → callLedgerFunction('tax/documents/generate')
  API: POST /v1/tax/documents/generate
  FUNCTION: tax → SVC_TAX_ENGINE
  RPC: compute_tax_year_summaries → generate_1099_documents
  DOWNSTREAM: generate PDF → deliver Copy B (EXT_RESEND)

ENTRYPOINT: INBOUND_WEBHOOK
  EXTERNAL: EXT_FINIX → /api/webhooks/processor → processor_webhook_inbox INSERT
  CRON: process-processor-inbox → claim + normalize → handle payout/refund/dispute
  RPC: varies by event type (settlement recording, dispute flagging)
```

---

## Risk Classification

```
CRITICAL_LEDGER — changes affect account balances or double-entry integrity
  SVC_REFUND_ENGINE, SVC_REVERSAL_ENGINE, SVC_CHECKOUT_ORCHESTRATOR,
  SVC_PAYOUT_ENGINE, SVC_INVOICE_ENGINE, SVC_RECORD_EXPENSE, SVC_RECORD_INCOME,
  SVC_RECORD_BILL, TRG_UPDATE_ACCOUNT_BALANCE, TRG_ENTRIES_IMMUTABILITY,
  TRG_PAYOUT_NEGATIVE_BALANCE_GUARD, TRG_ENFORCE_DOUBLE_ENTRY, TRG_AUDIT_LOG_CHAIN_HASH,
  TRG_AUDIT_LOG_IMMUTABLE, TRG_WALLET_NONNEG_BALANCE, TRG_ENFORCE_INSTRUMENT_IMMUTABILITY,
  RPC_RECORD_SALE_ATOMIC, RPC_RECORD_REFUND_ATOMIC_V2, RPC_VOID_TRANSACTION_ATOMIC,
  RPC_PROCESS_PAYOUT_ATOMIC

CRITICAL_EXTERNAL — changes affect money movement with external processors
  SVC_PAYMENT_PROVIDER

FINANCIAL_ORCHESTRATION — orchestrates financial flows but doesn't directly mutate balances
  SVC_TAX_ENGINE, SVC_WALLET_ENGINE, SVC_WEBHOOK_PROCESSOR,
  SVC_RECONCILIATION_ENGINE, SVC_TRANSFER_ROUTER, SVC_HOLDS_ROUTER,
  SVC_WALLET_ROUTER, SVC_SPLIT_MANAGER, TRG_CHECK_PERIOD_CLOSED,
  TRG_CHECK_PERIOD_LOCK, TRG_CREATE_LEDGER_ACCOUNTS, TRG_CONTRACTOR_PAYMENT_YTD

API_SURFACE — changes affect API contract / SDK compatibility
  SVC_IDENTITY_ENGINE, SVC_BILLING, SVC_BANK_ACCOUNT_MANAGER, SVC_FRAUD_ROUTER,
  SVC_SECURITY_ALERTS, SVC_RECURRING_MANAGER, TRG_TRANSACTION_USAGE,
  TRG_ENFORCE_LEDGER_LIMIT, all edge function routers, api-types.ts, OpenAPI spec

UI_ONLY — changes affect dashboard display only
  SVC_COMPLIANCE_MONITOR, all page.tsx files, navigation.ts
```

---

## Test Coverage Map

```
SDK tests (Vitest): 557 tests in sdk/typescript/src/index.test.ts
  COVERS: All SDK methods — refunds, reversals, sales, payouts, wallets,
          invoices, budgets, recurring, contractors, bank accounts,
          tax, compliance, fraud, webhooks, holds, ledgers,
          parameterized contract tests against live API

Deno tests: 447 tests across 24 test files (supabase/functions/_shared/__tests__/)
  treasury-services_test.ts (11 tests) — SVC_REFUND_ENGINE, SVC_CHECKOUT_ORCHESTRATOR, SVC_PAYOUT_ENGINE, participants, holds
  checkout-payout-holds_test.ts (19 tests) — checkout/payout/holds orchestration
  validators_test.ts (39 tests) — input validation functions
  security_test.ts (29 tests) — crypto, IP blocking, API key generation
  formatting_test.ts (13 tests) — audit sanitization, request IDs
  error-tracking_test.ts (14 tests) — PII scrubbing, stack parsing
  webhook-adapters_test.ts (14 tests) — processor event normalization
  webhook-management_test.ts (3 tests) — delivery normalization
  webhook-signing_test.ts (3 tests) — HMAC signatures
  platform-ops-services_test.ts (5 tests) — fraud, compliance, tax doc summaries
  payment-provider_test.ts (16 tests) — SVC_PAYMENT_PROVIDER unit tests
  frozen-statements_test.ts (46 tests) — frozen statement generation/retrieval
  import-transactions_test.ts (58 tests) — import engine parsing/validation
  financial-file-parsers_test.ts (27 tests) — OFX, CAMT.053, BAI2, MT940 parsers
  preflight-authorization_test.ts (31 tests) — preflight auth flows
  send-statements_test.ts (28 tests) — statement email delivery
  generate-pdf_test.ts (22 tests) — PDF generation
  wallet-service_test.ts (19 tests) — wallet operations
  fraud-service_test.ts (14 tests) — fraud evaluation
  tax-service_test.ts (13 tests) — tax engine
  reconciliations-service_test.ts (12 tests) — reconciliation matching
  compliance-service_test.ts (11 tests) — compliance monitoring
  participants-service_test.ts (11 tests) — participant management
  identity-service_test.ts (10 tests) — identity engine
  ~~bank-aggregator-provider_test.ts~~ — _removed_ (Teller dropped)

Web app tests (Vitest): 492 tests across 24 test files (apps/web/src/lib/)
  api-handler.test.ts (141 tests), rate-limit.test.ts (69 tests),
  middleware.test.ts (43 tests), fetch-with-csrf.test.ts (41 tests),
  csrf.test.ts (29 tests), entitlements.test.ts (25 tests),
  livemode-server.test.ts (20 tests), currencies.test.ts (19 tests),
  processor.test.ts (18 tests), email.test.ts (15 tests),
  sensitive-action-shared.test.ts (15 tests), navigation.test.ts (9 tests),
  public-url.test.ts (8 tests), ledger-functions-client.test.ts (8 tests),
  active-ledger.test.ts (7 tests), plans.test.ts (6 tests),
  sensitive-action-server.test.ts (4 tests), billing-policy.test.ts (3 tests),
  csrf-token.test.ts (3 tests), org-provisioning.test.ts (3 tests),
  ecosystems.test.ts (2 tests), ecosystem-server.test.ts (2 tests),
  identity.test.ts (1 test), identity-server.test.ts (1 test)

UNTESTED (integration-only):
  SVC_CHECKOUT_ORCHESTRATOR (full flow)
  All cron functions
```

---

## Maintenance Rule

**Any code change that adds, removes, or renames an edge function, shared service,
RPC, table, SDK method, dashboard page, or API route MUST update this index.**
Use `npm run validate:index` (if available) or manually verify the affected
SERVICE/RPC/ENTRYPOINT blocks remain accurate.

---

## Scripts (scripts/)

| File | Purpose |
|---|---|
| `generate-openapi.ts` | Generates `docs/openapi.yaml` (OpenAPI 3.1) from catalog.ts + SDK types |
| `validate-docs.ts` | Validates OpenAPI spec completeness, SDK README vs source, example compilation |
| `runbook-check.ts` | Validates ops-monitor checks, health-check names, runbook links, SQL refs |
| `validate-repo-index.mjs` | Validates repo-index.md against actual codebase (drift detection) |
| `graph-query.mjs` | **Agent-facing** architecture graph query — JSON output (node/deps/blast/risk/path/search/boundaries) |
| `graph-health.mjs` | Architecture health: HDR, god-service, coupling, depth, **service boundary enforcement**, **per-hub growth baseline** |
| `graph-impact.mjs` | Human-facing impact analysis — colored terminal output, blast radius, recommended workflow |
| `security-gate.sh` | Pre-deploy security gate (7 checks), used by pre-push hook and CI |
| `validate-env.sh` | Validates required environment variables are set |
| `deploy-all-functions.sh` | Deploy all Supabase Edge Functions |
| `deploy-functions.sh` | Deploy selected Edge Functions |
| `deploy-security-fixes.sh` | Deploy security hotfixes |
| `test-security-fixes.sh` | Test security hotfixes |
| `apply-migrations.mjs` | Apply Supabase migrations |
| `migrations-baseline-playbook.sh` | Migration baseline restoration playbook |
| `patch-cron-secrets.sh` | Patch cron secrets in deployed functions |
| `first-light-test.sh` | Initial smoke tests after deployment |
| `diagnose_ledger.sql` | SQL diagnostic script for ledger issues |
| `create-payout-bucket.sh` | Create S3 payout bucket |
| `run-soledgic-mcp.sh` | MCP server launcher |
| `test-ecosystem-multi-platform.mjs` | Test ecosystem multi-platform compatibility |
| `cleanup-ecosystem-multi-platform.mjs` | Clean up ecosystem test data |
| `validate-schema-hygiene.mjs` | Dead table/column detection, vendor naming lint, RPC param verification, pg_stat_statements live check |

---

## SDK Package (sdk/typescript/)

**Package:** `@soledgic/sdk` v0.2.0
**Zero runtime dependencies.** Exports: CJS (`dist/index.js`), ESM (`dist/index.mjs`), Types (`dist/index.d.ts`). Built with `tsup`.

**Soledgic class — 91 async methods:**
- **Accounting:** recordSale, recordIncome, recordExpense, recordBill, recordAdjustment, recordTransfer, recordOpeningBalance
- **Instruments:** registerInstrument, projectIntent, preflightAuthorization, getRunway, getObligations
- **Checkout/Payments:** createCheckoutSession, createPayout, createRefund, reverseTransaction
- **Creators/Participants:** createCreator, createParticipant, getCreatorEarnings, getParticipant, submitTaxInfo, setCreatorSplit
- **Ledgers/Periods:** createLedger, createPeriod, closePeriod, createReconciliationSnapshot, getFrozenStatement
- **Wallets/Transfers:** createWallet, topUpWallet, withdrawFromWallet, createTransfer, getWallet
- **Reconciliation:** importBankStatement, autoMatchBankTransaction, matchTransaction, getReconciliationSnapshot
- **Webhooks:** createWebhookEndpoint, deleteWebhookEndpoint, testWebhookEndpoint, getWebhookDeliveries, retryWebhookDelivery, rotateWebhookSecret
- **Tax/Compliance:** generateTaxSummary, generateAllTaxDocuments, generateTaxDocumentPdf, getTaxDocument, markTaxDocumentFiled, getComplianceOverview
- **Reports:** exportReport, getTrialBalance, getBalanceSheet, getProfitLoss, getCreatorStatement, getAPAging, getARAging
- **Advanced:** executePayout, executeBatchPayouts, evaluateFraud, createFraudPolicy, sendBreachAlert, getHealthStatus
- **Standalone:** verifyWebhookSignature, parseWebhookEvent (exported functions)

**Errors:** SoledgicError, ValidationError, AuthenticationError, NotFoundError, ConflictError

**Tests:** 557 test cases (vitest, mocked fetch) — constructor validation, error handling, webhook signatures, request/response, parameterized contract tests

---

## CI/CD (.github/)

### Workflows

| Workflow | Triggers | Jobs |
|---|---|---|
| `docs-validation.yml` | push (main), PRs | Checkout → Node 22 → Install deps → Generate OpenAPI → Build SDK → Compile docs example → Validate docs |
| `test.yml` | push (main), PRs | 2 jobs: **unit-tests** (npm test + coverage + SDK isolated), **validation** (validate repo index + schema hygiene + architecture enforcement) |
| `security.yml` | push (main), PRs, weekly (Sun 00:00) | 9 parallel jobs (see below) |

**security.yml jobs:**
1. **dependency-audit** — npm audit (high level) on root + apps/web
2. **secret-scan** — TruffleHog v3.88.0 (verified secrets only)
3. **codeql** — CodeQL Analysis (JavaScript + TypeScript)
4. **security-headers** — Checks CSP, HSTS, X-Content-Type-Options, X-Frame-Options, X-XSS-Protection in next.config.js
5. **hardcoded-secrets** — Regex scan for sk_live_*, sk_test_*, whsec_*, SUPABASE_SERVICE_ROLE_KEY
6. **sql-injection** — Detects string concatenation in SQL queries
7. **unit-tests** — Deno unit tests + Vitest (SDK + web) + validate repo index + `npm run graph:health -- --enforce`
8. **security-gate** — Runs `scripts/security-gate.sh --ci` (7 checks)

### Dependabot (`dependabot.yml`)

| Ecosystem | Path | Schedule | Grouping |
|---|---|---|---|
| npm | `/` (root) | Weekly Mon 09:00 EST | Minor/patch grouped |
| npm | `/apps/web` | Weekly Mon 09:00 EST | Next.js, React, other — separate groups |
| github-actions | `/` | Weekly Mon | — |

PR limit: 10 each. Labels: `dependencies`, `security`, `web` (web only).

---

## Migrations (supabase/migrations/)

Version numbers are sequential Supabase IDs, not calendar dates.

| Version | File | Purpose |
|---|---|---|
| 0 | `00000000000000_v1_baseline.sql` | Initial schema baseline |
| 341 | `20260341_concurrency_hardening.sql` | Concurrency safeguards (FOR UPDATE, deadlock retry) |
| 342 | `20260342_tax_info_submissions.sql` | Tax info submission table + RPC |
| 343 | `20260343_fix_rotate_webhook_secret.sql` | Webhook secret rotation fix |
| 344 | `20260344_include_ledger_id_in_pending_webhooks.sql` | Adds ledger_id to pending webhooks |
| 345 | `20260345_shared_identity_layer.sql` | Shared identity/auth layer |
| 346 | `20260346_ecosystem_layer.sql` | Multi-org ecosystem layer |
| 347 | `20260347_repair_audit_log_sequence.sql` | Audit log sequence repair |
| 348 | `20260348_rebind_audit_log_trigger_sequence.sql` | Rebind trigger to sequence |
| 349 | `20260349_qualify_audit_log_trigger_table.sql` | Qualify table refs in trigger |
| 350 | `20260350_fix_audit_log_trigger_search_path.sql` | Fix search_path in trigger |
| 351 | `20260351_drop_legacy_refund_rpcs.sql` | Remove old refund RPCs |
| 352 | `20260352_fix_refund_reversal_and_void_balances.sql` | Fix refund reversal balance logic |
| 353 | `20260353_tax_year_summaries_and_1099_fixes.sql` | Tax year summaries + 1099 repairs |
| 354 | `20260354_tax_summary_rpc_and_cleanup.sql` | Tax summary RPC + cleanup |
| 355 | `20260355_tighten_rpc_grants.sql` | Restrict RPC permissions |
| 356 | `20260356_drop_dead_tables_and_alias.sql` | Drop 20 dead tables (Stripe, Plaid, unused reconciliation/billing/misc) |
| 357 | `20260357_drop_dead_rpcs.sql` | Drop 88 dead RPCs (Stripe vault, Plaid, legacy recon, unused exports/health/auth/billing helpers) |
| 358 | `20260358_integrity_hardening.sql` | CHECK constraint on account_type, idempotency conflict detection, FOR SHARE→FOR UPDATE |
| 359 | `20260359_fix_ghost_table_references.sql` | Fix health check + vault RPC ghost table refs, add missing bank_connections columns |
| 360 | `20260360_create_processor_transactions.sql` | Create processor_transactions table, restore health check 6 |
| 361 | `20260361_create_missing_tables.sql` | Create missing tables |
| 362 | `20260362_rename_stripe_to_processor.sql` | Rename Stripe references to processor |
| 363 | `20260363_drop_webhook_events.sql` | Drop webhook_events table |
| 364 | `20260364_drop_stripe_remnants.sql` | Drop Stripe remnant objects |
| 365 | `20260365_drop_superseded_tables.sql` | Drop superseded tables (payment_methods, etc.) |
| 366 | `20260366_drop_dead_columns.sql` | Drop dead columns |

---

## Root Configuration

| File | Purpose |
|---|---|
| `.graph-health-baseline.json` | Architecture health snapshot with **per-hub importer counts** for drift detection |
| `.service-boundaries.json` | **Service boundary rules** — 17 protected modules with allowed-caller lists (enforced by graph:health) |
| `vitest.config.ts` | Unit tests: sdk/typescript + apps/web (30s timeout, 10s hooks) |
| `vitest.e2e.config.ts` | E2E tests: tests/e2e/ (3min timeout, sequential, global setup) |
| `vitest.stress.config.ts` | Stress tests: tests/stress/ (5min timeout, sequential, JSON output) |
| `stryker.config.mjs` | Mutation testing configuration (StrykerJS) |
| `vercel.json` | Vercel deployment config (`{ "version": 2 }`) |
| `.graph-health-baseline.json` | Architecture health snapshot (309 files, 46 edges, HDR 0.5, 0 cycles) |
| `supabase/config.toml` | Supabase local dev config |
| `.husky/pre-commit` | Secrets check hook |
| `.husky/pre-push` | Security gate (7 checks) |
| `tests/test-client.ts` | Integration test client |
| `test-data/api-keys.env.example` | Test API key template |
