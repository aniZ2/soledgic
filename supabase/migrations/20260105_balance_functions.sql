-- soledgic: Account balance function
-- Calculate the balance of any account from entries

CREATE OR REPLACE FUNCTION get_account_balance(p_account_id UUID)
RETURNS NUMERIC(14,2) AS $$
DECLARE
  v_balance NUMERIC(14,2);
BEGIN
  -- Balance = Credits - Debits for liability accounts (what we owe)
  -- Balance = Debits - Credits for asset accounts (what we have)
  SELECT COALESCE(
    SUM(
      CASE 
        WHEN e.entry_type = 'credit' THEN e.amount 
        ELSE -e.amount 
      END
    ), 
    0
  )
  INTO v_balance
  FROM entries e
  JOIN transactions t ON e.transaction_id = t.id
  WHERE e.account_id = p_account_id
    AND t.status = 'completed';
  
  RETURN v_balance;
END;
$$ LANGUAGE plpgsql STABLE;

-- Also create a function to get all balances for a ledger
CREATE OR REPLACE FUNCTION get_all_account_balances(p_ledger_id UUID)
RETURNS TABLE (
  account_id UUID,
  account_name TEXT,
  account_type TEXT,
  entity_id TEXT,
  balance NUMERIC(14,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id as account_id,
    a.name as account_name,
    a.account_type,
    a.entity_id,
    COALESCE(
      SUM(
        CASE 
          WHEN e.entry_type = 'credit' THEN e.amount 
          ELSE -e.amount 
        END
      ), 
      0
    )::NUMERIC(14,2) as balance
  FROM accounts a
  LEFT JOIN entries e ON a.id = e.account_id
  LEFT JOIN transactions t ON e.transaction_id = t.id AND t.status = 'completed'
  WHERE a.ledger_id = p_ledger_id
    AND a.is_active = true
  GROUP BY a.id, a.name, a.account_type, a.entity_id
  ORDER BY a.account_type, a.name;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get creator balances specifically
CREATE OR REPLACE FUNCTION get_creator_balances(p_ledger_id UUID)
RETURNS TABLE (
  creator_id TEXT,
  creator_name TEXT,
  total_earned NUMERIC(14,2),
  total_paid NUMERIC(14,2),
  held_amount NUMERIC(14,2),
  available_balance NUMERIC(14,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.entity_id as creator_id,
    a.name as creator_name,
    -- Total earned = sum of all credits
    COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0)::NUMERIC(14,2) as total_earned,
    -- Total paid = sum of all debits (payouts)
    COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0)::NUMERIC(14,2) as total_paid,
    -- Held amount from held_funds table
    COALESCE(
      (SELECT SUM(hf.held_amount - hf.released_amount) 
       FROM held_funds hf 
       WHERE hf.creator_id = a.entity_id 
         AND hf.ledger_id = p_ledger_id
         AND hf.status IN ('held', 'partial')),
      0
    )::NUMERIC(14,2) as held_amount,
    -- Available = earned - paid - held
    (COALESCE(SUM(CASE WHEN e.entry_type = 'credit' THEN e.amount ELSE 0 END), 0) -
     COALESCE(SUM(CASE WHEN e.entry_type = 'debit' THEN e.amount ELSE 0 END), 0) -
     COALESCE(
       (SELECT SUM(hf.held_amount - hf.released_amount) 
        FROM held_funds hf 
        WHERE hf.creator_id = a.entity_id 
          AND hf.ledger_id = p_ledger_id
          AND hf.status IN ('held', 'partial')),
       0
     ))::NUMERIC(14,2) as available_balance
  FROM accounts a
  LEFT JOIN entries e ON a.id = e.account_id
  LEFT JOIN transactions t ON e.transaction_id = t.id AND t.status = 'completed'
  WHERE a.ledger_id = p_ledger_id
    AND a.account_type = 'creator_balance'
    AND a.is_active = true
  GROUP BY a.entity_id, a.name;
END;
$$ LANGUAGE plpgsql STABLE;
