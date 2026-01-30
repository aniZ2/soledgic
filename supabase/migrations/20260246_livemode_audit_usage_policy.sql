-- Enforce mode-awareness policies for audit_log and usage_metrics.
--
-- ═══ audit_log policy ═══
--
--   ledger_id is nullable (org-wide entries like member invites have no ledger).
--   The table is NOT mode-split at the schema level. Filtering is query-time.
--
--   Page type                 Filter rule
--   ────────────────────────  ──────────────────────────────────────────────
--   Mode-aware dashboard      WHERE ledger_id IN (SELECT id FROM ledgers
--   (transactions, creators,        WHERE organization_id = :org
--    payouts, reports)              AND livemode = :current_mode)
--
--   Org-wide admin pages      WHERE organization_id = :org
--   (settings, team, billing) (show ALL entries regardless of mode)
--
--   Security / audit log UI   WHERE organization_id = :org
--                              Show all. Tag rows with livemode badge:
--                                JOIN ledgers ON audit_log.ledger_id = ledgers.id
--                                → if ledger.livemode IS false → show "(Test)" label
--                                → if ledger_id IS NULL → show "(Org)" label
--
--   This prevents "ghost actions" where test events appear in live audit views.
--
-- ═══ usage_metrics policy ═══
--
--   ledger_id MUST always be set so that billing can distinguish test vs live.
--   Enforce with NOT NULL constraint.

-- Make ledger_id required on usage_metrics so every metric row is mode-attributable.
-- Existing rows with NULL ledger_id are unlikely (the increment_usage function always
-- passes a ledger_id), but clean up any that exist:
DELETE FROM usage_metrics WHERE ledger_id IS NULL;
ALTER TABLE usage_metrics ALTER COLUMN ledger_id SET NOT NULL;

-- Add an index to support mode-filtered billing queries on usage_metrics:
-- "sum transactions for live ledgers in this org this month"
CREATE INDEX IF NOT EXISTS idx_usage_metrics_org_ledger
  ON usage_metrics(organization_id, ledger_id, metric_date);
