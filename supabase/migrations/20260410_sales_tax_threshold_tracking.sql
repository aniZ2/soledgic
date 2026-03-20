-- Sales tax tracking + Maryland digital goods collection support.
-- Scope:
-- 1. Store subtotal/tax on checkout sessions so total charge can exceed revenue.
-- 2. Track state-by-state digital goods threshold progress without pretending
--    the repo has a fully reviewed 50-state tax engine.
-- 3. Extend record_sale_atomic so collected sales tax credits sales_tax_payable
--    instead of creator/platform revenue.

ALTER TABLE public.checkout_sessions
  ADD COLUMN IF NOT EXISTS subtotal_amount integer,
  ADD COLUMN IF NOT EXISTS sales_tax_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sales_tax_rate_bps integer,
  ADD COLUMN IF NOT EXISTS sales_tax_state text,
  ADD COLUMN IF NOT EXISTS customer_tax_country text,
  ADD COLUMN IF NOT EXISTS customer_tax_state text,
  ADD COLUMN IF NOT EXISTS customer_tax_postal_code text;

UPDATE public.checkout_sessions
SET
  subtotal_amount = COALESCE(subtotal_amount, amount - COALESCE(sales_tax_amount, 0)),
  sales_tax_amount = COALESCE(sales_tax_amount, 0),
  customer_tax_country = COALESCE(customer_tax_country, 'US'),
  customer_tax_state = COALESCE(customer_tax_state, sales_tax_state)
WHERE subtotal_amount IS NULL
   OR customer_tax_country IS NULL
   OR (customer_tax_state IS NULL AND sales_tax_state IS NOT NULL);

ALTER TABLE public.checkout_sessions
  ALTER COLUMN subtotal_amount SET NOT NULL;

ALTER TABLE public.checkout_sessions
  DROP CONSTRAINT IF EXISTS checkout_sessions_tax_amounts_check;

ALTER TABLE public.checkout_sessions
  ADD CONSTRAINT checkout_sessions_tax_amounts_check
  CHECK (
    subtotal_amount >= 0
    AND sales_tax_amount >= 0
    AND amount = subtotal_amount + sales_tax_amount
  );

ALTER TABLE public.checkout_sessions
  DROP CONSTRAINT IF EXISTS checkout_sessions_sales_tax_state_check;

ALTER TABLE public.checkout_sessions
  ADD CONSTRAINT checkout_sessions_sales_tax_state_check
  CHECK (
    sales_tax_state IS NULL
    OR sales_tax_state ~ '^[A-Z]{2}$'
  );

ALTER TABLE public.checkout_sessions
  DROP CONSTRAINT IF EXISTS checkout_sessions_customer_tax_state_check;

ALTER TABLE public.checkout_sessions
  ADD CONSTRAINT checkout_sessions_customer_tax_state_check
  CHECK (
    customer_tax_state IS NULL
    OR customer_tax_state ~ '^[A-Z]{2}$'
  );

CREATE INDEX IF NOT EXISTS idx_checkout_sessions_customer_tax_state
  ON public.checkout_sessions (ledger_id, customer_tax_state, created_at DESC);

CREATE TABLE IF NOT EXISTS public.sales_tax_state_rules (
  state_code text PRIMARY KEY,
  state_name text NOT NULL,
  digital_goods_taxable boolean,
  default_tax_rate_bps integer,
  economic_nexus_sales_threshold_cents bigint,
  economic_nexus_transaction_threshold integer,
  marketplace_facilitator_collection boolean,
  local_rate_model text NOT NULL DEFAULT 'unknown',
  review_status text NOT NULL DEFAULT 'pending_review',
  taxability_source_url text,
  threshold_source_url text,
  notes text,
  last_reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT sales_tax_state_rules_state_code_check CHECK (state_code ~ '^[A-Z]{2}$'),
  CONSTRAINT sales_tax_state_rules_review_status_check CHECK (review_status IN ('pending_review', 'reviewed', 'not_applicable')),
  CONSTRAINT sales_tax_state_rules_local_rate_model_check CHECK (local_rate_model IN ('unknown', 'statewide_flat', 'local_variation', 'no_statewide_tax'))
);

