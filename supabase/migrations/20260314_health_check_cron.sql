-- ============================================================================
-- Health Check Daily Cron
-- Re-declares run_ledger_health_check with p_check_type parameter, restoring
-- the full 10-check body (20260310 regressed to Check 1 only), preserving
-- the auth guard and hardened search_path from 20260310.
-- Also re-declares the 1-param overload to forward to the 2-param version.
-- Schedules daily run at 05:00 UTC.
-- ============================================================================

-- ============================================================================
-- CORE HEALTH CHECK FUNCTION (2-param: full 10-check body + auth guard)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.run_ledger_health_check(p_ledger_id UUID, p_check_type TEXT DEFAULT 'manual')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_checks jsonb := '[]'::jsonb;
  v_check jsonb;
  v_passed integer := 0;
  v_warnings integer := 0;
  v_failed integer := 0;
  v_status text;
  v_result_id uuid;
BEGIN
  -- Auth guard (from 20260310_rpc_tenant_isolation)
  -- Allow service_role, postgres, and supabase_admin (cron runs as postgres)
  IF auth.role() <> 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
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

  -- =========================================================================
  -- CHECK 1: Ledger Balance (Debits = Credits)
  -- =========================================================================
  SELECT jsonb_build_object(
    'name', 'ledger_balance',
    'description', 'Total debits equal total credits',
    'status', CASE
      WHEN ABS(COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0) -
               COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0)) < 0.01
      THEN 'passed' ELSE 'failed' END,
    'details', jsonb_build_object(
      'total_debits', COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0),
      'total_credits', COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0),
      'difference', ABS(COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0) -
                        COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0))
    )
  ) INTO v_check
  FROM public.entries e
  JOIN public.transactions t ON e.transaction_id = t.id
  WHERE t.ledger_id = p_ledger_id
    AND t.status NOT IN ('voided', 'reversed');

  v_checks := v_checks || v_check;
  IF v_check->>'status' = 'passed' THEN v_passed := v_passed + 1;
  ELSIF v_check->>'status' = 'warning' THEN v_warnings := v_warnings + 1;
  ELSE v_failed := v_failed + 1; END IF;

  -- =========================================================================
  -- CHECK 2: Orphaned Entries (entries without valid transaction)
  -- =========================================================================
  SELECT jsonb_build_object(
    'name', 'orphaned_entries',
    'description', 'No entries without valid transactions',
    'status', CASE WHEN COUNT(*) = 0 THEN 'passed' ELSE 'failed' END,
    'details', jsonb_build_object(
      'orphaned_count', COUNT(*),
      'sample_ids', COALESCE(jsonb_agg(e.id) FILTER (WHERE e.id IS NOT NULL), '[]'::jsonb)
    )
  ) INTO v_check
  FROM public.entries e
  LEFT JOIN public.transactions t ON e.transaction_id = t.id
  WHERE t.id IS NULL
    OR t.ledger_id != p_ledger_id;

  v_checks := v_checks || v_check;
  IF v_check->>'status' = 'passed' THEN v_passed := v_passed + 1;
  ELSIF v_check->>'status' = 'warning' THEN v_warnings := v_warnings + 1;
  ELSE v_failed := v_failed + 1; END IF;

  -- =========================================================================
  -- CHECK 3: Unbalanced Transactions (each txn debits = credits)
  -- =========================================================================
  SELECT jsonb_build_object(
    'name', 'transaction_balance',
    'description', 'Each transaction balances (debits = credits)',
    'status', CASE WHEN COUNT(*) = 0 THEN 'passed' ELSE 'failed' END,
    'details', jsonb_build_object(
      'unbalanced_count', COUNT(*),
      'unbalanced_ids', COALESCE(jsonb_agg(transaction_id), '[]'::jsonb)
    )
  ) INTO v_check
  FROM (
    SELECT
      e.transaction_id,
      ABS(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END) -
          SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END)) as diff
    FROM public.entries e
    JOIN public.transactions t ON e.transaction_id = t.id
    WHERE t.ledger_id = p_ledger_id
      AND t.status NOT IN ('voided', 'reversed')
    GROUP BY e.transaction_id
    HAVING ABS(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END) -
               SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END)) > 0.01
  ) unbalanced;

  v_checks := v_checks || v_check;
  IF v_check->>'status' = 'passed' THEN v_passed := v_passed + 1;
  ELSIF v_check->>'status' = 'warning' THEN v_warnings := v_warnings + 1;
  ELSE v_failed := v_failed + 1; END IF;

  -- =========================================================================
  -- CHECK 4: Cash Account vs processor Balance
  -- =========================================================================
  SELECT jsonb_build_object(
    'name', 'processor_balance_sync',
    'description', 'Cash account approximates processor available balance',
    'status', CASE
      WHEN bs.id IS NULL THEN 'skipped'
      WHEN ABS(cash_balance - processor_available) < 100 THEN 'passed'
      WHEN ABS(cash_balance - processor_available) < 1000 THEN 'warning'
      ELSE 'failed'
    END,
    'details', jsonb_build_object(
      'cash_account_balance', cash_balance,
      'processor_available_balance', processor_available,
      'difference', ABS(cash_balance - COALESCE(processor_available, 0)),
      'last_processor_sync', bs.snapshot_at
    )
  ) INTO v_check
  FROM (
    SELECT COALESCE(SUM(
      CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END
    ), 0) as cash_balance
    FROM public.entries e
    JOIN public.transactions t ON e.transaction_id = t.id
    JOIN public.accounts a ON e.account_id = a.id
    WHERE t.ledger_id = p_ledger_id
      AND t.status NOT IN ('voided', 'reversed')
      AND a.account_type = 'cash'
  ) cb
  LEFT JOIN LATERAL (
    SELECT
      id,
      snapshot_at,
      (available->0->>'amount')::numeric / 100 as processor_available
    FROM public.processor_balance_snapshots
    WHERE ledger_id = p_ledger_id
    ORDER BY snapshot_at DESC
    LIMIT 1
  ) bs ON true;

  v_checks := v_checks || v_check;
  IF v_check->>'status' = 'passed' OR v_check->>'status' = 'skipped' THEN v_passed := v_passed + 1;
  ELSIF v_check->>'status' = 'warning' THEN v_warnings := v_warnings + 1;
  ELSE v_failed := v_failed + 1; END IF;

  -- =========================================================================
  -- CHECK 5: Unmatched Bank Transactions (stale review queue)
  -- =========================================================================
  SELECT jsonb_build_object(
    'name', 'bank_reconciliation_backlog',
    'description', 'Bank transactions awaiting review',
    'status', CASE
      WHEN COUNT(*) = 0 THEN 'passed'
      WHEN COUNT(*) < 10 THEN 'warning'
      ELSE 'failed'
    END,
    'details', jsonb_build_object(
      'unmatched_count', COUNT(*),
      'oldest_unmatched', MIN(created_at),
      'total_unmatched_amount', COALESCE(SUM(ABS(amount)), 0)
    )
  ) INTO v_check
  FROM public.bank_aggregator_transactions
  WHERE ledger_id = p_ledger_id
    AND match_status = 'unmatched'
    AND created_at < now() - interval '7 days';

  v_checks := v_checks || v_check;
  IF v_check->>'status' = 'passed' THEN v_passed := v_passed + 1;
  ELSIF v_check->>'status' = 'warning' THEN v_warnings := v_warnings + 1;
  ELSE v_failed := v_failed + 1; END IF;

  -- =========================================================================
  -- CHECK 6: Unmatched processor Transactions
  -- =========================================================================
  SELECT jsonb_build_object(
    'name', 'processor_reconciliation_backlog',
    'description', 'processor transactions awaiting review',
    'status', CASE
      WHEN COUNT(*) = 0 THEN 'passed'
      WHEN COUNT(*) < 5 THEN 'warning'
      ELSE 'failed'
    END,
    'details', jsonb_build_object(
      'unmatched_count', COUNT(*),
      'oldest_unmatched', MIN(created_at),
      'total_unmatched_amount', COALESCE(SUM(ABS(amount)), 0)
    )
  ) INTO v_check
  FROM public.processor_transactions
  WHERE ledger_id = p_ledger_id
    AND match_status = 'unmatched'
    AND created_at < now() - interval '3 days';

  v_checks := v_checks || v_check;
  IF v_check->>'status' = 'passed' THEN v_passed := v_passed + 1;
  ELSIF v_check->>'status' = 'warning' THEN v_warnings := v_warnings + 1;
  ELSE v_failed := v_failed + 1; END IF;

  -- =========================================================================
  -- CHECK 7: Negative Account Balances (except liabilities)
  -- =========================================================================
  SELECT jsonb_build_object(
    'name', 'negative_balances',
    'description', 'No unexpected negative balances',
    'status', CASE WHEN COUNT(*) = 0 THEN 'passed' ELSE 'warning' END,
    'details', jsonb_build_object(
      'accounts_with_negative', COUNT(*),
      'accounts', COALESCE(jsonb_agg(jsonb_build_object(
        'account_id', account_id,
        'account_type', account_type,
        'balance', balance
      )), '[]'::jsonb)
    )
  ) INTO v_check
  FROM (
    SELECT
      a.id as account_id,
      a.account_type,
      SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END) as balance
    FROM public.accounts a
    LEFT JOIN public.entries e ON e.account_id = a.id
    LEFT JOIN public.transactions t ON e.transaction_id = t.id AND t.status NOT IN ('voided', 'reversed')
    WHERE a.ledger_id = p_ledger_id
      AND a.account_type NOT IN ('creator_balance', 'payable', 'liability')
    GROUP BY a.id, a.account_type
    HAVING SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END) < -0.01
  ) neg;

  v_checks := v_checks || v_check;
  IF v_check->>'status' = 'passed' THEN v_passed := v_passed + 1;
  ELSIF v_check->>'status' = 'warning' THEN v_warnings := v_warnings + 1;
  ELSE v_failed := v_failed + 1; END IF;

  -- =========================================================================
  -- CHECK 8: Failed Webhook Deliveries
  -- =========================================================================
  SELECT jsonb_build_object(
    'name', 'webhook_delivery_health',
    'description', 'Webhook deliveries succeeding',
    'status', CASE
      WHEN failed_count = 0 THEN 'passed'
      WHEN failed_count < 5 THEN 'warning'
      ELSE 'failed'
    END,
    'details', jsonb_build_object(
      'failed_last_24h', failed_count,
      'success_rate', CASE WHEN total_count > 0
        THEN ROUND((1 - failed_count::numeric / total_count) * 100, 1)
        ELSE 100 END
    )
  ) INTO v_check
  FROM (
    SELECT
      COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
      COUNT(*) as total_count
    FROM public.webhook_deliveries
    WHERE ledger_id = p_ledger_id
      AND created_at > now() - interval '24 hours'
  ) wd;

  v_checks := v_checks || v_check;
  IF v_check->>'status' = 'passed' THEN v_passed := v_passed + 1;
  ELSIF v_check->>'status' = 'warning' THEN v_warnings := v_warnings + 1;
  ELSE v_failed := v_failed + 1; END IF;

  -- =========================================================================
  -- CHECK 9: Pending Payouts Past Due
  -- =========================================================================
  SELECT jsonb_build_object(
    'name', 'pending_payouts',
    'description', 'No payouts stuck in pending',
    'status', CASE
      WHEN COUNT(*) = 0 THEN 'passed'
      WHEN COUNT(*) < 3 THEN 'warning'
      ELSE 'failed'
    END,
    'details', jsonb_build_object(
      'stuck_count', COUNT(*),
      'oldest_pending', MIN(created_at),
      'total_pending_amount', COALESCE(SUM(amount), 0)
    )
  ) INTO v_check
  FROM public.payouts
  WHERE ledger_id = p_ledger_id
    AND status = 'pending'
    AND created_at < now() - interval '7 days';

  v_checks := v_checks || v_check;
  IF v_check->>'status' = 'passed' THEN v_passed := v_passed + 1;
  ELSIF v_check->>'status' = 'warning' THEN v_warnings := v_warnings + 1;
  ELSE v_failed := v_failed + 1; END IF;

  -- =========================================================================
  -- CHECK 10: Creator Balance Integrity
  -- =========================================================================
  SELECT jsonb_build_object(
    'name', 'creator_balance_integrity',
    'description', 'Creator balances match ledger entries',
    'status', CASE WHEN COUNT(*) = 0 THEN 'passed' ELSE 'failed' END,
    'details', jsonb_build_object(
      'mismatched_creators', COUNT(*),
      'sample_mismatches', COALESCE(jsonb_agg(jsonb_build_object(
        'creator_id', entity_id,
        'ledger_balance', ledger_balance,
        'expected', 'check entries manually'
      )) FILTER (WHERE entity_id IS NOT NULL), '[]'::jsonb)
    )
  ) INTO v_check
  FROM (
    SELECT
      a.entity_id,
      SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE -e.amount END) as ledger_balance
    FROM public.accounts a
    LEFT JOIN public.entries e ON e.account_id = a.id
    LEFT JOIN public.transactions t ON e.transaction_id = t.id AND t.status NOT IN ('voided', 'reversed')
    WHERE a.ledger_id = p_ledger_id
      AND a.account_type = 'creator_balance'
    GROUP BY a.entity_id
    HAVING SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE -e.amount END) < -0.01
  ) cb;

  v_checks := v_checks || v_check;
  IF v_check->>'status' = 'passed' THEN v_passed := v_passed + 1;
  ELSIF v_check->>'status' = 'warning' THEN v_warnings := v_warnings + 1;
  ELSE v_failed := v_failed + 1; END IF;

  -- =========================================================================
  -- DETERMINE OVERALL STATUS
  -- =========================================================================
  IF v_failed > 0 THEN
    v_status := 'critical';
  ELSIF v_warnings > 0 THEN
    v_status := 'warning';
  ELSE
    v_status := 'healthy';
  END IF;

  -- =========================================================================
  -- STORE RESULTS
  -- =========================================================================
  INSERT INTO public.health_check_results (
    ledger_id,
    check_type,
    status,
    checks,
    total_checks,
    passed_checks,
    warning_checks,
    failed_checks
  ) VALUES (
    p_ledger_id,
    p_check_type,
    v_status,
    v_checks,
    v_passed + v_warnings + v_failed,
    v_passed,
    v_warnings,
    v_failed
  ) RETURNING id INTO v_result_id;

  RETURN jsonb_build_object(
    'result_id', v_result_id,
    'status', v_status,
    'summary', jsonb_build_object(
      'total', v_passed + v_warnings + v_failed,
      'passed', v_passed,
      'warnings', v_warnings,
      'failed', v_failed
    ),
    'checks', v_checks
  );
