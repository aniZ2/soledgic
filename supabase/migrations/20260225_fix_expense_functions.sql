-- Fix expense category initialization functions
-- These functions were referenced but not defined

-- Function to initialize expense categories for a ledger
CREATE OR REPLACE FUNCTION initialize_expense_categories(p_ledger_id UUID)
RETURNS VOID AS $$
BEGIN
  -- IRS Schedule C standard expense categories
  -- Insert only if not exists (uses ON CONFLICT)

  INSERT INTO expense_categories (ledger_id, code, name, schedule_c_line) VALUES
    (p_ledger_id, 'advertising', 'Advertising', 8),
    (p_ledger_id, 'vehicle', 'Car and Truck Expenses', 9),
    (p_ledger_id, 'commissions', 'Commissions and Fees', 10),
    (p_ledger_id, 'contract_labor', 'Contract Labor', 11),
    (p_ledger_id, 'depreciation', 'Depreciation', 13),
    (p_ledger_id, 'employee_benefits', 'Employee Benefits', 14),
    (p_ledger_id, 'insurance', 'Insurance', 15),
    (p_ledger_id, 'interest_mortgage', 'Mortgage Interest', 16),
    (p_ledger_id, 'interest_other', 'Other Interest', 16),
    (p_ledger_id, 'legal_professional', 'Legal and Professional', 17),
    (p_ledger_id, 'office', 'Office Expense', 18),
    (p_ledger_id, 'pension', 'Pension Plans', 19),
    (p_ledger_id, 'rent_equipment', 'Equipment Rental', 20),
    (p_ledger_id, 'rent_property', 'Property Rental', 20),
    (p_ledger_id, 'repairs', 'Repairs and Maintenance', 21),
    (p_ledger_id, 'supplies', 'Supplies', 22),
    (p_ledger_id, 'taxes_licenses', 'Taxes and Licenses', 23),
    (p_ledger_id, 'travel', 'Travel', 24),
    (p_ledger_id, 'meals', 'Meals', 24),
    (p_ledger_id, 'utilities', 'Utilities', 25),
    (p_ledger_id, 'wages', 'Wages', 26),
    (p_ledger_id, 'bank_fees', 'Bank Fees', 27),
    (p_ledger_id, 'education', 'Education and Training', 27),
    (p_ledger_id, 'software', 'Software and Subscriptions', 27),
    (p_ledger_id, 'phone_internet', 'Phone and Internet', 27),
    (p_ledger_id, 'postage_shipping', 'Postage and Shipping', 27),
    (p_ledger_id, 'lodging', 'Lodging', 27),
    (p_ledger_id, 'uncategorized', 'Uncategorized', NULL)
  ON CONFLICT (ledger_id, code) DO NOTHING;

EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail ledger creation
  RAISE NOTICE 'Could not initialize expense categories for ledger %: %', p_ledger_id, SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Function to initialize expense accounts for a ledger
CREATE OR REPLACE FUNCTION initialize_expense_accounts(p_ledger_id UUID)
RETURNS VOID AS $$
BEGIN
  -- No additional action needed
  -- The get_or_create_ledger_account function creates accounts on demand
  NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not initialize expense accounts for ledger %: %', p_ledger_id, SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION initialize_expense_categories(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION initialize_expense_categories(UUID) TO anon;
GRANT EXECUTE ON FUNCTION initialize_expense_categories(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION initialize_expense_accounts(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION initialize_expense_accounts(UUID) TO anon;
GRANT EXECUTE ON FUNCTION initialize_expense_accounts(UUID) TO service_role;

-- Initialize categories for existing ledgers that don't have them
DO $$
DECLARE
  v_ledger_id UUID;
BEGIN
  FOR v_ledger_id IN SELECT id FROM ledgers LOOP
    BEGIN
      PERFORM initialize_expense_categories(v_ledger_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping ledger %: %', v_ledger_id, SQLERRM;
    END;
  END LOOP;
END $$;
