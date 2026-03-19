-- Fix 1: Sale should DR buyer_wallet (internal redistribution), not DR cash (new money).
-- Fix 2: Funding processing fee should be DR (expense), not CR (liability).
--
-- Correct flows:
--   FUNDING: DR stripe_clearing (gross) + DR processing_fee_expense → CR buyer_wallet (gross)
--   SALE:    DR buyer_wallet → CR creator + CR platform + CR soledgic_fee

-- We need a processing_fee_expense account type (distinct from processing_fees reserve)
-- Actually, we'll keep using 'processing_fees' but debit it (expense behavior).
-- The account already exists. The fix is the entry direction.

-- Nothing to alter in schema — just rewrite the RPCs.
-- Sale RPC and Funding RPC are in separate migrations below.
SELECT 1;
