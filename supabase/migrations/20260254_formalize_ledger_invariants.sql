-- Formalize ledger invariants as SQL checks and triggers
-- 1A: CHECK constraint on held_funds.released_amount
-- 1B: Entry immutability on terminal transactions
-- 1C: Double-entry enforcement on DELETE
-- 1D: Negative balance guard on payout entries

-- ============================================================================
-- 1A. CHECK: held_funds.released_amount <= held_amount
-- ============================================================================

-- Safety net: fix any existing bad rows before adding constraint
UPDATE held_funds SET released_amount = held_amount
WHERE released_amount > held_amount;

ALTER TABLE held_funds
  ADD CONSTRAINT chk_released_not_exceeds_held
  CHECK (released_amount <= held_amount);

-- ============================================================================
-- 1B. TRIGGER: Entry immutability on terminal transactions
-- ============================================================================
-- Blocks UPDATE/DELETE on entries when the parent transaction is in a terminal
-- state (completed, voided, reversed). Superusers can bypass by disabling the
-- trigger for emergency fixes.

CREATE OR REPLACE FUNCTION trg_entries_immutability_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tx_status TEXT;
  v_tx_id UUID;
BEGIN
  -- Use OLD for both UPDATE and DELETE
  v_tx_id := OLD.transaction_id;

  SELECT status INTO v_tx_status
  FROM public.transactions
  WHERE id = v_tx_id;

  IF v_tx_status IN ('completed', 'voided', 'reversed') THEN
    RAISE EXCEPTION 'Cannot modify entries for % transaction %',
      v_tx_status, v_tx_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_entries_immutability
  BEFORE UPDATE OR DELETE ON entries
  FOR EACH ROW
  EXECUTE FUNCTION trg_entries_immutability_fn();

-- ============================================================================
-- 1C. CONSTRAINT TRIGGER: Double-entry enforcement on DELETE
-- ============================================================================
-- If some entries remain for a transaction after a delete, they must still
-- balance (debits = credits within 1c tolerance). Complements the existing
-- INSERT-only enforce_double_entry trigger.

CREATE OR REPLACE FUNCTION validate_double_entry_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_remaining INTEGER;
  v_total_debits NUMERIC(14,2);
  v_total_credits NUMERIC(14,2);
BEGIN
  -- Count remaining entries for this transaction
  SELECT
    COUNT(*),
    COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END), 0)
  INTO v_remaining, v_total_debits, v_total_credits
  FROM public.entries
  WHERE transaction_id = OLD.transaction_id;

  -- If no entries remain, the transaction is fully cleaned up — allow it
  IF v_remaining = 0 THEN
    RETURN OLD;
  END IF;

  -- If some entries remain, they must still balance
  IF ABS(v_total_debits - v_total_credits) > 0.01 THEN
    RAISE EXCEPTION 'Delete would leave transaction % unbalanced: debits=%, credits=%',
      OLD.transaction_id, v_total_debits, v_total_credits
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN OLD;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_entries_double_entry_delete
  AFTER DELETE ON entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION validate_double_entry_on_delete();

-- ============================================================================
-- 1D. TRIGGER: Negative balance guard on payout entries
-- ============================================================================
-- Fires BEFORE INSERT on entries. Only activates for debit entries on
-- creator_balance accounts for payout transactions. Computes available
-- balance (ledger balance minus held funds) and raises exception if the
-- debit would make it negative. Early-exits for all other entry types
-- so there is zero overhead on 95%+ of inserts.

CREATE OR REPLACE FUNCTION trg_payout_negative_balance_guard_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_account_type TEXT;
  v_tx_type TEXT;
  v_ledger_balance NUMERIC(14,2);
  v_held_funds NUMERIC(14,2);
  v_available NUMERIC(14,2);
  v_entity_id TEXT;
  v_ledger_id UUID;
BEGIN
  -- Early exit: only guard debit entries
  IF NEW.entry_type != 'debit' THEN
    RETURN NEW;
  END IF;

  -- Look up account type
  SELECT account_type, entity_id, ledger_id
  INTO v_account_type, v_entity_id, v_ledger_id
  FROM public.accounts
  WHERE id = NEW.account_id;

  -- Early exit: only guard creator_balance accounts
  IF v_account_type != 'creator_balance' THEN
    RETURN NEW;
  END IF;

  -- Look up transaction type
  SELECT transaction_type INTO v_tx_type
  FROM public.transactions
  WHERE id = NEW.transaction_id;

  -- Early exit: only guard payout transactions
  IF v_tx_type != 'payout' THEN
    RETURN NEW;
  END IF;

  -- Compute ledger balance (credits - debits) for this account
  -- Exclude voided/reversed transactions
  SELECT
    COALESCE(
      SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END)
      - SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END),
      0
    )
  INTO v_ledger_balance
  FROM public.entries e
  JOIN public.transactions t ON t.id = e.transaction_id
  WHERE e.account_id = NEW.account_id
    AND t.status NOT IN ('voided', 'reversed');

  -- Compute held funds for this creator
  SELECT COALESCE(SUM(held_amount - released_amount), 0)
  INTO v_held_funds
  FROM public.held_funds
  WHERE ledger_id = v_ledger_id
    AND creator_id = v_entity_id
    AND status IN ('held', 'partial');

  v_available := v_ledger_balance - v_held_funds;

  IF v_available - NEW.amount < -0.005 THEN
    RAISE EXCEPTION 'Payout would result in negative balance: available=%, debit=%, shortfall=%',
      v_available, NEW.amount, NEW.amount - v_available
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_payout_negative_balance_guard
  BEFORE INSERT ON entries
  FOR EACH ROW
  EXECUTE FUNCTION trg_payout_negative_balance_guard_fn();

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON CONSTRAINT chk_released_not_exceeds_held ON held_funds IS
  'Ensures released_amount never exceeds held_amount';
COMMENT ON TRIGGER trg_entries_immutability ON entries IS
  'Blocks UPDATE/DELETE on entries for terminal transactions (completed/voided/reversed)';
COMMENT ON TRIGGER trg_entries_double_entry_delete ON entries IS
  'Ensures remaining entries still balance after a DELETE (deferred constraint)';
COMMENT ON TRIGGER trg_payout_negative_balance_guard ON entries IS
  'Prevents payout debits that would make creator_balance negative (including held funds)';
