-- =============================================================================
-- 20260354: Tax summary RPC (replaces N+1), withholding population, dead col cleanup
-- =============================================================================

-- 1. compute_tax_year_summaries — single-query replacement for the N+1
--    getTaxSummaryResponse pattern
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.compute_tax_year_summaries(
  p_ledger_id uuid,
  p_tax_year integer
)
 RETURNS TABLE(
   entity_id        text,
   gross_earnings   numeric,
   refunds_issued   numeric,
   net_earnings     numeric,
   total_paid_out   numeric,
   requires_1099    boolean,
   linked_user_id   uuid,
   has_tax_profile  boolean
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Upsert summaries from a single aggregating CTE, then return them
  -- enriched with identity-link and tax-profile info.
  WITH creator_totals AS (
    SELECT
      a.entity_id,
      COALESCE(SUM(e.amount) FILTER (
        WHERE t.transaction_type = 'sale' AND e.entry_type = 'credit'
      ), 0)::numeric(14,2)  AS gross_earnings,
      COALESCE(SUM(e.amount) FILTER (
        WHERE t.transaction_type = 'refund' AND e.entry_type = 'debit'
      ), 0)::numeric(14,2)  AS refunds_issued,
      COALESCE(SUM(e.amount) FILTER (
        WHERE t.transaction_type = 'payout' AND e.entry_type = 'debit'
      ), 0)::numeric(14,2)  AS total_paid_out
    FROM public.accounts    a
    JOIN public.entries      e ON e.account_id = a.id
    JOIN public.transactions t ON t.id = e.transaction_id
    WHERE a.ledger_id    = p_ledger_id
      AND a.account_type = 'creator_balance'
      AND a.entity_id    IS NOT NULL
      AND t.status       = 'completed'
      AND EXTRACT(YEAR FROM t.created_at)::integer = p_tax_year
    GROUP BY a.entity_id
  ),
  computed AS (
    SELECT
      ct.entity_id,
      ct.gross_earnings,
      ct.refunds_issued,
      (ct.gross_earnings - ct.refunds_issued)::numeric(14,2) AS net_earnings,
      ct.total_paid_out,
      ((ct.gross_earnings - ct.refunds_issued) >= 600)       AS requires_1099
    FROM creator_totals ct
  ),
  upserted AS (
    INSERT INTO public.tax_year_summaries (
      ledger_id, entity_id, tax_year,
      gross_earnings, refunds_issued, net_earnings, total_paid_out,
      requires_1099, is_corrected, updated_at
    )
    SELECT
      p_ledger_id,
      c.entity_id,
      p_tax_year,
      c.gross_earnings,
      c.refunds_issued,
      c.net_earnings,
      c.total_paid_out,
      c.requires_1099,
      false,
      now()
    FROM computed c
    ON CONFLICT (ledger_id, entity_id, tax_year, is_corrected)
    DO UPDATE SET
      gross_earnings = EXCLUDED.gross_earnings,
      refunds_issued = EXCLUDED.refunds_issued,
      net_earnings   = EXCLUDED.net_earnings,
      total_paid_out = EXCLUDED.total_paid_out,
      requires_1099  = EXCLUDED.requires_1099,
      updated_at     = now()
    RETURNING
      public.tax_year_summaries.entity_id,
      public.tax_year_summaries.gross_earnings,
      public.tax_year_summaries.refunds_issued,
      public.tax_year_summaries.net_earnings,
      public.tax_year_summaries.total_paid_out,
      public.tax_year_summaries.requires_1099
  )
  SELECT
    u.entity_id,
    u.gross_earnings,
    u.refunds_issued,
    u.net_earnings,
    u.total_paid_out,
    u.requires_1099,
    pil.user_id            AS linked_user_id,
    (stp.user_id IS NOT NULL) AS has_tax_profile
  FROM upserted u
  LEFT JOIN public.participant_identity_links pil
    ON  pil.ledger_id      = p_ledger_id
    AND pil.participant_id = u.entity_id
    AND pil.status         = 'active'
  LEFT JOIN public.shared_tax_profiles stp
    ON  stp.user_id = pil.user_id
    AND stp.status  = 'active'
    AND stp.tax_id_last4 IS NOT NULL;

  RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.compute_tax_year_summaries(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_tax_year_summaries(uuid, integer) TO service_role;


-- 2. populate_tax_document_withholding — backfill federal & state withholding
--    from held_funds linked to withholding_rules
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.populate_tax_document_withholding(
  p_ledger_id uuid,
  p_tax_year integer
)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_updated integer := 0;
BEGIN
  WITH doc_withholding AS (
    SELECT
      td.id AS tax_document_id,
      COALESCE(SUM(hf.held_amount) FILTER (
        WHERE wr.rule_type IN ('federal', 'backup_withholding')
      ), 0)::numeric(15,2) AS federal_total,
      COALESCE(SUM(hf.held_amount) FILTER (
        WHERE wr.rule_type LIKE '%state%'
      ), 0)::numeric(15,2) AS state_total
    FROM public.tax_documents td
    JOIN public.held_funds hf
      ON  hf.ledger_id  = td.ledger_id
      AND hf.creator_id = td.recipient_id
    JOIN public.withholding_rules wr
      ON  wr.id = hf.withholding_rule_id
    JOIN public.transactions t
      ON  t.id = hf.transaction_id
      AND t.status = 'completed'
      AND EXTRACT(YEAR FROM t.created_at)::integer = p_tax_year
    WHERE td.ledger_id = p_ledger_id
      AND td.tax_year  = p_tax_year
    GROUP BY td.id
  )
  UPDATE public.tax_documents td
     SET federal_withholding = dw.federal_total,
         state_withholding   = dw.state_total,
         updated_at          = now()
    FROM doc_withholding dw
   WHERE td.id = dw.tax_document_id
     AND (td.federal_withholding IS DISTINCT FROM dw.federal_total
       OR td.state_withholding   IS DISTINCT FROM dw.state_total);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$function$;

REVOKE ALL ON FUNCTION public.populate_tax_document_withholding(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.populate_tax_document_withholding(uuid, integer) TO service_role;


-- 3. Drop dead Stripe column from contractors
-- ---------------------------------------------------------------------------

ALTER TABLE public.contractors
  DROP COLUMN IF EXISTS stripe_account_id;
