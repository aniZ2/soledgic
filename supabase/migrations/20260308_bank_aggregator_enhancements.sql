-- Bank aggregator enhancements for Plaid integration
-- Adds index on item_id for webhook lookups

CREATE INDEX IF NOT EXISTS idx_bank_aggregator_connections_item_id
  ON bank_aggregator_connections(item_id);