INSERT INTO public.sales_tax_state_rules (state_code, state_name)
VALUES
  ('AL', 'Alabama'),
  ('AK', 'Alaska'),
  ('AZ', 'Arizona'),
  ('AR', 'Arkansas'),
  ('CA', 'California'),
  ('CO', 'Colorado'),
  ('CT', 'Connecticut'),
  ('DE', 'Delaware'),
  ('DC', 'District of Columbia'),
  ('FL', 'Florida'),
  ('GA', 'Georgia'),
  ('HI', 'Hawaii'),
  ('ID', 'Idaho'),
  ('IL', 'Illinois'),
  ('IN', 'Indiana'),
  ('IA', 'Iowa'),
  ('KS', 'Kansas'),
  ('KY', 'Kentucky'),
  ('LA', 'Louisiana'),
  ('ME', 'Maine'),
  ('MD', 'Maryland'),
  ('MA', 'Massachusetts'),
  ('MI', 'Michigan'),
  ('MN', 'Minnesota'),
  ('MS', 'Mississippi'),
  ('MO', 'Missouri'),
  ('MT', 'Montana'),
  ('NE', 'Nebraska'),
  ('NV', 'Nevada'),
  ('NH', 'New Hampshire'),
  ('NJ', 'New Jersey'),
  ('NM', 'New Mexico'),
  ('NY', 'New York'),
  ('NC', 'North Carolina'),
  ('ND', 'North Dakota'),
  ('OH', 'Ohio'),
  ('OK', 'Oklahoma'),
  ('OR', 'Oregon'),
  ('PA', 'Pennsylvania'),
  ('RI', 'Rhode Island'),
  ('SC', 'South Carolina'),
  ('SD', 'South Dakota'),
  ('TN', 'Tennessee'),
  ('TX', 'Texas'),
  ('UT', 'Utah'),
  ('VT', 'Vermont'),
  ('VA', 'Virginia'),
  ('WA', 'Washington'),
  ('WV', 'West Virginia'),
  ('WI', 'Wisconsin'),
  ('WY', 'Wyoming')
ON CONFLICT (state_code) DO UPDATE
SET
  state_name = EXCLUDED.state_name,
  updated_at = now();

UPDATE public.sales_tax_state_rules
SET
  digital_goods_taxable = true,
  default_tax_rate_bps = 600,
  economic_nexus_sales_threshold_cents = 10000000,
  economic_nexus_transaction_threshold = 200,
  marketplace_facilitator_collection = true,
  local_rate_model = 'statewide_flat',
  review_status = 'reviewed',
  taxability_source_url = 'https://marylandtaxes.gov/forms/Business_Tax_Tips/bustip29.pdf',
  threshold_source_url = 'https://interactive.marylandtaxes.gov/Business/bFile/Help/SalesAndUse_Help_202.aspx',
  notes = 'Reviewed only for Maryland digital products at 6%. Other states remain pending review.',
  last_reviewed_at = now(),
  updated_at = now()
WHERE state_code = 'MD';

