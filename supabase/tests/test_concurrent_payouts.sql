-- Concurrent payout invariant test
-- Tests that process_payout_atomic correctly prevents double-payouts
-- and maintains non-negative balances under concurrent-like conditions.
--
-- Run via: SELECT * FROM test_concurrent_payouts();
-- Note: True multi-session concurrency can't be tested in a single SQL
-- transaction. This test verifies the sequential invariants; the FOR UPDATE
-- lock guarantees these hold under concurrency too.

CREATE OR REPLACE FUNCTION test_concurrent_payouts()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_test_ledger_id UUID;
  v_test_org_id UUID;
  v_test_owner_id UUID;
  v_creator_account_id UUID;
  v_cash_account_id UUID;
  v_result1 JSONB;
  v_result2 JSONB;
  v_result3 JSONB;
  v_dup_result JSONB;
  v_balance_check JSONB;
  v_final_balance NUMERIC(14,2);
  v_assertions JSONB := '[]'::jsonb;
  v_all_passed BOOLEAN := true;
BEGIN
  -- =========================================================================
  -- SETUP: Create a test ledger with a known creator balance of $100.00
  -- =========================================================================

  -- Create a minimal test user to satisfy owner_id FK
  v_test_owner_id := gen_random_uuid();
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token)
  VALUES (v_test_owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          '__test_concurrent_' || v_test_owner_id::text || '@test.local', '', NOW(), NOW(), NOW(), '', '');

  -- Create test org
  INSERT INTO organizations (name, slug, owner_id, plan, status, max_ledgers, current_ledger_count, max_team_members, current_member_count)
  VALUES ('__test_concurrent_org__', '__test_concurrent_slug_' || gen_random_uuid()::text, v_test_owner_id, 'trial', 'active', 10, 0, 5, 1)
  RETURNING id INTO v_test_org_id;

  -- Create test ledger
  INSERT INTO ledgers (organization_id, business_name, api_key_hash, ledger_group_id, livemode, status)
  VALUES (v_test_org_id, '__test_concurrent_ledger__', encode(gen_random_bytes(32), 'hex'), gen_random_uuid(), false, 'active')
  RETURNING id INTO v_test_ledger_id;

  -- Create accounts
  INSERT INTO accounts (ledger_id, account_type, entity_id, entity_type, name)
  VALUES (v_test_ledger_id, 'creator_balance', '__test_creator__', 'creator', 'Test Creator')
  RETURNING id INTO v_creator_account_id;

  INSERT INTO accounts (ledger_id, account_type, entity_type, name)
  VALUES (v_test_ledger_id, 'cash', 'platform', 'Cash')
  RETURNING id INTO v_cash_account_id;

  -- Seed $100.00 balance via a sale transaction + entries
  DECLARE
    v_seed_tx_id UUID;
  BEGIN
    INSERT INTO transactions (ledger_id, transaction_type, reference_id, amount, currency, status, metadata)
    VALUES (v_test_ledger_id, 'sale', '__test_seed_sale__', 100.00, 'USD', 'completed',
            '{"creator_id": "__test_creator__"}'::jsonb)
    RETURNING id INTO v_seed_tx_id;

    INSERT INTO entries (transaction_id, account_id, entry_type, amount) VALUES
      (v_seed_tx_id, v_cash_account_id, 'debit', 100.00),
      (v_seed_tx_id, v_creator_account_id, 'credit', 100.00);
  END;

  -- =========================================================================
  -- TEST 1: First payout of $60 should succeed
  -- =========================================================================
  v_result1 := process_payout_atomic(
    v_test_ledger_id, '__test_payout_1__', '__test_creator__',
    6000, 0, 'platform', NULL, 'Test payout 1', 'test'
  );

  IF v_result1->>'status' = 'created' THEN
    v_assertions := v_assertions || jsonb_build_object(
      'test', 'payout_1_succeeds', 'passed', true,
      'detail', 'First $60 payout created successfully'
    );
  ELSE
    v_all_passed := false;
    v_assertions := v_assertions || jsonb_build_object(
      'test', 'payout_1_succeeds', 'passed', false,
      'detail', 'Expected created, got: ' || (v_result1->>'status')
    );
  END IF;

  -- =========================================================================
  -- TEST 2: Second payout of $60 should fail (only $40 remaining)
  -- =========================================================================
  v_result2 := process_payout_atomic(
    v_test_ledger_id, '__test_payout_2__', '__test_creator__',
    6000, 0, 'platform', NULL, 'Test payout 2', 'test'
  );

  IF v_result2->>'status' = 'insufficient_balance' THEN
    v_assertions := v_assertions || jsonb_build_object(
      'test', 'payout_2_blocked', 'passed', true,
      'detail', 'Second $60 payout correctly rejected (insufficient balance)',
      'available', v_result2->'available'
    );
  ELSE
    v_all_passed := false;
    v_assertions := v_assertions || jsonb_build_object(
      'test', 'payout_2_blocked', 'passed', false,
      'detail', 'Expected insufficient_balance, got: ' || (v_result2->>'status')
    );
  END IF;

  -- =========================================================================
  -- TEST 3: Payout of remaining $40 should succeed
  -- =========================================================================
  v_result3 := process_payout_atomic(
    v_test_ledger_id, '__test_payout_3__', '__test_creator__',
    4000, 0, 'platform', NULL, 'Test payout 3', 'test'
  );

  IF v_result3->>'status' = 'created' AND (v_result3->>'new_balance')::numeric = 0 THEN
    v_assertions := v_assertions || jsonb_build_object(
      'test', 'payout_3_drains_balance', 'passed', true,
      'detail', 'Third $40 payout succeeded, balance is now $0.00'
    );
  ELSE
    v_all_passed := false;
    v_assertions := v_assertions || jsonb_build_object(
      'test', 'payout_3_drains_balance', 'passed', false,
      'detail', 'Expected created with balance 0, got: ' || (v_result3->>'status') || ' balance: ' || COALESCE(v_result3->>'new_balance', 'null')
    );
  END IF;

  -- =========================================================================
  -- TEST 4: Duplicate reference_id returns idempotent result
  -- =========================================================================
  v_dup_result := process_payout_atomic(
    v_test_ledger_id, '__test_payout_1__', '__test_creator__',
    6000, 0, 'platform', NULL, 'Duplicate attempt', 'test'
  );

  IF v_dup_result->>'status' = 'duplicate' AND v_dup_result->>'transaction_id' = v_result1->>'transaction_id' THEN
    v_assertions := v_assertions || jsonb_build_object(
      'test', 'duplicate_idempotent', 'passed', true,
      'detail', 'Duplicate reference_id returned original transaction_id'
    );
  ELSE
    v_all_passed := false;
    v_assertions := v_assertions || jsonb_build_object(
      'test', 'duplicate_idempotent', 'passed', false,
      'detail', 'Expected duplicate with matching tx_id, got: ' || (v_dup_result->>'status')
    );
  END IF;

  -- =========================================================================
  -- TEST 5: Balance invariant holds (no negative balances)
  -- =========================================================================
  v_balance_check := check_balance_invariants(v_test_ledger_id);

  IF v_balance_check->>'status' = 'pass' THEN
    v_assertions := v_assertions || jsonb_build_object(
      'test', 'no_negative_balances', 'passed', true,
      'detail', 'Balance invariant holds: no negative balances'
    );
  ELSE
    v_all_passed := false;
    v_assertions := v_assertions || jsonb_build_object(
      'test', 'no_negative_balances', 'passed', false,
      'detail', v_balance_check->'details'
    );
  END IF;

  -- =========================================================================
  -- TEST 6: Verify final computed balance equals $0
  -- =========================================================================
  SELECT COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0)
    INTO v_final_balance
    FROM entries e
    JOIN transactions t ON t.id = e.transaction_id
   WHERE e.account_id = v_creator_account_id
     AND t.status NOT IN ('voided', 'reversed');

  IF v_final_balance = 0 THEN
    v_assertions := v_assertions || jsonb_build_object(
      'test', 'final_balance_zero', 'passed', true,
      'detail', 'Creator balance is exactly $0.00 after all payouts'
    );
  ELSE
    v_all_passed := false;
    v_assertions := v_assertions || jsonb_build_object(
      'test', 'final_balance_zero', 'passed', false,
      'detail', 'Expected $0.00, got: $' || v_final_balance::text
    );
  END IF;

  -- =========================================================================
  -- CLEANUP: Remove all test data
  -- =========================================================================
  DELETE FROM entries WHERE transaction_id IN (
    SELECT id FROM transactions WHERE ledger_id = v_test_ledger_id
  );
  DELETE FROM transactions WHERE ledger_id = v_test_ledger_id;
  DELETE FROM accounts WHERE ledger_id = v_test_ledger_id;
  DELETE FROM ledgers WHERE id = v_test_ledger_id;
  DELETE FROM organizations WHERE id = v_test_org_id;
  DELETE FROM auth.users WHERE id = v_test_owner_id;

  -- =========================================================================
  -- RESULT
  -- =========================================================================
  RETURN jsonb_build_object(
    'status', CASE WHEN v_all_passed THEN 'pass' ELSE 'fail' END,
    'tests_run', jsonb_array_length(v_assertions),
    'tests_passed', (SELECT COUNT(*) FROM jsonb_array_elements(v_assertions) AS elem WHERE (elem->>'passed')::boolean = true),
    'assertions', v_assertions
  );
END;
$$;
