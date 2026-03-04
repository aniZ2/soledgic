-- ============================================================================
-- Nightly Audit Chain Verification
-- Wrapper function that calls verify_audit_chain() and detect_audit_gaps(),
-- logs results to audit_log, and alerts on integrity failures.
-- Uses a sliding window: verifies the latest 10,000 records nightly.
-- Scheduled at 02:00 UTC (before health checks at 05:00).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.run_audit_chain_verification()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_chain_result jsonb;
  v_gaps RECORD;
  v_gap_count integer := 0;
  v_gap_list jsonb := '[]'::jsonb;
  v_overall_status text := 'intact';
  v_result jsonb;
  v_max_seq bigint;
  v_start_seq bigint;
  v_verify_limit integer := 10000;
BEGIN
  -- Determine sliding window: latest 10,000 records
  SELECT COALESCE(MAX(seq_num), 0) INTO v_max_seq
  FROM public.audit_log
  WHERE seq_num IS NOT NULL;

  -- If fewer than v_verify_limit records, start from 1; otherwise slide
  v_start_seq := GREATEST(1, v_max_seq - v_verify_limit + 1);

  -- Step 1: Verify hash chain integrity (sliding window)
  v_chain_result := verify_audit_chain(v_start_seq, v_verify_limit);

  -- Step 2: Detect sequence gaps (full range — gaps are cheap to detect)
  FOR v_gaps IN
    SELECT gap_start, gap_end, gap_size
    FROM detect_audit_gaps(1, NULL)
  LOOP
    v_gap_count := v_gap_count + 1;
    v_gap_list := v_gap_list || jsonb_build_object(
      'gap_start', v_gaps.gap_start,
      'gap_end', v_gaps.gap_end,
      'gap_size', v_gaps.gap_size
    );
  END LOOP;

  -- Step 3: Determine overall status
  IF v_chain_result->>'status' != 'intact' OR v_gap_count > 0 THEN
    v_overall_status := 'broken';
  END IF;

  -- Step 4: Build result summary
  v_result := jsonb_build_object(
    'chain_status', v_chain_result->>'status',
    'records_verified', (v_chain_result->>'records_verified')::integer,
    'verified_range_start', v_start_seq,
    'verified_range_end', v_max_seq,
    'broken_at_seq', v_chain_result->'broken_at_seq',
    'gap_count', v_gap_count,
    'gaps', v_gap_list,
    'overall_status', v_overall_status,
    'verified_at', now()
  );

  -- Step 5: Always log the verification run
  INSERT INTO public.audit_log (action, entity_type, actor_type, actor_id, request_body)
  VALUES (
    'audit_chain_verification',
    'system',
    'system',
    'cron',
    v_result
  );

  -- Step 6: If broken, write a CRITICAL integrity alert
  IF v_overall_status = 'broken' THEN
    INSERT INTO public.audit_log (action, entity_type, actor_type, actor_id, request_body)
    VALUES (
      'audit_chain_integrity_alert',
      'system',
      'system',
      'cron',
      jsonb_build_object(
        'severity', 'CRITICAL',
        'chain_status', v_chain_result->>'status',
        'broken_at_seq', v_chain_result->'broken_at_seq',
        'chain_reason', v_chain_result->>'reason',
        'gap_count', v_gap_count,
        'gaps', v_gap_list,
        'message', 'Audit chain integrity failure detected — investigate immediately'
      )
    );
  END IF;

  RETURN v_result;
END;
$$;

-- ============================================================================
-- NIGHTLY CRON: 02:00 UTC (before health checks at 05:00)
-- ============================================================================
SELECT cron.schedule(
  'audit-chain-verification-nightly',
  '0 2 * * *',
  $$SELECT public.run_audit_chain_verification()$$
);

COMMENT ON FUNCTION public.run_audit_chain_verification IS 'Nightly audit chain integrity verification (hash chain + gap detection, sliding window)';
