-- =============================================================================
-- 20260353: Create tax_year_summaries table, fix 1099 form type, add backup
-- withholding rule
-- =============================================================================

-- 1. Create the missing tax_year_summaries table
-- -----------------------------------------------
-- Referenced by tax-service.ts, generate-tax-summary, and participants-service
-- but was never created in a prior migration file.

CREATE TABLE IF NOT EXISTS public.tax_year_summaries (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ledger_id        uuid NOT NULL REFERENCES public.ledgers(id),
  entity_id        text NOT NULL,
  tax_year         integer NOT NULL,
  gross_earnings   numeric(14,2) NOT NULL DEFAULT 0,
  refunds_issued   numeric(14,2) NOT NULL DEFAULT 0,
  net_earnings     numeric(14,2) NOT NULL DEFAULT 0,
  total_paid_out   numeric(14,2) NOT NULL DEFAULT 0,
  requires_1099    boolean NOT NULL DEFAULT false,
  is_corrected     boolean NOT NULL DEFAULT false, -- @planned corrected 1099 tracking
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_year_summaries_unique
  ON public.tax_year_summaries (ledger_id, entity_id, tax_year, is_corrected);

CREATE INDEX IF NOT EXISTS idx_tax_year_summaries_ledger_year
  ON public.tax_year_summaries (ledger_id, tax_year);

ALTER TABLE public.tax_year_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tax year summaries via service role"
  ON public.tax_year_summaries
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. Fix 1099 document type: 1099-K → 1099-NEC
-- -----------------------------------------------
-- The generate_1099_documents RPC hard-codes '1099-K', but Soledgic tracks
-- nonemployee compensation (creator payouts), which is 1099-NEC territory.
-- 1099-K is for payment settlement entities (PSEs) reporting gross payment
-- card/third-party network transactions — a different form with different
-- thresholds and box structures.
--
-- Fix: update existing rows and the RPC.

UPDATE public.tax_documents
   SET document_type = '1099-NEC'
 WHERE document_type = '1099-K';

-- Recreate generate_1099_documents with corrected document_type
CREATE OR REPLACE FUNCTION public.generate_1099_documents(p_ledger_id uuid, p_tax_year integer)
 RETURNS TABLE(documents_created integer, documents_skipped integer, total_amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_creator RECORD;
  v_totals RECORD;
  v_created INTEGER := 0;
  v_skipped INTEGER := 0;
  v_total NUMERIC(14,2) := 0;
BEGIN
  FOR v_creator IN
    SELECT a.entity_id
      FROM public.accounts a
     WHERE a.ledger_id = p_ledger_id
       AND a.account_type = 'creator_balance'
       AND a.entity_id IS NOT NULL
  LOOP
    SELECT * INTO v_totals
    FROM public.calculate_1099_totals(p_ledger_id, v_creator.entity_id, p_tax_year);

    IF NOT v_totals.requires_1099 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.tax_documents (
      ledger_id, document_type, tax_year, recipient_type, recipient_id,
      gross_amount, transaction_count, monthly_amounts, status
    ) VALUES (
      p_ledger_id, '1099-NEC', p_tax_year, 'creator', v_creator.entity_id,
      v_totals.gross_payments, v_totals.transaction_count, v_totals.monthly_totals, 'calculated'
    )
    ON CONFLICT (ledger_id, document_type, tax_year, recipient_id)
    DO UPDATE SET
      gross_amount = EXCLUDED.gross_amount,
      transaction_count = EXCLUDED.transaction_count,
      monthly_amounts = EXCLUDED.monthly_amounts,
      updated_at = NOW();

    v_created := v_created + 1;
    v_total := v_total + v_totals.gross_payments;
  END LOOP;

  RETURN QUERY SELECT v_created, v_skipped, v_total;
END;
$function$
;

-- 3. Add backup withholding support
-- -----------------------------------------------
-- US tax law requires 24% backup withholding when a payee has not provided
-- a valid TIN (no W-9 on file). This adds:
-- a) A function to check whether a creator has tax info on file
-- b) A function to auto-create a backup withholding rule for a ledger
-- c) An enhancement to apply_withholding_to_sale to apply 24% when
--    the creator has no tax_info_submission and no shared_tax_profile

