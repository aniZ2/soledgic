-- Migration: Recalculate balances after atomic functions
-- Ensures all account balances are correct

SELECT recalculate_all_balances();
