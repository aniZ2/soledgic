-- Harden cross-ledger security: enable RLS on financial graph tables,
-- add ledger ownership check to linkParticipantToUser.

-- ============================================================
-- 1. Enable RLS on transaction graph tables (defense in depth)
-- ============================================================
ALTER TABLE public.transaction_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_batch_items ENABLE ROW LEVEL SECURITY;

-- Service role only — these tables are accessed exclusively via edge functions
CREATE POLICY transaction_links_service_all ON public.transaction_links
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY payout_batches_service_all ON public.payout_batches
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY payout_batch_items_service_all ON public.payout_batch_items
  FOR ALL USING (auth.role() = 'service_role');
