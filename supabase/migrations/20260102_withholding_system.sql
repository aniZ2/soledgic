-- soledgic: Tax Reserve & Withholding System
-- Hold funds before releasing to creator balances

-- ============================================================================
-- WITHHOLDING RULES
-- ============================================================================

CREATE TABLE IF NOT EXISTS withholding_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  
  -- Rule identification
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'tax_reserve',        -- IRS/state tax withholding
    'refund_buffer',      -- Hold for potential refunds
    'platform_hold',      -- Platform-specific hold
    'compliance_hold'     -- KYC/verification hold
  )),
  
  -- Trigger conditions
  applies_to TEXT DEFAULT 'all' CHECK (applies_to IN ('all', 'creators', 'specific')),
  creator_ids TEXT[],                     -- If applies_to = 'specific'
  product_ids TEXT[],                     -- Optional: specific products only
  
  -- Withholding calculation
  percent NUMERIC(5,2) NOT NULL CHECK (percent >= 0 AND percent <= 100),
  min_amount NUMERIC(14,2) DEFAULT 0,     -- Minimum sale to trigger
  max_amount NUMERIC(14,2),               -- Cap on withholding amount
  
  -- Release conditions
  hold_days INTEGER DEFAULT 0,            -- Days to hold before release
  release_trigger TEXT DEFAULT 'automatic' CHECK (release_trigger IN (
    'automatic',          -- Release after hold_days
    'manual',             -- Requires manual release
    'threshold',          -- Release when threshold met
    'period_end'          -- Release at end of period
  )),
  release_threshold NUMERIC(14,2),        -- For threshold trigger
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 100,           -- Lower = applied first
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_withholding_rules_ledger ON withholding_rules(ledger_id, is_active);

-- ============================================================================
-- HELD FUNDS
-- ============================================================================

CREATE TABLE IF NOT EXISTS held_funds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  
  -- Source
  transaction_id UUID NOT NULL REFERENCES transactions(id),
  withholding_rule_id UUID NOT NULL REFERENCES withholding_rules(id),
  
  -- Who this is held for
  creator_id TEXT NOT NULL,
  
  -- Amounts
  held_amount NUMERIC(14,2) NOT NULL,
  released_amount NUMERIC(14,2) DEFAULT 0,
  
  -- Status
  status TEXT DEFAULT 'held' CHECK (status IN ('held', 'partial', 'released', 'forfeited')),
  
  -- Timing
  held_at TIMESTAMPTZ DEFAULT NOW(),
  release_eligible_at TIMESTAMPTZ,        -- When it CAN be released
  released_at TIMESTAMPTZ,                -- When it WAS released
  release_transaction_id UUID REFERENCES transactions(id),
  
  -- Reason tracking
  hold_reason TEXT,
  release_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_held_funds_ledger ON held_funds(ledger_id);
CREATE INDEX IF NOT EXISTS idx_held_funds_creator ON held_funds(ledger_id, creator_id);
CREATE INDEX IF NOT EXISTS idx_held_funds_status ON held_funds(ledger_id, status);
CREATE INDEX IF NOT EXISTS idx_held_funds_release ON held_funds(status, release_eligible_at) 
  WHERE status = 'held';

-- ============================================================================
-- RESERVE ACCOUNTS (Auto-created per rule type)
-- ============================================================================

-- Function to get or create reserve account for a withholding type
CREATE OR REPLACE FUNCTION get_or_create_reserve_account(
  p_ledger_id UUID,
  p_rule_type TEXT
)
RETURNS UUID AS $$
DECLARE
  v_account_id UUID;
  v_account_name TEXT;
BEGIN
  -- Determine account name
  v_account_name := CASE p_rule_type
    WHEN 'tax_reserve' THEN 'Tax Withholding Reserve'
    WHEN 'refund_buffer' THEN 'Refund Reserve'
    WHEN 'platform_hold' THEN 'Platform Hold Reserve'
    WHEN 'compliance_hold' THEN 'Compliance Hold Reserve'
    ELSE 'Withholding Reserve'
  END;
  
  -- Try to find existing
  SELECT id INTO v_account_id
  FROM accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'reserve'
    AND name = v_account_name;
  
  -- Create if not exists
  IF v_account_id IS NULL THEN
    INSERT INTO accounts (ledger_id, account_type, entity_type, name, metadata)
    VALUES (
      p_ledger_id,
      'reserve',
      'platform',
      v_account_name,
      jsonb_build_object('reserve_type', p_rule_type)
    )
    RETURNING id INTO v_account_id;
  END IF;
  
  RETURN v_account_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- APPLY WITHHOLDING TO SALE
