-- soledgic: Split Configuration Tables
-- Per-creator, per-product, and tiered splits

-- ============================================================================
-- PRODUCT SPLITS
-- ============================================================================

-- Allow different split rates per product
CREATE TABLE IF NOT EXISTS product_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  
  product_id TEXT NOT NULL,              -- External product ID
  product_name TEXT,                      -- Display name
  
  creator_percent NUMERIC(5,2) NOT NULL CHECK (creator_percent >= 0 AND creator_percent <= 100),
  
  -- Optional: per-creator overrides for this product
  creator_overrides JSONB DEFAULT '{}',  -- { "creator_123": 85, "creator_456": 90 }
  
  effective_from TIMESTAMPTZ DEFAULT NOW(),
  effective_until TIMESTAMPTZ,            -- NULL = no end date
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(ledger_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_splits_ledger ON product_splits(ledger_id);
CREATE INDEX IF NOT EXISTS idx_product_splits_product ON product_splits(ledger_id, product_id);

ALTER TABLE product_splits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ledger isolation" ON product_splits;
CREATE POLICY "Ledger isolation" ON product_splits
  FOR ALL USING (
    ledger_id = current_setting('app.current_ledger_id', true)::uuid
  );

-- ============================================================================
-- CREATOR TIERS
-- ============================================================================

-- Define tier levels with their split rates
CREATE TABLE IF NOT EXISTS creator_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  
  tier_name TEXT NOT NULL,                -- 'bronze', 'silver', 'gold', 'platinum'
  tier_order INTEGER NOT NULL,            -- For sorting (1 = lowest, 4 = highest)
  
  creator_percent NUMERIC(5,2) NOT NULL CHECK (creator_percent >= 0 AND creator_percent <= 100),
  
  -- Threshold to qualify for this tier
  threshold_type TEXT CHECK (threshold_type IN ('lifetime_earnings', 'monthly_earnings', 'sale_count', 'manual')),
  threshold_value NUMERIC(14,2),          -- Amount or count to qualify
  
  description TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(ledger_id, tier_name)
);

CREATE INDEX IF NOT EXISTS idx_creator_tiers_ledger ON creator_tiers(ledger_id);

ALTER TABLE creator_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ledger isolation" ON creator_tiers;
CREATE POLICY "Ledger isolation" ON creator_tiers
  FOR ALL USING (
    ledger_id = current_setting('app.current_ledger_id', true)::uuid
  );

-- ============================================================================
-- FUNCTIONS: Set Creator Split
-- ============================================================================

-- Set a custom split rate for a specific creator
CREATE OR REPLACE FUNCTION set_creator_split(
  p_ledger_id UUID,
  p_creator_id TEXT,
  p_creator_percent NUMERIC(5,2)
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Update the creator's account metadata
  UPDATE accounts
  SET 
    metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{custom_split_percent}',
      to_jsonb(p_creator_percent)
    ),
    updated_at = NOW()
  WHERE ledger_id = p_ledger_id
    AND account_type = 'creator_balance'
    AND entity_id = p_creator_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Set a creator's tier
CREATE OR REPLACE FUNCTION set_creator_tier(
  p_ledger_id UUID,
  p_creator_id TEXT,
  p_tier_name TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Verify tier exists
  IF NOT EXISTS (
    SELECT 1 FROM creator_tiers 
    WHERE ledger_id = p_ledger_id AND tier_name = p_tier_name
  ) THEN
    RAISE EXCEPTION 'Tier % does not exist', p_tier_name;
  END IF;

  -- Update the creator's account metadata
  UPDATE accounts
  SET 
    metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{tier}',
      to_jsonb(p_tier_name)
    ),
    updated_at = NOW()
  WHERE ledger_id = p_ledger_id
    AND account_type = 'creator_balance'
    AND entity_id = p_creator_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Clear a creator's custom split (revert to tier or default)
