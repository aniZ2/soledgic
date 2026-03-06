-- Soledgic: Wallet Negative Balance Guard
-- ============================================================================
-- BEFORE INSERT OR UPDATE trigger on accounts that rejects negative balances
-- for user_wallet accounts. Uses BEFORE so the row is rejected before it lands.
-- Covers:
--   1. UPDATE OF balance — normal RPC path (balance trigger fires)
--   2. INSERT — manual SQL inserting a wallet with negative balance
--   3. UPDATE OF account_type — flipping an existing negative-balance row to
--      user_wallet
-- The WHEN clause limits firing to user_wallet rows only (zero overhead on
-- other account types like creator_balance which can legitimately go negative
-- after chargebacks).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_wallet_nonnegative_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.balance < 0 THEN
    RAISE EXCEPTION 'Wallet balance cannot be negative: account % balance %',
      NEW.id, NEW.balance;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_wallet_nonneg_balance ON public.accounts;

CREATE TRIGGER trigger_wallet_nonneg_balance
  BEFORE INSERT OR UPDATE OF balance, account_type ON public.accounts
  FOR EACH ROW
  WHEN (NEW.account_type = 'user_wallet')
  EXECUTE FUNCTION public.enforce_wallet_nonnegative_balance();
