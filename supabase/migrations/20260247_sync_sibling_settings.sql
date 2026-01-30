-- Sync settings across test/live sibling ledgers.
-- When settings (or business_name, ledger_mode) are updated on one ledger,
-- propagate to its sibling so the pair stays consistent.

CREATE OR REPLACE FUNCTION sync_sibling_ledger_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Only sync if the fields we care about actually changed
  IF (OLD.settings IS DISTINCT FROM NEW.settings)
     OR (OLD.business_name IS DISTINCT FROM NEW.business_name)
     OR (OLD.ledger_mode IS DISTINCT FROM NEW.ledger_mode)
  THEN
    UPDATE ledgers
    SET
      settings = NEW.settings,
      business_name = NEW.business_name,
      ledger_mode = NEW.ledger_mode,
      updated_at = NOW()
    WHERE ledger_group_id = NEW.ledger_group_id
      AND id != NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_sibling_settings
  AFTER UPDATE ON ledgers
  FOR EACH ROW
  EXECUTE FUNCTION sync_sibling_ledger_settings();