CREATE OR REPLACE FUNCTION clear_creator_split(
  p_ledger_id UUID,
  p_creator_id TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE accounts
  SET 
    metadata = metadata - 'custom_split_percent',
    updated_at = NOW()
  WHERE ledger_id = p_ledger_id
    AND account_type = 'creator_balance'
    AND entity_id = p_creator_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Get Effective Split for a Sale
-- ============================================================================

CREATE OR REPLACE FUNCTION get_effective_split(
  p_ledger_id UUID,
  p_creator_id TEXT,
  p_product_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  creator_percent NUMERIC(5,2),
  platform_percent NUMERIC(5,2),
  source TEXT
) AS $$
DECLARE
  v_creator_custom NUMERIC(5,2);
  v_creator_tier TEXT;
  v_tier_percent NUMERIC(5,2);
  v_product_percent NUMERIC(5,2);
  v_product_creator_override NUMERIC(5,2);
  v_default_percent NUMERIC(5,2);
BEGIN
  -- Get creator's custom rate and tier
  SELECT 
    (a.metadata->>'custom_split_percent')::NUMERIC(5,2),
    a.metadata->>'tier'
  INTO v_creator_custom, v_creator_tier
  FROM accounts a
  WHERE a.ledger_id = p_ledger_id
    AND a.account_type = 'creator_balance'
    AND a.entity_id = p_creator_id;

  -- 1. Check creator's custom rate
  IF v_creator_custom IS NOT NULL THEN
    RETURN QUERY SELECT v_creator_custom, 100 - v_creator_custom, 'creator'::TEXT;
    RETURN;
  END IF;

  -- 2. Check product-specific rate (with creator override)
  IF p_product_id IS NOT NULL THEN
    SELECT 
      ps.creator_percent,
      (ps.creator_overrides->>p_creator_id)::NUMERIC(5,2)
    INTO v_product_percent, v_product_creator_override
    FROM product_splits ps
    WHERE ps.ledger_id = p_ledger_id
      AND ps.product_id = p_product_id
      AND (ps.effective_until IS NULL OR ps.effective_until > NOW());

    -- Product + creator override
    IF v_product_creator_override IS NOT NULL THEN
      RETURN QUERY SELECT v_product_creator_override, 100 - v_product_creator_override, 'product_creator'::TEXT;
      RETURN;
    END IF;

    -- Product default
    IF v_product_percent IS NOT NULL THEN
      RETURN QUERY SELECT v_product_percent, 100 - v_product_percent, 'product'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- 3. Check tier-based rate
  IF v_creator_tier IS NOT NULL THEN
    SELECT ct.creator_percent INTO v_tier_percent
    FROM creator_tiers ct
    WHERE ct.ledger_id = p_ledger_id
      AND ct.tier_name = v_creator_tier;

    IF v_tier_percent IS NOT NULL THEN
      RETURN QUERY SELECT v_tier_percent, 100 - v_tier_percent, 'tier'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- 4. Ledger default
  SELECT COALESCE((l.settings->>'default_split_percent')::NUMERIC(5,2), 80)
  INTO v_default_percent
  FROM ledgers l
  WHERE l.id = p_ledger_id;

  RETURN QUERY SELECT v_default_percent, 100 - v_default_percent, 'ledger_default'::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Auto-Promote Creators to Tiers
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_promote_creators(p_ledger_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_creator RECORD;
  v_tier RECORD;
  v_earnings NUMERIC(14,2);
  v_promoted INTEGER := 0;
BEGIN
  -- For each creator
  FOR v_creator IN
    SELECT entity_id, metadata
    FROM accounts
    WHERE ledger_id = p_ledger_id
      AND account_type = 'creator_balance'
  LOOP
    -- Calculate lifetime earnings
    SELECT COALESCE(SUM(e.amount), 0) INTO v_earnings
    FROM entries e
    JOIN transactions t ON e.transaction_id = t.id
    WHERE e.account_id = (
      SELECT id FROM accounts 
      WHERE ledger_id = p_ledger_id 
        AND account_type = 'creator_balance' 
        AND entity_id = v_creator.entity_id
    )
    AND e.entry_type = 'credit'
    AND t.transaction_type = 'sale';

    -- Find highest qualifying tier
    SELECT * INTO v_tier
    FROM creator_tiers
    WHERE ledger_id = p_ledger_id
      AND threshold_type = 'lifetime_earnings'
      AND threshold_value <= v_earnings
    ORDER BY tier_order DESC
    LIMIT 1;

    -- Update if tier changed
    IF v_tier IS NOT NULL AND (v_creator.metadata->>'tier') IS DISTINCT FROM v_tier.tier_name THEN
      PERFORM set_creator_tier(p_ledger_id, v_creator.entity_id, v_tier.tier_name);
      v_promoted := v_promoted + 1;
    END IF;
  END LOOP;

  RETURN v_promoted;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- DEFAULT TIERS (optional - can be customized per ledger)
-- ============================================================================

-- Function to initialize default tiers for a new marketplace ledger
CREATE OR REPLACE FUNCTION initialize_default_tiers(p_ledger_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO creator_tiers (ledger_id, tier_name, tier_order, creator_percent, threshold_type, threshold_value, description)
  VALUES
    (p_ledger_id, 'starter', 1, 80, 'lifetime_earnings', 0, 'Default tier for new creators'),
    (p_ledger_id, 'bronze', 2, 82, 'lifetime_earnings', 1000, 'Unlocked at $1,000 lifetime earnings'),
    (p_ledger_id, 'silver', 3, 85, 'lifetime_earnings', 10000, 'Unlocked at $10,000 lifetime earnings'),
    (p_ledger_id, 'gold', 4, 88, 'lifetime_earnings', 50000, 'Unlocked at $50,000 lifetime earnings'),
    (p_ledger_id, 'platinum', 5, 90, 'lifetime_earnings', 100000, 'Unlocked at $100,000 lifetime earnings')
  ON CONFLICT (ledger_id, tier_name) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- UPDATE TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_product_splits_updated ON product_splits;
CREATE TRIGGER trigger_product_splits_updated
  BEFORE UPDATE ON product_splits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_creator_tiers_updated ON creator_tiers;
CREATE TRIGGER trigger_creator_tiers_updated
  BEFORE UPDATE ON creator_tiers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
