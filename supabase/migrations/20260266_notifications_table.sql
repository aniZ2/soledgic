-- ============================================================================
-- In-App Notifications System
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID,  -- If NULL, notification is for all org members
  ledger_id UUID REFERENCES ledgers(id) ON DELETE CASCADE,

  -- Notification content
  type TEXT NOT NULL CHECK (type IN (
    'payout_processed',
    'payout_failed',
    'sale_recorded',
    'period_closed',
    'reconciliation_mismatch',
    'webhook_failed',
    'limit_warning',
    'limit_reached',
    'trial_ending',
    'payment_failed',
    'security_alert',
    'team_invite',
    'system'
  )),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_url TEXT,  -- Optional link

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Read status
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ  -- Auto-dismiss after this date
);

-- Indexes for efficient querying
CREATE INDEX idx_notifications_org_user ON notifications(organization_id, user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(organization_id, user_id)
  WHERE read_at IS NULL AND dismissed_at IS NULL;
CREATE INDEX idx_notifications_ledger ON notifications(ledger_id, created_at DESC);

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their org's notifications
CREATE POLICY "Users can view org notifications"
  ON notifications
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (SELECT get_user_organization_ids(auth.uid()))
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- Users can mark their notifications as read
CREATE POLICY "Users can update own notifications"
  ON notifications
  FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (SELECT get_user_organization_ids(auth.uid()))
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- Service role full access
CREATE POLICY "Service role full access"
  ON notifications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Grant permissions
GRANT SELECT, UPDATE ON notifications TO authenticated;
GRANT ALL ON notifications TO service_role;

-- Function to create notification
CREATE OR REPLACE FUNCTION create_notification(
  p_organization_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_user_id UUID DEFAULT NULL,
  p_ledger_id UUID DEFAULT NULL,
  p_action_url TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  INSERT INTO notifications (
    organization_id,
    user_id,
    ledger_id,
    type,
    title,
    message,
    action_url,
    metadata
  ) VALUES (
    p_organization_id,
    p_user_id,
    p_ledger_id,
    p_type,
    p_title,
    p_message,
    p_action_url,
    p_metadata
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_notification TO service_role;