CREATE OR REPLACE FUNCTION public.creator_has_tax_info(
  p_ledger_id uuid,
  p_creator_id text
)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    -- Check ledger-scoped tax info submissions
    SELECT 1
      FROM public.tax_info_submissions tis
     WHERE tis.ledger_id = p_ledger_id
       AND tis.entity_id = p_creator_id
       AND tis.status = 'active'
  ) OR EXISTS (
    -- Check shared tax profiles via identity link
    SELECT 1
      FROM public.participant_identity_links pil
      JOIN public.shared_tax_profiles stp ON stp.user_id = pil.user_id
       AND stp.status = 'active'
       AND stp.tax_id_last4 IS NOT NULL
     WHERE pil.ledger_id = p_ledger_id
       AND pil.participant_id = p_creator_id
       AND pil.status = 'active'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_backup_withholding_rule(p_ledger_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_rule_id uuid;
BEGIN
  SELECT id INTO v_rule_id
    FROM public.withholding_rules
   WHERE ledger_id = p_ledger_id
     AND rule_type = 'backup_withholding'
   LIMIT 1;

  IF v_rule_id IS NOT NULL THEN
    RETURN v_rule_id;
  END IF;

  INSERT INTO public.withholding_rules (
    ledger_id, name, rule_type, applies_to, percent,
    min_amount, hold_days, release_trigger, is_active, priority
  ) VALUES (
    p_ledger_id,
    'IRS Backup Withholding (24%)',
    'backup_withholding',
    'all',
    24.00,
    0,
    0,
    'manual',
    true,
    1  -- highest priority
  )
  RETURNING id INTO v_rule_id;

  RETURN v_rule_id;
END;
$function$
;

-- Recreate apply_withholding_to_sale with backup withholding logic
CREATE OR REPLACE FUNCTION public.apply_withholding_to_sale(
  p_transaction_id uuid,
  p_ledger_id uuid,
  p_creator_id text,
  p_creator_amount numeric,
  p_product_id text DEFAULT NULL::text
)
 RETURNS TABLE(rule_id uuid, rule_type text, withheld_amount numeric, remaining_creator_amount numeric)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rule RECORD;
  v_withheld NUMERIC(14,2);
  v_remaining NUMERIC(14,2) := p_creator_amount;
  v_reserve_account_id UUID;
  v_creator_account_id UUID;
  v_has_tax_info BOOLEAN;
  v_backup_rule_id UUID;
BEGIN
  -- Get creator account
  SELECT id INTO v_creator_account_id
  FROM accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'creator_balance'
    AND entity_id = p_creator_id;

  -- Check if creator has tax info on file
  v_has_tax_info := public.creator_has_tax_info(p_ledger_id, p_creator_id);

  -- Apply backup withholding (24%) if no tax info
  IF NOT v_has_tax_info AND v_remaining > 0 THEN
    v_backup_rule_id := public.ensure_backup_withholding_rule(p_ledger_id);

    v_withheld := ROUND(v_remaining * 0.24, 2);

    IF v_withheld > 0 THEN
      v_reserve_account_id := get_or_create_reserve_account(p_ledger_id, 'backup_withholding');

      INSERT INTO held_funds (
        ledger_id, transaction_id, withholding_rule_id, creator_id,
        held_amount, release_eligible_at, hold_reason
      ) VALUES (
        p_ledger_id, p_transaction_id, v_backup_rule_id, p_creator_id,
        v_withheld, NOW(), 'IRS backup withholding — no TIN on file'
      );

      INSERT INTO entries (transaction_id, account_id, entry_type, amount)
      VALUES (p_transaction_id, v_creator_account_id, 'debit', v_withheld);

      INSERT INTO entries (transaction_id, account_id, entry_type, amount)
      VALUES (p_transaction_id, v_reserve_account_id, 'credit', v_withheld);

      v_remaining := v_remaining - v_withheld;

      RETURN QUERY SELECT v_backup_rule_id, 'backup_withholding'::text, v_withheld, v_remaining;
    END IF;
  END IF;

  -- Process each active rule in priority order (existing logic)
  FOR v_rule IN
    SELECT * FROM withholding_rules
    WHERE ledger_id = p_ledger_id
      AND is_active = true
      AND rule_type <> 'backup_withholding'  -- already handled above
      AND (
        applies_to = 'all'
        OR (applies_to = 'creators' AND p_creator_id = ANY(creator_ids))
        OR (applies_to = 'specific' AND p_creator_id = ANY(creator_ids))
      )
      AND (product_ids IS NULL OR p_product_id = ANY(product_ids))
      AND (min_amount IS NULL OR p_creator_amount >= min_amount)
    ORDER BY priority ASC
  LOOP
    v_withheld := ROUND(v_remaining * (v_rule.percent / 100), 2);

    IF v_rule.max_amount IS NOT NULL AND v_withheld > v_rule.max_amount THEN
      v_withheld := v_rule.max_amount;
    END IF;

    IF v_withheld <= 0 THEN
      CONTINUE;
    END IF;

    v_reserve_account_id := get_or_create_reserve_account(p_ledger_id, v_rule.rule_type);

    INSERT INTO held_funds (
      ledger_id, transaction_id, withholding_rule_id, creator_id,
      held_amount, release_eligible_at, hold_reason
    ) VALUES (
      p_ledger_id, p_transaction_id, v_rule.id, p_creator_id,
      v_withheld,
      CASE
        WHEN v_rule.hold_days > 0 THEN NOW() + (v_rule.hold_days || ' days')::interval
        ELSE NOW()
      END,
      v_rule.name
    );

    INSERT INTO entries (transaction_id, account_id, entry_type, amount)
    VALUES (p_transaction_id, v_creator_account_id, 'debit', v_withheld);

    INSERT INTO entries (transaction_id, account_id, entry_type, amount)
    VALUES (p_transaction_id, v_reserve_account_id, 'credit', v_withheld);

    v_remaining := v_remaining - v_withheld;

    RETURN QUERY SELECT v_rule.id, v_rule.rule_type, v_withheld, v_remaining;
  END LOOP;
END;
$function$
;

-- Grants
REVOKE ALL ON FUNCTION public.creator_has_tax_info(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.creator_has_tax_info(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.ensure_backup_withholding_rule(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_backup_withholding_rule(uuid) TO service_role;