CREATE TABLE IF NOT EXISTS public.ledger_sales_tax_threshold_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id uuid NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  state_code text NOT NULL REFERENCES public.sales_tax_state_rules(state_code) ON DELETE RESTRICT,
  calendar_year integer NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  taxable_sales_cents bigint NOT NULL DEFAULT 0,
  tax_amount_cents bigint NOT NULL DEFAULT 0,
  transaction_count integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ledger_sales_tax_threshold_events_source_unique UNIQUE (ledger_id, source_type, source_id),
  CONSTRAINT ledger_sales_tax_threshold_events_state_code_check CHECK (state_code ~ '^[A-Z]{2}$'),
  CONSTRAINT ledger_sales_tax_threshold_events_amounts_check CHECK (
    taxable_sales_cents >= 0
    AND tax_amount_cents >= 0
    AND transaction_count >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_ledger_sales_tax_threshold_events_lookup
  ON public.ledger_sales_tax_threshold_events (ledger_id, state_code, calendar_year);

CREATE TABLE IF NOT EXISTS public.ledger_sales_tax_state_status (
  ledger_id uuid NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  state_code text NOT NULL REFERENCES public.sales_tax_state_rules(state_code) ON DELETE RESTRICT,
  calendar_year integer NOT NULL,
  taxable_sales_cents bigint NOT NULL DEFAULT 0,
  tax_amount_cents bigint NOT NULL DEFAULT 0,
  transaction_count integer NOT NULL DEFAULT 0,
  threshold_sales_cents bigint,
  threshold_transactions integer,
  threshold_reached_at timestamp with time zone,
  registration_status text NOT NULL DEFAULT 'pending_review',
  auto_collect_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (ledger_id, state_code, calendar_year),
  CONSTRAINT ledger_sales_tax_state_status_state_code_check CHECK (state_code ~ '^[A-Z]{2}$'),
  CONSTRAINT ledger_sales_tax_state_status_amounts_check CHECK (
    taxable_sales_cents >= 0
    AND tax_amount_cents >= 0
    AND transaction_count >= 0
  ),
  CONSTRAINT ledger_sales_tax_state_status_registration_status_check CHECK (
    registration_status IN ('pending_review', 'monitoring', 'threshold_reached', 'registered', 'collecting', 'not_applicable')
  )
);

CREATE INDEX IF NOT EXISTS idx_ledger_sales_tax_state_status_lookup
  ON public.ledger_sales_tax_state_status (ledger_id, calendar_year, state_code);

ALTER TABLE public.sales_tax_state_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_sales_tax_threshold_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_sales_tax_state_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_tax_state_rules_read_authenticated ON public.sales_tax_state_rules;
CREATE POLICY sales_tax_state_rules_read_authenticated
  ON public.sales_tax_state_rules
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS ledger_sales_tax_state_status_read_org_members ON public.ledger_sales_tax_state_status;
CREATE POLICY ledger_sales_tax_state_status_read_org_members
  ON public.ledger_sales_tax_state_status
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.ledgers l
      JOIN public.organization_members om
        ON om.organization_id = l.organization_id
      WHERE l.id = ledger_sales_tax_state_status.ledger_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE OR REPLACE FUNCTION public.record_sales_tax_threshold_event(
  p_ledger_id uuid,
  p_state_code text,
  p_source_type text,
  p_source_id text,
  p_taxable_sales_cents bigint,
  p_tax_amount_cents bigint DEFAULT 0,
  p_calendar_year integer DEFAULT EXTRACT(YEAR FROM now())::integer,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(
  out_applied boolean,
  out_threshold_reached boolean,
  out_taxable_sales_cents bigint,
  out_transaction_count integer
)
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_state_code text;
  v_rule public.sales_tax_state_rules%ROWTYPE;
  v_inserted_id uuid;
  v_status public.ledger_sales_tax_state_status%ROWTYPE;
BEGIN
  IF p_ledger_id IS NULL THEN
    RAISE EXCEPTION 'ledger_id is required';
  END IF;

  v_state_code := UPPER(TRIM(COALESCE(p_state_code, '')));
  IF v_state_code = '' OR v_state_code !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'state_code must be a 2-letter code';
  END IF;

  IF p_source_type IS NULL OR TRIM(p_source_type) = '' THEN
    RAISE EXCEPTION 'source_type is required';
  END IF;

  IF p_source_id IS NULL OR TRIM(p_source_id) = '' THEN
    RAISE EXCEPTION 'source_id is required';
  END IF;

  IF p_taxable_sales_cents < 0 OR p_tax_amount_cents < 0 THEN
    RAISE EXCEPTION 'sales tax tracking amounts cannot be negative';
  END IF;

  SELECT *
  INTO v_rule
  FROM public.sales_tax_state_rules
  WHERE state_code = v_state_code
  LIMIT 1;

  IF v_rule.state_code IS NULL THEN
    RAISE EXCEPTION 'Unknown sales tax state code: %', v_state_code;
  END IF;

  INSERT INTO public.ledger_sales_tax_threshold_events (
    ledger_id,
    state_code,
    calendar_year,
    source_type,
    source_id,
    taxable_sales_cents,
    tax_amount_cents,
    transaction_count,
    metadata
  ) VALUES (
    p_ledger_id,
    v_state_code,
    p_calendar_year,
    TRIM(p_source_type),
    TRIM(p_source_id),
    p_taxable_sales_cents,
    p_tax_amount_cents,
    1,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (ledger_id, source_type, source_id) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    SELECT *
    INTO v_status
    FROM public.ledger_sales_tax_state_status
    WHERE ledger_id = p_ledger_id
      AND state_code = v_state_code
      AND calendar_year = p_calendar_year;

    RETURN QUERY
    SELECT
      false,
      COALESCE(v_status.threshold_reached_at IS NOT NULL, false),
      COALESCE(v_status.taxable_sales_cents, 0),
      COALESCE(v_status.transaction_count, 0);
    RETURN;
  END IF;

  INSERT INTO public.ledger_sales_tax_state_status AS status (
    ledger_id,
    state_code,
    calendar_year,
    taxable_sales_cents,
    tax_amount_cents,
    transaction_count,
    threshold_sales_cents,
    threshold_transactions,
    threshold_reached_at,
    registration_status,
    updated_at
  ) VALUES (
    p_ledger_id,
    v_state_code,
    p_calendar_year,
    p_taxable_sales_cents,
    p_tax_amount_cents,
    1,
    v_rule.economic_nexus_sales_threshold_cents,
    v_rule.economic_nexus_transaction_threshold,
    CASE
      WHEN (v_rule.economic_nexus_sales_threshold_cents IS NOT NULL AND p_taxable_sales_cents >= v_rule.economic_nexus_sales_threshold_cents)
        OR (v_rule.economic_nexus_transaction_threshold IS NOT NULL AND 1 >= v_rule.economic_nexus_transaction_threshold)
      THEN now()
      ELSE NULL
    END,
    CASE
      WHEN (v_rule.economic_nexus_sales_threshold_cents IS NOT NULL AND p_taxable_sales_cents >= v_rule.economic_nexus_sales_threshold_cents)
        OR (v_rule.economic_nexus_transaction_threshold IS NOT NULL AND 1 >= v_rule.economic_nexus_transaction_threshold)
      THEN 'threshold_reached'
      WHEN v_rule.review_status = 'reviewed' THEN 'monitoring'
      ELSE 'pending_review'
    END,
    now()
  )
  ON CONFLICT (ledger_id, state_code, calendar_year) DO UPDATE
  SET
    taxable_sales_cents = status.taxable_sales_cents + EXCLUDED.taxable_sales_cents,
    tax_amount_cents = status.tax_amount_cents + EXCLUDED.tax_amount_cents,
    transaction_count = status.transaction_count + EXCLUDED.transaction_count,
    threshold_sales_cents = COALESCE(status.threshold_sales_cents, EXCLUDED.threshold_sales_cents),
    threshold_transactions = COALESCE(status.threshold_transactions, EXCLUDED.threshold_transactions),
    threshold_reached_at = COALESCE(
      status.threshold_reached_at,
      CASE
        WHEN (
          COALESCE(status.threshold_sales_cents, EXCLUDED.threshold_sales_cents) IS NOT NULL
          AND status.taxable_sales_cents + EXCLUDED.taxable_sales_cents >= COALESCE(status.threshold_sales_cents, EXCLUDED.threshold_sales_cents)
        ) OR (
          COALESCE(status.threshold_transactions, EXCLUDED.threshold_transactions) IS NOT NULL
          AND status.transaction_count + EXCLUDED.transaction_count >= COALESCE(status.threshold_transactions, EXCLUDED.threshold_transactions)
        )
        THEN now()
        ELSE NULL
      END
    ),
    registration_status = CASE
      WHEN status.registration_status IN ('registered', 'collecting', 'not_applicable') THEN status.registration_status
      WHEN (
        COALESCE(status.threshold_sales_cents, EXCLUDED.threshold_sales_cents) IS NOT NULL
        AND status.taxable_sales_cents + EXCLUDED.taxable_sales_cents >= COALESCE(status.threshold_sales_cents, EXCLUDED.threshold_sales_cents)
      ) OR (
        COALESCE(status.threshold_transactions, EXCLUDED.threshold_transactions) IS NOT NULL
        AND status.transaction_count + EXCLUDED.transaction_count >= COALESCE(status.threshold_transactions, EXCLUDED.threshold_transactions)
      )
      THEN 'threshold_reached'
      WHEN v_rule.review_status = 'reviewed' THEN 'monitoring'
      ELSE 'pending_review'
    END,
    updated_at = now()
  RETURNING *
  INTO v_status;

  RETURN QUERY
  SELECT
    true,
    v_status.threshold_reached_at IS NOT NULL,
    v_status.taxable_sales_cents,
    v_status.transaction_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_sales_tax_threshold_event(uuid, text, text, text, bigint, bigint, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_sales_tax_threshold_event(uuid, text, text, text, bigint, bigint, integer, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.record_sale_atomic(
  p_ledger_id uuid,
  p_reference_id text,
  p_creator_id text,
  p_gross_amount bigint,
  p_creator_amount bigint,
  p_platform_amount bigint,
  p_processing_fee bigint DEFAULT 0,
  p_soledgic_fee bigint DEFAULT 0,
  p_product_id text DEFAULT NULL::text,
  p_product_name text DEFAULT NULL::text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_sales_tax bigint DEFAULT 0,
  p_entry_method text DEFAULT 'processor'::text
)
RETURNS TABLE(out_transaction_id uuid, out_creator_account_id uuid, out_creator_balance numeric)
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_tx_id UUID;
  v_creator_account_id UUID;
  v_creator_is_active BOOLEAN;
  v_platform_account_id UUID;
  v_buyer_wallet_id UUID;
  v_fee_account_id UUID;
  v_soledgic_fee_account_id UUID;
  v_sales_tax_payable_account_id UUID;
  v_creator_balance NUMERIC(14,2);
  v_total_distributed BIGINT;
  v_entry_method TEXT;
  v_existing_amount NUMERIC(14,2);
  v_buyer_id TEXT;
BEGIN
  IF p_gross_amount <= 0 THEN
    RAISE EXCEPTION 'Gross amount must be positive: %', p_gross_amount;
  END IF;

  IF p_creator_amount < 0 OR p_platform_amount < 0 OR p_processing_fee < 0 OR p_soledgic_fee < 0 OR p_sales_tax < 0 THEN
    RAISE EXCEPTION 'Amounts cannot be negative';
  END IF;

  v_total_distributed := p_creator_amount + p_platform_amount + p_processing_fee + p_soledgic_fee + p_sales_tax;
  IF v_total_distributed != p_gross_amount THEN
    RAISE EXCEPTION 'Double-entry sum mismatch: creator(%) + platform(%) + fee(%) + soledgic(%) + sales_tax(%) = % != gross(%)',
      p_creator_amount, p_platform_amount, p_processing_fee, p_soledgic_fee, p_sales_tax, v_total_distributed, p_gross_amount;
  END IF;

  v_entry_method := COALESCE(NULLIF(TRIM(p_entry_method), ''), 'processor');
  IF v_entry_method NOT IN ('processor', 'manual', 'system', 'import') THEN
    v_entry_method := 'processor';
  END IF;

  v_buyer_id := p_metadata->>'buyer_id';

  SELECT id INTO v_platform_account_id
  FROM public.accounts
  WHERE ledger_id = p_ledger_id AND account_type = 'platform_revenue'
  LIMIT 1;

  IF v_platform_account_id IS NULL THEN
    RAISE EXCEPTION 'Platform revenue account not initialized for ledger %', p_ledger_id;
  END IF;

  IF v_buyer_id IS NOT NULL THEN
    SELECT id INTO v_buyer_wallet_id
    FROM public.accounts
    WHERE ledger_id = p_ledger_id
      AND account_type = 'buyer_wallet'
      AND entity_id = v_buyer_id
    FOR UPDATE;
  END IF;

  IF v_buyer_wallet_id IS NULL THEN
    SELECT id INTO v_buyer_wallet_id
    FROM public.accounts
    WHERE ledger_id = p_ledger_id AND account_type = 'cash'
    LIMIT 1;
  END IF;

  IF v_buyer_wallet_id IS NULL THEN
    RAISE EXCEPTION 'No debit account (buyer_wallet or cash) found for ledger %', p_ledger_id;
  END IF;

  SELECT id, is_active INTO v_creator_account_id, v_creator_is_active
  FROM public.accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'creator_balance'
    AND entity_id = p_creator_id
  FOR UPDATE;

  IF v_creator_account_id IS NOT NULL AND v_creator_is_active = false THEN
    RAISE EXCEPTION 'Creator % has been deleted', p_creator_id;
  END IF;

  IF v_creator_account_id IS NULL THEN
    INSERT INTO public.accounts (
      ledger_id, account_type, entity_id, entity_type, name
    ) VALUES (
      p_ledger_id, 'creator_balance', p_creator_id, 'creator', 'Creator ' || p_creator_id
    )
    RETURNING id INTO v_creator_account_id;
  END IF;

  IF p_processing_fee > 0 THEN
    SELECT id INTO v_fee_account_id
    FROM public.accounts
    WHERE ledger_id = p_ledger_id AND account_type = 'processing_fees'
    LIMIT 1;

    IF v_fee_account_id IS NULL THEN
      INSERT INTO public.accounts (
        ledger_id, account_type, entity_type, name
      ) VALUES (
        p_ledger_id, 'processing_fees', 'platform', 'Processing Fees'
      )
      RETURNING id INTO v_fee_account_id;
    END IF;
  END IF;

  IF p_soledgic_fee > 0 THEN
    SELECT id INTO v_soledgic_fee_account_id
    FROM public.accounts
    WHERE ledger_id = p_ledger_id AND account_type = 'soledgic_fee'
    LIMIT 1;

    IF v_soledgic_fee_account_id IS NULL THEN
      INSERT INTO public.accounts (
        ledger_id, account_type, entity_type, name
      ) VALUES (
        p_ledger_id, 'soledgic_fee', 'platform', 'Soledgic Platform Fee'
      )
      RETURNING id INTO v_soledgic_fee_account_id;
    END IF;
  END IF;

  IF p_sales_tax > 0 THEN
    SELECT id INTO v_sales_tax_payable_account_id
    FROM public.accounts
    WHERE ledger_id = p_ledger_id AND account_type = 'sales_tax_payable'
    LIMIT 1;

    IF v_sales_tax_payable_account_id IS NULL THEN
      INSERT INTO public.accounts (
        ledger_id, account_type, entity_type, name
      ) VALUES (
        p_ledger_id, 'sales_tax_payable', 'platform', 'Sales Tax Payable'
      )
      RETURNING id INTO v_sales_tax_payable_account_id;
    END IF;
  END IF;

  INSERT INTO public.transactions (
    ledger_id, transaction_type, reference_id, reference_type,
    description, amount, currency, status, entry_method, metadata
  ) VALUES (
    p_ledger_id, 'sale', p_reference_id, 'external',
    COALESCE(p_product_name, 'Sale for creator ' || p_creator_id),
    p_gross_amount / 100.0, 'USD', 'completed', v_entry_method,
    jsonb_build_object(
      'creator_id', p_creator_id,
      'product_id', p_product_id,
      'buyer_id', v_buyer_id,
      'amounts_cents', jsonb_build_object(
        'gross', p_gross_amount,
        'subtotal', p_gross_amount - p_sales_tax,
        'sales_tax', p_sales_tax,
        'creator', p_creator_amount,
        'platform', p_platform_amount,
        'fee', p_processing_fee,
        'soledgic_fee', p_soledgic_fee
      )
    ) || p_metadata
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_buyer_wallet_id, 'debit', p_gross_amount / 100.0);

  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_creator_account_id, 'credit', p_creator_amount / 100.0);

  INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_tx_id, v_platform_account_id, 'credit', p_platform_amount / 100.0);

  IF p_processing_fee > 0 AND v_fee_account_id IS NOT NULL THEN
    INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
    VALUES (v_tx_id, v_fee_account_id, 'credit', p_processing_fee / 100.0);
  END IF;

  IF p_soledgic_fee > 0 AND v_soledgic_fee_account_id IS NOT NULL THEN
    INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
    VALUES (v_tx_id, v_soledgic_fee_account_id, 'credit', p_soledgic_fee / 100.0);
  END IF;

  IF p_sales_tax > 0 AND v_sales_tax_payable_account_id IS NOT NULL THEN
    INSERT INTO public.entries (transaction_id, account_id, entry_type, amount)
    VALUES (v_tx_id, v_sales_tax_payable_account_id, 'credit', p_sales_tax / 100.0);
  END IF;

  SELECT balance INTO v_creator_balance
  FROM public.accounts
  WHERE id = v_creator_account_id;

  PERFORM 1 FROM (
    SELECT
      SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END) AS debits,
      SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END) AS credits
    FROM public.entries e
    WHERE e.transaction_id = v_tx_id
  ) AS totals
  WHERE totals.debits != totals.credits;

  IF FOUND THEN
    RAISE EXCEPTION 'CRITICAL: Double-entry validation failed for transaction %', v_tx_id;
  END IF;

  RETURN QUERY SELECT v_tx_id, v_creator_account_id, v_creator_balance;

EXCEPTION
  WHEN unique_violation THEN
    SELECT t.id, t.amount
      INTO v_tx_id, v_existing_amount
      FROM public.transactions t
     WHERE t.ledger_id = p_ledger_id
       AND t.reference_id = p_reference_id;

    IF v_tx_id IS NULL THEN RAISE; END IF;

    IF v_existing_amount IS DISTINCT FROM (p_gross_amount / 100.0) THEN
      RAISE EXCEPTION 'Idempotency conflict: reference_id "%" already exists with amount % but request has amount %',
        p_reference_id, v_existing_amount, p_gross_amount / 100.0;
    END IF;

    SELECT a.id, a.balance
      INTO v_creator_account_id, v_creator_balance
      FROM public.accounts a
     WHERE a.ledger_id = p_ledger_id
       AND a.account_type = 'creator_balance'
       AND a.entity_id = p_creator_id;

    RETURN QUERY SELECT v_tx_id, v_creator_account_id, v_creator_balance;
END;
$function$;
