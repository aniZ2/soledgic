-- Checkout Sessions: hosted checkout for buyers without pre-tokenized payment methods.
-- When payment_method_id is omitted from create-checkout, a session is created
-- and the buyer is redirected to a hosted form to enter their card.

CREATE TABLE IF NOT EXISTS checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id uuid NOT NULL REFERENCES ledgers(id),

  -- Sale details
  amount integer NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'USD',
  creator_id text NOT NULL,
  product_id text,
  product_name text,
  customer_email text,
  customer_id text,
  metadata jsonb DEFAULT '{}',

  -- Redirect URLs
  success_url text NOT NULL,
  cancel_url text,

  -- Processor form state (onboarding link flow)
  processor_identity_id text,
  setup_state text UNIQUE,
  setup_state_expires_at timestamptz,

  -- Split snapshot (frozen at session creation)
  creator_percent numeric NOT NULL,
  creator_amount integer NOT NULL,
  platform_amount integer NOT NULL,

  -- Result
  payment_id text,
  reference_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'collecting', 'charging', 'completed', 'charged_pending_ledger', 'expired', 'cancelled')),

  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: service_role only (no user-facing access)
ALTER TABLE checkout_sessions ENABLE ROW LEVEL SECURITY;

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_status_ledger
  ON checkout_sessions (status, ledger_id);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_setup_state
  ON checkout_sessions (setup_state) WHERE setup_state IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_expires_at
  ON checkout_sessions (expires_at) WHERE status IN ('pending', 'collecting');
