-- Create processor_transactions table and restore health check 6.
--
-- This table is actively used by:
--   - process-processor-inbox/index.ts (upsert on every processor event)
--   - ops-monitor/index.ts (failed transaction count in last 24h)
--   - run_ledger_health_check (check 6: unmatched processor transactions)
--
-- processor_balance_snapshots is NOT created — no application code uses it.
-- Health check 4 remains skipped.

BEGIN;

-- ============================================================
-- Create the processor_transactions table
-- Schema derived from process-processor-inbox upsert fields
-- ============================================================

CREATE TABLE IF NOT EXISTS public.processor_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ledger_id uuid NOT NULL REFERENCES public.ledgers(id) ON DELETE CASCADE,
  processor_id text NOT NULL,
  processor_type text NOT NULL, -- @planned multi-processor support
  amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending',
  description text,
  match_status text NOT NULL DEFAULT 'unmatched',
  matched_transaction_id uuid REFERENCES public.transactions(id),
  raw_data jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Unique on processor_id to support upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_processor_transactions_processor_id
  ON public.processor_transactions(processor_id);

CREATE INDEX IF NOT EXISTS idx_processor_transactions_ledger
  ON public.processor_transactions(ledger_id);

CREATE INDEX IF NOT EXISTS idx_processor_transactions_status
  ON public.processor_transactions(status);

CREATE INDEX IF NOT EXISTS idx_processor_transactions_match_status
  ON public.processor_transactions(ledger_id, match_status)
  WHERE match_status = 'unmatched';

-- RLS: ledger isolation
ALTER TABLE public.processor_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ledger isolation" ON public.processor_transactions
  AS PERMISSIVE FOR ALL TO public
  USING (ledger_id = (current_setting('app.current_ledger_id', true))::uuid);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.processor_transactions TO service_role;
GRANT SELECT ON public.processor_transactions TO authenticated;

-- ============================================================
-- Update health check 6 to query the real table
-- ============================================================

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
  -- CHECK 4: Cash vs Processor Balance (skipped — no snapshots table)
  -- processor_balance_snapshots is not used by any application code.
  -- This check can be enabled when processor balance polling is implemented.
  -- =========================================================================
  v_check := jsonb_build_object(
    'name', 'cash_processor_balance',
    'description', 'Cash balance vs processor balance',
    'status', 'skipped',
    'details', jsonb_build_object('reason', 'processor balance polling not yet implemented')
  );
  v_checks := v_checks || v_check;

  -- =========================================================================
  -- CHECK 5: Unmatched Bank Transactions
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
  -- CHECK 6: Unmatched Processor Transactions
  -- =========================================================================
  SELECT jsonb_build_object(
    'name', 'processor_reconciliation_backlog',
    'description', 'Processor transactions awaiting review',
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
