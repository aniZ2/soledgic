-- ============================================================================
-- FIX: Set immutable search_path on functions
-- Prevents search_path hijacking attacks
-- ============================================================================

-- Fix is_valid_uuid function
ALTER FUNCTION public.is_valid_uuid(text) SET search_path = '';

-- Fix recalculate_all_balances function
ALTER FUNCTION public.recalculate_all_balances() SET search_path = '';

-- Fix initialize_expense_categories function
ALTER FUNCTION public.initialize_expense_categories(uuid) SET search_path = '';

-- Fix initialize_expense_accounts function
ALTER FUNCTION public.initialize_expense_accounts(uuid) SET search_path = '';

SELECT 'Function search_path security fixes applied' AS status;