-- ============================================================================

CREATE OR REPLACE FUNCTION apply_withholding_to_sale(
  p_transaction_id UUID,
  p_ledger_id UUID,
  p_creator_id TEXT,
  p_creator_amount NUMERIC(14,2),
  p_product_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  rule_id UUID,
  rule_type TEXT,
  withheld_amount NUMERIC(14,2),
  remaining_creator_amount NUMERIC(14,2)
) AS $$
DECLARE
  v_rule RECORD;
  v_withheld NUMERIC(14,2);
  v_remaining NUMERIC(14,2) := p_creator_amount;
  v_reserve_account_id UUID;
  v_creator_account_id UUID;
BEGIN
  -- Get creator account
  SELECT id INTO v_creator_account_id
  FROM accounts
  WHERE ledger_id = p_ledger_id
    AND account_type = 'creator_balance'
    AND entity_id = p_creator_id;
  
  -- Process each active rule in priority order
  FOR v_rule IN
    SELECT * FROM withholding_rules
    WHERE ledger_id = p_ledger_id
      AND is_active = true
      AND (
        applies_to = 'all'
        OR (applies_to = 'creators' AND p_creator_id = ANY(creator_ids))
        OR (applies_to = 'specific' AND p_creator_id = ANY(creator_ids))
      )
      AND (product_ids IS NULL OR p_product_id = ANY(product_ids))
      AND (min_amount IS NULL OR p_creator_amount >= min_amount)
    ORDER BY priority ASC
  LOOP
    -- Calculate withholding
    v_withheld := ROUND(v_remaining * (v_rule.percent / 100), 2);
    
    -- Apply max cap if set
    IF v_rule.max_amount IS NOT NULL AND v_withheld > v_rule.max_amount THEN
      v_withheld := v_rule.max_amount;
    END IF;
    
    -- Skip if nothing to withhold
    IF v_withheld <= 0 THEN
      CONTINUE;
    END IF;
    
    -- Get/create reserve account
    v_reserve_account_id := get_or_create_reserve_account(p_ledger_id, v_rule.rule_type);
    
    -- Record the hold
    INSERT INTO held_funds (
      ledger_id,
      transaction_id,
      withholding_rule_id,
      creator_id,
      held_amount,
      release_eligible_at,
      hold_reason
    ) VALUES (
      p_ledger_id,
      p_transaction_id,
      v_rule.id,
      p_creator_id,
      v_withheld,
      CASE 
        WHEN v_rule.hold_days > 0 THEN NOW() + (v_rule.hold_days || ' days')::interval
        ELSE NOW()
      END,
      v_rule.name
    );
    
    -- Create transfer entry: Creator Balance → Reserve
    -- DEBIT creator (reduce liability to them)
    INSERT INTO entries (transaction_id, account_id, entry_type, amount)
    VALUES (p_transaction_id, v_creator_account_id, 'debit', v_withheld);
    
    -- CREDIT reserve (increase liability to reserve)
    INSERT INTO entries (transaction_id, account_id, entry_type, amount)
    VALUES (p_transaction_id, v_reserve_account_id, 'credit', v_withheld);
    
    -- Update remaining
    v_remaining := v_remaining - v_withheld;
    
    -- Return this rule's result
    rule_id := v_rule.id;
    rule_type := v_rule.rule_type;
    withheld_amount := v_withheld;
    remaining_creator_amount := v_remaining;
    RETURN NEXT;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- RELEASE HELD FUNDS
-- ============================================================================

CREATE OR REPLACE FUNCTION release_held_funds(
  p_held_fund_id UUID,
  p_release_reason TEXT DEFAULT 'Manual release'
)
RETURNS JSONB AS $$
DECLARE
  v_held RECORD;
  v_release_tx_id UUID;
  v_reserve_account_id UUID;
  v_creator_account_id UUID;
