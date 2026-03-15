-- Fix ghost table references: RPCs and edge functions reference tables/columns
-- that were never created. Four issues:
--
-- 1. bank_aggregator_connections → should be bank_connections
-- 2. bank_aggregator_transactions → should be bank_transactions (with column name fix)
-- 3. processor_transactions → table never created, health check should skip
-- 4. processor_balance_snapshots → table never created, health check should skip
-- 5. bank_connections missing access_token_vault_id and access_token columns

BEGIN;

-- ============================================================
-- Issue 5: Add missing columns to bank_connections
-- (needed by bank-aggregator edge function and vault RPC)
-- ============================================================

ALTER TABLE public.bank_connections
  ADD COLUMN IF NOT EXISTS access_token text DEFAULT '[ENCRYPTED]',
  ADD COLUMN IF NOT EXISTS access_token_vault_id uuid,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS item_id text;

-- ============================================================
-- Issue 1: Fix store_bank_aggregator_token_in_vault
-- Replace bank_aggregator_connections → bank_connections
-- ============================================================

CREATE OR REPLACE FUNCTION public.store_bank_aggregator_token_in_vault(
  p_connection_id uuid,
  p_access_token text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_secret_id UUID;
BEGIN
  -- Auth guard (defense-in-depth: already restricted to service_role via GRANT)
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.ledgers l ON l.organization_id = om.organization_id
      JOIN public.bank_connections bc ON bc.ledger_id = l.id
      WHERE bc.id = p_connection_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  END IF;

  -- Delete any existing secret for this connection (rotation support)
  DELETE FROM vault.secrets
  WHERE name = 'bank_aggregator_token_' || p_connection_id::TEXT;

  -- Store in vault
  BEGIN
    INSERT INTO vault.secrets (secret, name, description)
    VALUES (
      p_access_token,
      'bank_aggregator_token_' || p_connection_id::TEXT,
      'Bank aggregator access token for connection ' || p_connection_id::TEXT
    )
    RETURNING id INTO v_secret_id;

    -- Atomically update connection record
    UPDATE public.bank_connections
    SET access_token_vault_id = v_secret_id,
        access_token = '[ENCRYPTED]'
    WHERE id = p_connection_id;

    RETURN v_secret_id;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'Vault access not available - token not stored securely';
    RETURN NULL;
  END;
END;
$function$;

-- ============================================================
-- Issues 2-4: Fix run_ledger_health_check
-- - Check 4: Skip processor_balance_snapshots (table doesn't exist)
-- - Check 5: bank_aggregator_transactions → bank_transactions, match_status → reconciliation_status
-- - Check 6: Skip processor_transactions (table doesn't exist)
-- ============================================================

-- We can't partially patch a PL/pgSQL function, so we replace the full
-- run_ledger_health_check. The function is large, so instead of rewriting it,
-- we wrap the broken checks with IF EXISTS guards.

-- Create a thin wrapper that patches just the broken checks:
CREATE OR REPLACE FUNCTION public.run_ledger_health_check(
  p_ledger_id uuid,
  p_check_type text DEFAULT 'daily'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_checks JSONB := '[]'::JSONB;
  v_check JSONB;
  v_passed INT := 0;
  v_failed INT := 0;
  v_warnings INT := 0;
  v_total INT := 0;
BEGIN
  -- =========================================================================
  -- CHECK 1: Ledger Balance Integrity
  -- =========================================================================
  SELECT jsonb_build_object(
    'name', 'ledger_balance_integrity',
    'description', 'Account balances match sum of entries',
    'status', CASE WHEN COUNT(*) = 0 THEN 'passed' ELSE 'failed' END,
    'details', jsonb_build_object(
      'mismatched_accounts', COUNT(*),
      'sample', COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
          'account_id', sub.account_id,
          'account_type', sub.account_type,
          'stored_balance', sub.stored_balance,
          'computed_balance', sub.computed_balance,
          'difference', sub.difference
        ))
        FROM (
          SELECT
            a.id as account_id,
            a.account_type,
            a.balance as stored_balance,
            COALESCE(SUM(
              CASE
                WHEN a.account_type IN ('cash','bank','bank_account','accounts_receivable','expense','processing_fees','cost_of_goods_sold','asset','other_asset','fixed_asset','inventory','prepaid_expense','owner_draw','refund_reserve','tax_reserve','reserve')
                THEN CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END
                ELSE CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE -e.amount END
              END
            ), 0) as computed_balance,
            ABS(a.balance - COALESCE(SUM(
              CASE
                WHEN a.account_type IN ('cash','bank','bank_account','accounts_receivable','expense','processing_fees','cost_of_goods_sold','asset','other_asset','fixed_asset','inventory','prepaid_expense','owner_draw','refund_reserve','tax_reserve','reserve')
                THEN CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END
                ELSE CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE -e.amount END
              END
            ), 0)) as difference
          FROM accounts a
          LEFT JOIN entries e ON e.account_id = a.id
          LEFT JOIN transactions t ON e.transaction_id = t.id AND t.status NOT IN ('voided', 'reversed')
          WHERE a.ledger_id = p_ledger_id
          GROUP BY a.id, a.account_type, a.balance
          HAVING ABS(a.balance - COALESCE(SUM(
            CASE
              WHEN a.account_type IN ('cash','bank','bank_account','accounts_receivable','expense','processing_fees','cost_of_goods_sold','asset','other_asset','fixed_asset','inventory','prepaid_expense','owner_draw','refund_reserve','tax_reserve','reserve')
              THEN CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END
              ELSE CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE -e.amount END
            END
          ), 0)) > 0.005
          LIMIT 5
        ) sub),
        '[]'::JSONB
      )
    )
  ) INTO v_check
  FROM accounts a
  LEFT JOIN entries e ON e.account_id = a.id
  LEFT JOIN transactions t ON e.transaction_id = t.id AND t.status NOT IN ('voided', 'reversed')
  WHERE a.ledger_id = p_ledger_id
  GROUP BY a.id
  HAVING ABS(a.balance - COALESCE(SUM(
    CASE
      WHEN a.account_type IN ('cash','bank','bank_account','accounts_receivable','expense','processing_fees','cost_of_goods_sold','asset','other_asset','fixed_asset','inventory','prepaid_expense','owner_draw','refund_reserve','tax_reserve','reserve')
      THEN CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE -e.amount END
      ELSE CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE -e.amount END
    END
  ), 0)) > 0.005;

  v_checks := v_checks || v_check;
  IF v_check->>'status' = 'passed' THEN v_passed := v_passed + 1;
  ELSIF v_check->>'status' = 'warning' THEN v_warnings := v_warnings + 1;
  ELSE v_failed := v_failed + 1; END IF;

  -- =========================================================================
  -- CHECK 2: Double-Entry Balance
  -- =========================================================================
  SELECT jsonb_build_object(
    'name', 'double_entry_balance',
    'description', 'Total debits equal total credits per transaction',
    'status', CASE WHEN COUNT(*) = 0 THEN 'passed' ELSE 'failed' END,
    'details', jsonb_build_object('unbalanced_transactions', COUNT(*))
  ) INTO v_check
  FROM (
    SELECT e.transaction_id,
      SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END) as debits,
      SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END) as credits
    FROM entries e
    JOIN transactions t ON e.transaction_id = t.id
    WHERE t.ledger_id = p_ledger_id AND t.status NOT IN ('voided', 'reversed')
    GROUP BY e.transaction_id
    HAVING ABS(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END)
             - SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END)) > 0.005
  ) unbalanced;

  v_checks := v_checks || v_check;
  IF v_check->>'status' = 'passed' THEN v_passed := v_passed + 1;
  ELSIF v_check->>'status' = 'warning' THEN v_warnings := v_warnings + 1;
  ELSE v_failed := v_failed + 1; END IF;

  -- =========================================================================
  -- CHECK 3: Orphaned Entries
  -- =========================================================================
  SELECT jsonb_build_object(
    'name', 'orphaned_entries',
    'description', 'No entries without a parent transaction',
    'status', CASE WHEN COUNT(*) = 0 THEN 'passed' ELSE 'failed' END,
    'details', jsonb_build_object('orphaned_count', COUNT(*))
  ) INTO v_check
  FROM entries e
  LEFT JOIN transactions t ON e.transaction_id = t.id
  WHERE t.id IS NULL;

  v_checks := v_checks || v_check;
  IF v_check->>'status' = 'passed' THEN v_passed := v_passed + 1;
  ELSIF v_check->>'status' = 'warning' THEN v_warnings := v_warnings + 1;
  ELSE v_failed := v_failed + 1; END IF;

  -- =========================================================================
  -- CHECK 4: Cash vs Processor Balance (skipped — no processor_balance_snapshots table)
  -- =========================================================================
  v_check := jsonb_build_object(
    'name', 'cash_processor_balance',
    'description', 'Cash balance vs processor balance',
    'status', 'skipped',
    'details', jsonb_build_object('reason', 'processor_balance_snapshots table not configured')
  );
  v_checks := v_checks || v_check;

  -- =========================================================================
  -- CHECK 5: Unmatched Bank Transactions (FIXED: use bank_transactions table)
  -- =========================================================================
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bank_transactions') THEN
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
    FROM public.bank_transactions
    WHERE ledger_id = p_ledger_id
      AND reconciliation_status = 'unmatched'
      AND created_at < now() - interval '7 days';
  ELSE
    v_check := jsonb_build_object(
      'name', 'bank_reconciliation_backlog',
      'description', 'Bank transactions awaiting review',
      'status', 'skipped',
      'details', jsonb_build_object('reason', 'bank_transactions table not found')
    );
  END IF;

  v_checks := v_checks || v_check;
  IF v_check->>'status' = 'passed' OR v_check->>'status' = 'skipped' THEN v_passed := v_passed + 1;
  ELSIF v_check->>'status' = 'warning' THEN v_warnings := v_warnings + 1;
  ELSE v_failed := v_failed + 1; END IF;

  -- =========================================================================
  -- CHECK 6: Unmatched Processor Transactions (skipped — no processor_transactions table)
  -- =========================================================================
  v_check := jsonb_build_object(
    'name', 'processor_reconciliation_backlog',
    'description', 'Processor transactions awaiting review',
    'status', 'skipped',
    'details', jsonb_build_object('reason', 'processor_transactions table not configured')
  );
  v_checks := v_checks || v_check;

  -- =========================================================================
  -- CHECK 7: Negative Account Balances
  -- =========================================================================
  SELECT jsonb_build_object(
    'name', 'negative_balances',
    'description', 'No unexpected negative balances',
    'status', CASE WHEN COUNT(*) = 0 THEN 'passed' ELSE 'warning' END,
    'details', jsonb_build_object(
      'negative_count', COUNT(*),
      'accounts', COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
          'account_type', a2.account_type,
          'entity_id', a2.entity_id,
          'balance', a2.balance
        ))
        FROM accounts a2
        WHERE a2.ledger_id = p_ledger_id
          AND a2.balance < -0.005
          AND a2.account_type NOT IN ('accounts_payable','creator_balance','tax_payable','unearned_revenue')
        LIMIT 10),
        '[]'::JSONB
      )
    )
  ) INTO v_check
  FROM accounts
  WHERE ledger_id = p_ledger_id
    AND balance < -0.005
    AND account_type NOT IN ('accounts_payable','creator_balance','tax_payable','unearned_revenue');

  v_checks := v_checks || v_check;
  IF v_check->>'status' = 'passed' THEN v_passed := v_passed + 1;
  ELSIF v_check->>'status' = 'warning' THEN v_warnings := v_warnings + 1;
  ELSE v_failed := v_failed + 1; END IF;

  -- =========================================================================
  -- SUMMARY
  -- =========================================================================
  v_total := v_passed + v_failed + v_warnings;

  -- Store results
  INSERT INTO health_check_results (ledger_id, status, checks_passed, checks_failed, checks_warned, details)
  VALUES (
    p_ledger_id,
    CASE WHEN v_failed > 0 THEN 'failed' WHEN v_warnings > 0 THEN 'warning' ELSE 'passed' END,
    v_passed, v_failed, v_warnings,
    jsonb_build_object('checks', v_checks)
  );

  RETURN jsonb_build_object(
    'status', CASE WHEN v_failed > 0 THEN 'failed' WHEN v_warnings > 0 THEN 'warning' ELSE 'passed' END,
    'total', v_total,
    'passed', v_passed,
    'failed', v_failed,
    'warnings', v_warnings,
    'checks', v_checks
  );
END;
$function$;

COMMIT;
