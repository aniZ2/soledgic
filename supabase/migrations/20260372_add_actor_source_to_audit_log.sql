-- Add actor_source column to audit_log for tracking which platform/system triggered an action
-- Examples: 'booklyverse', 'soledgic-dashboard', 'cron.reconciliation', 'claude'

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_source text;

CREATE INDEX IF NOT EXISTS idx_audit_log_actor_source ON audit_log (actor_source) WHERE actor_source IS NOT NULL;

COMMENT ON COLUMN audit_log.actor_source IS 'Platform or system that triggered the action (e.g. booklyverse, claude, cron.reconciliation)';