BEGIN
  -- Get held fund
  SELECT * INTO v_held FROM held_funds WHERE id = p_held_fund_id;
  
  IF v_held IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Held fund not found');
  END IF;
  
  IF v_held.status = 'released' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already released');
  END IF;
  
  -- Get accounts
  SELECT id INTO v_creator_account_id
  FROM accounts
  WHERE ledger_id = v_held.ledger_id
    AND account_type = 'creator_balance'
    AND entity_id = v_held.creator_id;
  
  SELECT get_or_create_reserve_account(
    v_held.ledger_id,
    (SELECT rule_type FROM withholding_rules WHERE id = v_held.withholding_rule_id)
  ) INTO v_reserve_account_id;
  
  -- Create release transaction
  INSERT INTO transactions (
    ledger_id,
    transaction_type,
    description,
    amount,
    status,
    metadata
  ) VALUES (
    v_held.ledger_id,
    'transfer',
    'Release held funds: ' || p_release_reason,
    v_held.held_amount - v_held.released_amount,
    'completed',
    jsonb_build_object(
      'held_fund_id', p_held_fund_id,
      'creator_id', v_held.creator_id,
      'release_reason', p_release_reason
    )
  )
  RETURNING id INTO v_release_tx_id;
  
  -- Create entries: Reserve → Creator Balance
  -- DEBIT reserve (reduce reserve liability)
  INSERT INTO entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_release_tx_id, v_reserve_account_id, 'debit', v_held.held_amount - v_held.released_amount);
  
  -- CREDIT creator (increase creator balance)
  INSERT INTO entries (transaction_id, account_id, entry_type, amount)
  VALUES (v_release_tx_id, v_creator_account_id, 'credit', v_held.held_amount - v_held.released_amount);
  
  -- Update held fund record
  UPDATE held_funds
  SET status = 'released',
      released_amount = held_amount,
      released_at = NOW(),
      release_transaction_id = v_release_tx_id,
      release_reason = p_release_reason,
      updated_at = NOW()
  WHERE id = p_held_fund_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'released_amount', v_held.held_amount - v_held.released_amount,
    'release_transaction_id', v_release_tx_id
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- AUTO-RELEASE JOB (call periodically)
-- ============================================================================

CREATE OR REPLACE FUNCTION process_automatic_releases(p_ledger_id UUID DEFAULT NULL)
RETURNS TABLE (
  held_fund_id UUID,
  creator_id TEXT,
  amount NUMERIC(14,2),
  success BOOLEAN
) AS $$
DECLARE
  v_held RECORD;
  v_result JSONB;
BEGIN
  FOR v_held IN
    SELECT hf.* 
    FROM held_funds hf
    JOIN withholding_rules wr ON hf.withholding_rule_id = wr.id
    WHERE hf.status = 'held'
      AND hf.release_eligible_at <= NOW()
      AND wr.release_trigger = 'automatic'
      AND (p_ledger_id IS NULL OR hf.ledger_id = p_ledger_id)
    ORDER BY hf.release_eligible_at ASC
  LOOP
    v_result := release_held_funds(v_held.id, 'Automatic release - hold period expired');
    
    held_fund_id := v_held.id;
    creator_id := v_held.creator_id;
    amount := v_held.held_amount;
    success := (v_result->>'success')::boolean;
    RETURN NEXT;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- HELD FUNDS SUMMARY VIEW
-- ============================================================================

CREATE OR REPLACE VIEW held_funds_summary AS
SELECT 
  hf.ledger_id,
  hf.creator_id,
  wr.rule_type,
  wr.name as rule_name,
  COUNT(*) as hold_count,
  SUM(hf.held_amount) as total_held,
  SUM(hf.released_amount) as total_released,
  SUM(hf.held_amount - hf.released_amount) as currently_held,
  MIN(hf.release_eligible_at) FILTER (WHERE hf.status = 'held') as next_release_date
FROM held_funds hf
JOIN withholding_rules wr ON hf.withholding_rule_id = wr.id
GROUP BY hf.ledger_id, hf.creator_id, wr.rule_type, wr.name;

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE withholding_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE held_funds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ledger isolation" ON withholding_rules;
CREATE POLICY "Ledger isolation" ON withholding_rules
  FOR ALL USING (ledger_id = current_setting('app.current_ledger_id', true)::uuid);

DROP POLICY IF EXISTS "Ledger isolation" ON held_funds;
CREATE POLICY "Ledger isolation" ON held_funds
  FOR ALL USING (ledger_id = current_setting('app.current_ledger_id', true)::uuid);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_withholding_rules_updated ON withholding_rules;
CREATE TRIGGER trigger_withholding_rules_updated
  BEFORE UPDATE ON withholding_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_held_funds_updated ON held_funds;
CREATE TRIGGER trigger_held_funds_updated
  BEFORE UPDATE ON held_funds
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
