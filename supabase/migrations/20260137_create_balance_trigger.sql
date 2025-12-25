-- Soledgic: Create balance trigger
-- Part 6b

CREATE TRIGGER trigger_update_balance
  BEFORE INSERT ON entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_account_balance();
