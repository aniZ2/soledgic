-- Soledgic: Create double entry constraint trigger
-- Part 6d

CREATE CONSTRAINT TRIGGER enforce_double_entry
  AFTER INSERT ON entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW 
  EXECUTE FUNCTION public.validate_double_entry_at_commit();
