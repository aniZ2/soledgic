-- Add test/live mode support to ledgers
-- Each logical ledger becomes a pair: one test (livemode=false) + one live (livemode=true)
-- linked by a shared ledger_group_id UUID.

-- Pair identifier: same UUID for the test+live siblings of a logical ledger
ALTER TABLE ledgers ADD COLUMN ledger_group_id UUID;
ALTER TABLE ledgers ADD COLUMN livemode BOOLEAN NOT NULL DEFAULT false;

-- Backfill: give every existing ledger its own group (no sibling yet)
UPDATE ledgers SET ledger_group_id = gen_random_uuid() WHERE ledger_group_id IS NULL;
ALTER TABLE ledgers ALTER COLUMN ledger_group_id SET NOT NULL;

-- Enforce: one test + one live per group
ALTER TABLE ledgers ADD CONSTRAINT uq_ledger_group_mode UNIQUE (ledger_group_id, livemode);

-- Query performance for dashboard filtering
CREATE INDEX idx_ledgers_org_livemode ON ledgers(organization_id, livemode, status);
