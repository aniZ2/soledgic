-- Separate funding (Stripe → wallet) from sales (wallet redistribution).
-- Part 1: constraints, bootstrapping, backfill.
-- Part 2 (20260404): record_funding_atomic RPC.

-- 1. Add new account types to constraint
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS chk_valid_account_type;
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_account_type_check;
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_entity_type_check;
ALTER TABLE public.accounts
  ADD CONSTRAINT chk_valid_account_type CHECK (account_type IN (
    'cash', 'bank', 'bank_account', 'petty_cash', 'undeposited_funds',
    'accounts_receivable', 'inventory', 'prepaid_expense',
    'fixed_asset', 'property', 'equipment', 'asset', 'other_asset',
    'expense', 'processing_fees', 'cost_of_goods_sold', 'cogs',
    'payroll', 'rent', 'utilities', 'insurance', 'depreciation',
    'taxes', 'interest_expense', 'other_expense', 'loss',
    'owner_draw',
    'refund_reserve', 'tax_reserve', 'reserve',
    'accounts_payable', 'creator_balance', 'creator_pool',
    'sales_tax_payable', 'tax_payable', 'unearned_revenue', 'credit_card',
    'owner_equity',
    'revenue', 'platform_revenue', 'soledgic_fee', 'income', 'other_income',
    'user_wallet',
    'stripe_clearing', 'buyer_wallet'
  ));

-- 2. Update marketplace bootstrapping with stripe_clearing
CREATE OR REPLACE FUNCTION public.initialize_ledger_accounts(p_ledger_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mode TEXT;
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.ledgers l ON l.organization_id = om.organization_id
      WHERE l.id = p_ledger_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  SELECT ledger_mode INTO v_mode FROM ledgers WHERE id = p_ledger_id;

  IF v_mode = 'marketplace' THEN
    INSERT INTO accounts (ledger_id, account_type, entity_type, name, entity_id)
    VALUES
      (p_ledger_id, 'platform_revenue', 'platform', 'Platform Revenue', NULL),
      (p_ledger_id, 'creator_pool', 'reserve', 'Creator Pool', NULL),
      (p_ledger_id, 'processing_fees', 'reserve', 'Processing Fees', NULL),
      (p_ledger_id, 'soledgic_fee', 'platform', 'Soledgic Platform Fee', NULL),
      (p_ledger_id, 'stripe_clearing', 'clearing', 'Stripe Clearing', NULL),
      (p_ledger_id, 'tax_reserve', 'reserve', 'Tax Reserve', NULL),
      (p_ledger_id, 'refund_reserve', 'reserve', 'Refund Reserve', NULL),
      (p_ledger_id, 'cash', 'business', 'Operating Cash', NULL)
    ON CONFLICT (ledger_id, account_type) WHERE entity_id IS NULL DO NOTHING;
  ELSE
    INSERT INTO accounts (ledger_id, account_type, entity_type, name, entity_id)
    VALUES
      (p_ledger_id, 'revenue', 'business', 'Revenue', NULL),
      (p_ledger_id, 'expense', 'business', 'Expenses', NULL),
      (p_ledger_id, 'cash', 'business', 'Cash', NULL),
      (p_ledger_id, 'accounts_receivable', 'business', 'Accounts Receivable', NULL),
      (p_ledger_id, 'accounts_payable', 'business', 'Accounts Payable', NULL),
      (p_ledger_id, 'owner_equity', 'business', 'Owner Equity', NULL),
      (p_ledger_id, 'tax_reserve', 'reserve', 'Tax Reserve', NULL)
    ON CONFLICT (ledger_id, account_type) WHERE entity_id IS NULL DO NOTHING;
  END IF;
END;
$function$;
