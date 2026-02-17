-- Soledgic: Phase 3 processor Billing
-- Full billing integration: subscriptions, invoices, usage metering

-- ============================================================================
-- USAGE RECORDS (for metered billing)
-- ============================================================================
CREATE TABLE IF NOT EXISTS usage_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ledger_id uuid REFERENCES ledgers(id) ON DELETE SET NULL,
  
  -- Usage type
  usage_type text NOT NULL, -- api_calls, transactions, creators, storage_bytes
  
  -- Measurement
  quantity bigint NOT NULL DEFAULT 1,
  
  -- Period
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  
  -- processor sync
  processor_usage_record_id text,
  synced_to_processor_at timestamptz,
  
  -- Aggregation helpers
  recorded_at timestamptz NOT NULL DEFAULT now(),
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_records_org ON usage_records(organization_id);
CREATE INDEX idx_usage_records_type ON usage_records(usage_type);
CREATE INDEX idx_usage_records_period ON usage_records(period_start, period_end);
CREATE INDEX idx_usage_records_recorded ON usage_records(recorded_at DESC);

-- ============================================================================
-- USAGE AGGREGATES (daily rollups for efficiency)
-- ============================================================================
CREATE TABLE IF NOT EXISTS usage_aggregates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Period
  date date NOT NULL,
  
  -- Counts
  api_calls bigint DEFAULT 0,
  transactions_count bigint DEFAULT 0,
  creators_count bigint DEFAULT 0,
  storage_bytes bigint DEFAULT 0,
  
  -- Computed at
  computed_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(organization_id, date)
);

CREATE INDEX idx_usage_aggregates_org ON usage_aggregates(organization_id);
CREATE INDEX idx_usage_aggregates_date ON usage_aggregates(date DESC);

-- ============================================================================
-- INVOICES (synced from processor)
-- ============================================================================
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- processor IDs
  processor_invoice_id text UNIQUE NOT NULL,
  processor_subscription_id text,
  processor_customer_id text NOT NULL,
  
  -- Invoice details
  number text,
  status text NOT NULL, -- draft, open, paid, void, uncollectible
  
  -- Amounts (in cents)
  subtotal integer NOT NULL DEFAULT 0,
  tax integer DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  amount_paid integer DEFAULT 0,
  amount_due integer DEFAULT 0,
  
  currency text DEFAULT 'usd',
  
  -- Dates
  period_start timestamptz,
  period_end timestamptz,
  due_date timestamptz,
  paid_at timestamptz,
  
  -- URLs
  hosted_invoice_url text,
  invoice_pdf text,
  
  -- Line items
  lines jsonb DEFAULT '[]',
  
  -- Raw data
  raw_data jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoices_org ON invoices(organization_id);
