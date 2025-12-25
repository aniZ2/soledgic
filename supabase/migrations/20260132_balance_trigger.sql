-- Soledgic: Balance Trigger Fix (H1 Fix)
-- Part 2 of 4

CREATE OR REPLACE FUNCTION public.update_account_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_account_type TEXT;
BEGIN
  SELECT account_type INTO v_account_type
  FROM public.accounts
  WHERE id = NEW.account_id;
  
  IF v_account_type IN ('cash', 'processing_fees', 'refund_reserve') THEN
    IF NEW.entry_type = 'debit' THEN
      UPDATE public.accounts 
      SET balance = balance + NEW.amount, updated_at = NOW()
      WHERE id = NEW.account_id;
    ELSE
      UPDATE public.accounts 
      SET balance = balance - NEW.amount, updated_at = NOW()
      WHERE id = NEW.account_id;
    END IF;
  ELSE
    IF NEW.entry_type = 'credit' THEN
      UPDATE public.accounts 
      SET balance = balance + NEW.amount, updated_at = NOW()
      WHERE id = NEW.account_id;
    ELSE
      UPDATE public.accounts 
      SET balance = balance - NEW.amount, updated_at = NOW()
      WHERE id = NEW.account_id;
    END IF;
  END IF;
  
  NEW.running_balance := (SELECT balance FROM public.accounts WHERE id = NEW.account_id);
  
  RETURN NEW;
END;
$$;