END;
$$;

-- ============================================================================
-- 1-PARAM OVERLOAD: forward to 2-param version (fixes 20260310 Check-1-only regression)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.run_ledger_health_check(p_ledger_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.run_ledger_health_check(p_ledger_id, 'manual'::TEXT);
END;
$$;

-- ============================================================================
-- RUN HEALTH CHECK FOR ALL LEDGERS (with p_check_type forwarding)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.run_all_health_checks(p_check_type TEXT DEFAULT 'daily')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ledger RECORD;
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  FOR v_ledger IN
    SELECT id, business_name
    FROM public.ledgers
    WHERE status = 'active'
  LOOP
    v_result := public.run_ledger_health_check(v_ledger.id, p_check_type);
    v_results := v_results || jsonb_build_object(
      'ledger_id', v_ledger.id,
      'business_name', v_ledger.business_name,
      'result', v_result
    );
  END LOOP;

  RETURN jsonb_build_object(
    'run_at', now(),
    'check_type', p_check_type,
    'ledger_count', jsonb_array_length(v_results),
    'results', v_results
  );
END;
$$;

-- ============================================================================
-- GRANTS (preserve existing access from 20260310)
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.run_ledger_health_check(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_ledger_health_check(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_all_health_checks(TEXT) TO service_role;

-- ============================================================================
-- DAILY CRON: 05:00 UTC (before payouts at 06:00, billing at 07:00)
-- ============================================================================
SELECT cron.schedule(
  'health-checks-daily',
  '0 5 * * *',
  $$SELECT public.run_all_health_checks('daily')$$
);

COMMENT ON FUNCTION public.run_ledger_health_check(UUID, TEXT) IS 'Run all 10 health checks for a single ledger (check_type: manual, daily, alert)';
COMMENT ON FUNCTION public.run_ledger_health_check(UUID) IS 'Run all 10 health checks for a single ledger (forwards to 2-param version)';
COMMENT ON FUNCTION public.run_all_health_checks(TEXT) IS 'Run health checks for all active ledgers (cron or manual)';