CREATE INDEX idx_invoices_processor ON invoices(processor_invoice_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_date ON invoices(created_at DESC);

-- ============================================================================
-- PAYMENT METHODS (for quick reference)
-- ============================================================================
CREATE TABLE IF NOT EXISTS payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- processor IDs
  processor_payment_method_id text UNIQUE NOT NULL,
  
  -- Type
  type text NOT NULL, -- card, bank_account, etc
  
  -- Card details (masked)
  card_brand text,
  card_last4 text,
  card_exp_month integer,
  card_exp_year integer,
  
  -- Status
  is_default boolean DEFAULT false,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_methods_org ON payment_methods(organization_id);

-- ============================================================================
-- SUBSCRIPTION ITEMS (for multi-price subscriptions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS subscription_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  
  -- processor IDs
  processor_subscription_item_id text UNIQUE NOT NULL,
  processor_price_id text NOT NULL,
  
  -- Details
  quantity integer DEFAULT 1,
  
  -- For metered billing
  is_metered boolean DEFAULT false,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscription_items_sub ON subscription_items(subscription_id);

-- ============================================================================
-- processor CUSTOMERS (extended from organizations)
-- ============================================================================
-- Add more processor-related columns to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS processor_default_payment_method_id text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_email text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_address jsonb;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS tax_id text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS tax_exempt text DEFAULT 'none';

-- ============================================================================
-- PRODUCT CATALOG (optional - for self-service)
-- ============================================================================
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- processor IDs
  processor_product_id text UNIQUE NOT NULL,
  
  -- Details
  name text NOT NULL,
  description text,
  
  -- Type
  product_type text DEFAULT 'service', -- service, addon, metered
  
  -- Status
  is_active boolean DEFAULT true,
  
  metadata jsonb DEFAULT '{}',
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  
  -- processor IDs
  processor_price_id text UNIQUE NOT NULL,
  
  -- Pricing
  unit_amount integer, -- in cents, null for metered
  currency text DEFAULT 'usd',
  
  -- Billing
  billing_scheme text DEFAULT 'per_unit', -- per_unit, tiered
  recurring_interval text, -- month, year, null for one-time
  recurring_interval_count integer DEFAULT 1,
  
  -- Metered
  usage_type text, -- licensed, metered
  aggregate_usage text, -- sum, last_during_period, max
  
  -- Tiers (for tiered pricing)
  tiers jsonb,
  tiers_mode text, -- graduated, volume
  
  -- Status
  is_active boolean DEFAULT true,
  
  metadata jsonb DEFAULT '{}',
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_prices_product ON prices(product_id);
CREATE INDEX idx_prices_processor ON prices(processor_price_id);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Record API usage
CREATE OR REPLACE FUNCTION record_api_usage(
  p_organization_id uuid,
  p_ledger_id uuid DEFAULT NULL,
  p_quantity integer DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO usage_records (
    organization_id,
    ledger_id,
    usage_type,
    quantity,
    period_start,
    period_end
  ) VALUES (
    p_organization_id,
    p_ledger_id,
    'api_calls',
    p_quantity,
    date_trunc('day', now()),
    date_trunc('day', now()) + interval '1 day'
  );
END;
$$;

-- Record transaction usage
CREATE OR REPLACE FUNCTION record_transaction_usage(
  p_organization_id uuid,
  p_ledger_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO usage_records (
    organization_id,
    ledger_id,
    usage_type,
    quantity,
    period_start,
    period_end
  ) VALUES (
    p_organization_id,
    p_ledger_id,
    'transactions',
    1,
    date_trunc('day', now()),
    date_trunc('day', now()) + interval '1 day'
  );
END;
$$;

-- Aggregate daily usage
CREATE OR REPLACE FUNCTION aggregate_daily_usage(p_date date DEFAULT CURRENT_DATE - 1)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  INSERT INTO usage_aggregates (organization_id, date, api_calls, transactions_count)
  SELECT 
    organization_id,
    p_date,
    COALESCE(SUM(quantity) FILTER (WHERE usage_type = 'api_calls'), 0),
    COALESCE(SUM(quantity) FILTER (WHERE usage_type = 'transactions'), 0)
  FROM usage_records
  WHERE period_start::date = p_date
  GROUP BY organization_id
  ON CONFLICT (organization_id, date) DO UPDATE SET
    api_calls = EXCLUDED.api_calls,
    transactions_count = EXCLUDED.transactions_count,
    computed_at = now();
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Get current billing period usage
CREATE OR REPLACE FUNCTION get_current_period_usage(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_result jsonb;
BEGIN
  -- Get current billing period from subscription
  SELECT current_period_start, current_period_end
  INTO v_period_start, v_period_end
  FROM subscriptions
  WHERE organization_id = p_organization_id
    AND status IN ('active', 'trialing')
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- Default to current month if no subscription
  IF v_period_start IS NULL THEN
    v_period_start := date_trunc('month', now());
    v_period_end := date_trunc('month', now()) + interval '1 month';
  END IF;
  
  SELECT jsonb_build_object(
    'period_start', v_period_start,
    'period_end', v_period_end,
    'api_calls', COALESCE(SUM(api_calls), 0),
    'transactions', COALESCE(SUM(transactions_count), 0),
    'creators', (
      SELECT COUNT(DISTINCT entity_id) 
      FROM accounts 
      WHERE ledger_id IN (SELECT id FROM ledgers WHERE organization_id = p_organization_id)
        AND account_type = 'creator_balance'
    ),
    'ledgers', (
      SELECT COUNT(*) FROM ledgers WHERE organization_id = p_organization_id
    )
  ) INTO v_result
  FROM usage_aggregates
  WHERE organization_id = p_organization_id
    AND date >= v_period_start::date
    AND date < v_period_end::date;
  
  RETURN v_result;
END;
$$;

-- Check if usage exceeds plan limits
CREATE OR REPLACE FUNCTION check_usage_limits(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org organizations%ROWTYPE;
  v_usage jsonb;
  v_warnings jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_org FROM organizations WHERE id = p_organization_id;
  v_usage := get_current_period_usage(p_organization_id);
  
  -- Check ledger limit
  IF v_org.max_ledgers > 0 AND (v_usage->>'ledgers')::int > v_org.max_ledgers THEN
    v_warnings := v_warnings || jsonb_build_object(
      'type', 'ledgers',
      'limit', v_org.max_ledgers,
      'current', (v_usage->>'ledgers')::int,
      'overage', (v_usage->>'ledgers')::int - v_org.max_ledgers
    );
  END IF;
  
  -- Check member limit
  IF v_org.max_team_members > 0 AND v_org.current_member_count > v_org.max_team_members THEN
    v_warnings := v_warnings || jsonb_build_object(
      'type', 'members',
      'limit', v_org.max_team_members,
      'current', v_org.current_member_count,
      'overage', v_org.current_member_count - v_org.max_team_members
    );
  END IF;
  
  RETURN jsonb_build_object(
    'organization_id', p_organization_id,
    'plan', v_org.plan,
    'usage', v_usage,
    'limits', jsonb_build_object(
      'ledgers', v_org.max_ledgers,
      'members', v_org.max_team_members
    ),
    'warnings', v_warnings,
    'has_warnings', jsonb_array_length(v_warnings) > 0
  );
END;
$$;

-- Sync subscription from processor event
CREATE OR REPLACE FUNCTION sync_subscription_from_processor(
  p_organization_id uuid,
  p_processor_data jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription_id uuid;
BEGIN
  INSERT INTO subscriptions (
    organization_id,
    processor_subscription_id,
    processor_customer_id,
    processor_price_id,
    plan,
    status,
    current_period_start,
    current_period_end,
    cancel_at,
    canceled_at,
    trial_start,
    trial_end,
    quantity
  ) VALUES (
    p_organization_id,
    p_processor_data->>'id',
    p_processor_data->>'customer',
    p_processor_data->'items'->'data'->0->'price'->>'id',
    COALESCE(p_processor_data->'metadata'->>'plan', 'pro'),
    p_processor_data->>'status',
    to_timestamp((p_processor_data->>'current_period_start')::bigint),
    to_timestamp((p_processor_data->>'current_period_end')::bigint),
    CASE WHEN p_processor_data->>'cancel_at' IS NOT NULL 
      THEN to_timestamp((p_processor_data->>'cancel_at')::bigint) END,
    CASE WHEN p_processor_data->>'canceled_at' IS NOT NULL 
      THEN to_timestamp((p_processor_data->>'canceled_at')::bigint) END,
    CASE WHEN p_processor_data->>'trial_start' IS NOT NULL 
      THEN to_timestamp((p_processor_data->>'trial_start')::bigint) END,
    CASE WHEN p_processor_data->>'trial_end' IS NOT NULL 
      THEN to_timestamp((p_processor_data->>'trial_end')::bigint) END,
    COALESCE((p_processor_data->'items'->'data'->0->>'quantity')::int, 1)
  )
  ON CONFLICT (processor_subscription_id) DO UPDATE SET
    status = EXCLUDED.status,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    cancel_at = EXCLUDED.cancel_at,
    canceled_at = EXCLUDED.canceled_at,
    quantity = EXCLUDED.quantity,
    updated_at = now()
  RETURNING id INTO v_subscription_id;
  
  -- Update organization
  UPDATE organizations
  SET 
    processor_subscription_id = p_processor_data->>'id',
    plan = COALESCE(p_processor_data->'metadata'->>'plan', plan),
    status = CASE 
      WHEN p_processor_data->>'status' IN ('active', 'trialing') THEN 'active'
      WHEN p_processor_data->>'status' = 'past_due' THEN 'past_due'
      WHEN p_processor_data->>'status' = 'canceled' THEN 'canceled'
      ELSE status
    END,
    updated_at = now()
  WHERE id = p_organization_id;
  
  RETURN v_subscription_id;
END;
$$;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE prices ENABLE ROW LEVEL SECURITY;

-- Service role bypass
CREATE POLICY "Service role usage_records" ON usage_records FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role usage_aggregates" ON usage_aggregates FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role invoices" ON invoices FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role payment_methods" ON payment_methods FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role subscription_items" ON subscription_items FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role products" ON products FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role prices" ON prices FOR ALL USING (auth.role() = 'service_role');

-- Org members can view their data
CREATE POLICY "Org members view usage" ON usage_records FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "Org members view aggregates" ON usage_aggregates FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "Org members view invoices" ON invoices FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "Org members view payment methods" ON payment_methods FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid() AND status = 'active'
  ));

-- Products and prices are public
CREATE POLICY "Anyone can view products" ON products FOR SELECT USING (is_active = true);
CREATE POLICY "Anyone can view prices" ON prices FOR SELECT USING (is_active = true);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Track transaction creation for usage
CREATE OR REPLACE FUNCTION track_transaction_usage()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id uuid;
BEGIN
  -- Get organization from ledger
  SELECT organization_id INTO v_org_id
  FROM ledgers WHERE id = NEW.ledger_id;
  
  IF v_org_id IS NOT NULL THEN
    PERFORM record_transaction_usage(v_org_id, NEW.ledger_id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_transaction_usage ON transactions;
CREATE TRIGGER trigger_transaction_usage
  AFTER INSERT ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION track_transaction_usage();

COMMENT ON TABLE usage_records IS 'Granular usage events for metered billing';
COMMENT ON TABLE usage_aggregates IS 'Daily rollups of usage for reporting';
COMMENT ON TABLE invoices IS 'processor invoices synced for display';
COMMENT ON TABLE payment_methods IS 'Customer payment methods for quick reference';
COMMENT ON TABLE products IS 'processor products catalog';
COMMENT ON TABLE prices IS 'processor prices (pricing tiers)';
