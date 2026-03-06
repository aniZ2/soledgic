-- Bank aggregator enhancements for Plaid integration
-- Adds index on item_id for webhook lookups
-- Guarded: only runs if the table exists (may not be present on all environments)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'bank_aggregator_connections'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_bank_aggregator_connections_item_id
      ON public.bank_aggregator_connections(item_id);
  END IF;
END;
$$;
