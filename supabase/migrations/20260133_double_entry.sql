-- Soledgic: Double-Entry Enforcement & Split Calculator
-- Part 3 of 4

CREATE OR REPLACE FUNCTION public.validate_double_entry_at_commit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_debits NUMERIC(14,2);
  v_credits NUMERIC(14,2);
BEGIN
  SELECT 
    COALESCE(SUM(amount) FILTER (WHERE entry_type = 'debit'), 0),
    COALESCE(SUM(amount) FILTER (WHERE entry_type = 'credit'), 0)
  INTO v_debits, v_credits
  FROM public.entries
  WHERE transaction_id = NEW.transaction_id;
  
  IF ABS(v_debits - v_credits) > 0.01 THEN
    RAISE EXCEPTION 'Double-entry violation for transaction %: debits (%) != credits (%)', 
      NEW.transaction_id, v_debits, v_credits;
  END IF;
  
  RETURN NEW;
END;
$$;
