-- soledgic: Development & Testing Setup
-- Creates test data for local development and API testing
-- Run this AFTER all other migrations

-- ============================================================================
-- 1. MAKE owner_email OPTIONAL FOR API-ONLY LEDGERS
-- ============================================================================

ALTER TABLE ledgers ALTER COLUMN owner_email DROP NOT NULL;

-- ============================================================================
-- 2. BYPASS TRIGGER FOR API-ONLY LEDGERS
-- ============================================================================

-- Modify the enforce_ledger_limit trigger to allow NULL organization_id
CREATE OR REPLACE FUNCTION enforce_ledger_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id UUID;
  v_max_ledgers INTEGER;
  v_current_count INTEGER;
  v_plan TEXT;
  v_trial_ends_at TIMESTAMPTZ;
  v_status TEXT;
BEGIN
  v_org_id := NEW.organization_id;
  
  -- ALLOW LEDGERS WITHOUT ORGANIZATION (API-only mode)
  IF v_org_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get organization limits
  SELECT 
    max_ledgers, 
    current_ledger_count, 
    plan,
    trial_ends_at,
    status
  INTO 
    v_max_ledgers, 
    v_current_count, 
    v_plan,
    v_trial_ends_at,
    v_status
  FROM organizations
  WHERE id = v_org_id;
  
  -- Check if organization exists
  IF v_max_ledgers IS NULL THEN
    RAISE EXCEPTION 'Organization not found: %', v_org_id;
  END IF;
  
  -- Check organization status
  IF v_status = 'suspended' THEN
    RAISE EXCEPTION 'Organization is suspended. Please contact support.';
  END IF;
  
  IF v_status = 'canceled' THEN
    RAISE EXCEPTION 'Organization subscription is canceled. Please reactivate.';
  END IF;
  
  -- Check trial expiration
  IF v_plan = 'trial' AND v_trial_ends_at < NOW() THEN
    RAISE EXCEPTION 'Trial has expired. Please upgrade to continue creating ledgers.';
  END IF;
  
  -- Scale plan (-1) has unlimited ledgers
  IF v_max_ledgers = -1 THEN
    RETURN NEW;
  END IF;
  
  -- Check ledger limit (allow overage but track it)
  IF v_current_count >= v_max_ledgers THEN
    INSERT INTO billing_events (
      organization_id,
      stripe_event_type,
      description,
      stripe_data
    ) VALUES (
      v_org_id,
      'ledger_overage',
      'Ledger created beyond plan limit',
      jsonb_build_object(
        'plan', v_plan,
        'max_ledgers', v_max_ledgers,
        'current_count', v_current_count + 1,
        'overage_count', (v_current_count + 1) - v_max_ledgers,
        'ledger_id', NEW.id
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. MAKE organization_id OPTIONAL ON LEDGERS (if column exists)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ledgers' 
    AND column_name = 'organization_id'
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE ledgers ALTER COLUMN organization_id DROP NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- 4. CREATE DEVELOPMENT TEST DATA
-- ============================================================================

DO $$
DECLARE
  v_ledger_id UUID;
BEGIN
  -- Check if any ledgers exist
  IF NOT EXISTS (SELECT 1 FROM ledgers LIMIT 1) THEN
    
    -- Create a test marketplace ledger (Booklyverse)
    INSERT INTO ledgers (
      business_name, 
      ledger_mode, 
      status, 
      owner_email,
      settings, 
      api_key
    )
    VALUES (
      'Booklyverse',
      'marketplace',
      'active',
      'test@booklyverse.com',
      '{
        "default_split_percent": 80,
        "platform_fee_percent": 20,
        "min_payout_amount": 25,
        "payout_schedule": "weekly",
        "tax_withholding_percent": 0,
        "tier_splits": {
          "starter": {"creator_percent": 80},
          "bronze": {"creator_percent": 82},
          "silver": {"creator_percent": 85},
          "gold": {"creator_percent": 88},
          "platinum": {"creator_percent": 90}
        }
      }'::jsonb,
      'sk_test_booklyverse_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 24)
    )
    RETURNING id INTO v_ledger_id;
    
    -- Initialize marketplace accounts
    PERFORM initialize_marketplace_accounts(v_ledger_id);
    
    -- Initialize default tiers
    PERFORM initialize_default_tiers(v_ledger_id);
    
    RAISE NOTICE 'Created test marketplace ledger: %', v_ledger_id;
    
    -- Create a test standard ledger (Acme Consulting)
    INSERT INTO ledgers (
      business_name, 
      ledger_mode, 
      status, 
      owner_email,
      settings, 
      api_key
    )
    VALUES (
      'Acme Consulting',
      'standard',
      'active',
      'test@acme.com',
      '{
        "fiscal_year_start": "01-01",
        "default_tax_rate": 25,
        "track_sales_tax": false,
        "invoice_prefix": "INV"
      }'::jsonb,
      'sk_test_acme_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 24)
    )
    RETURNING id INTO v_ledger_id;
    
    -- Initialize standard accounts
    PERFORM initialize_standard_accounts(v_ledger_id);
    
    RAISE NOTICE 'Created test standard ledger: %', v_ledger_id;
    
  ELSE
    RAISE NOTICE 'Ledgers already exist, skipping test data creation';
  END IF;
END $$;

-- ============================================================================
-- 5. SHOW TEST DATA
-- ============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== SOLEDGIC TEST LEDGERS ===';
  FOR r IN 
    SELECT business_name, ledger_mode, api_key 
    FROM ledgers 
    ORDER BY created_at
  LOOP
    RAISE NOTICE 'Business: % | Mode: % | API Key: %', r.business_name, r.ledger_mode, r.api_key;
  END LOOP;
  RAISE NOTICE '';
END $$;
