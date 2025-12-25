-- Add helper function for safe UUID validation

CREATE OR REPLACE FUNCTION is_valid_uuid(p_text TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_text IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Try to cast to UUID, return true if succeeds
  PERFORM p_text::UUID;
  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$;
