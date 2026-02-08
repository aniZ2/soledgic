-- ============================================================================
-- Set default platform_fee_percent to 100 for standard (non-marketplace) mode
-- For standard businesses, all revenue goes to the business (no creator split)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_default_settings(p_mode TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_mode = 'marketplace' THEN
    RETURN '{
      "default_split_percent": 80,
      "platform_fee_percent": 20,
      "min_payout_amount": 10.00,
      "payout_schedule": "manual",
      "tax_withholding_percent": 0,
      "auto_create_creator_accounts": true
    }'::jsonb;
  ELSE
    -- Standard mode: 100% platform fee (all revenue goes to business)
    RETURN '{
      "platform_fee_percent": 100,
      "fiscal_year_start": "01-01",
      "default_tax_rate": 25,
      "track_sales_tax": false,
      "sales_tax_rate": 0,
      "invoice_prefix": "INV-",
      "invoice_next_number": 1001
    }'::jsonb;
  END IF;
END;
$$;
