-- Drop superseded refund RPCs.
-- Refund processing now runs through record_refund_atomic_v2 via the resource-first refunds service.
-- Keeping the older processor-specific RPCs around risks divergent bookkeeping behavior.

DROP FUNCTION IF EXISTS public.process_processor_refund(
  uuid,
  uuid,
  text,
  text,
  text,
  numeric,
  text,
  jsonb
);

DROP FUNCTION IF EXISTS public.process_stripe_refund(
  uuid,
  uuid,
  text,
  text,
  text,
  numeric,
  text,
  jsonb
);
