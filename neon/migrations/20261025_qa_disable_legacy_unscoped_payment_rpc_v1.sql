-- QA-only financial security hardening. No guide rows, payment history,
-- signed PDF, process, storage object or provider credentials are modified.
--
-- This legacy RPC selected payment_guides by guide_number alone and allowed
-- any authenticated profile with has_process_access() to update provider
-- fields. has_process_access includes external applicants and professionals,
-- so it is NOT permission to write municipal billing data. The patched API
-- uses only persist_payment_guide_provider_charge_v2(municipality,guide,charge)
-- or qa_persist_payment_guide_provider_charge_v1 for isolated sandbox tests.
-- Fail closed when applied outside the isolated QA database.
DO $qa$
BEGIN
  IF current_database() <> 'sigapro_migration_stage_20260923' THEN
    RAISE EXCEPTION 'QA-only financial hardening refused outside isolated QA';
  END IF;
  IF to_regprocedure(
    'public.persist_payment_guide_provider_charge_v2(uuid,text,jsonb)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Safe municipal payment RPC not installed; abort';
  END IF;
END;
$qa$;

REVOKE EXECUTE ON FUNCTION public.persist_payment_guide_provider_charge_v1(
  text,text,text,text,text,timestamp with time zone,
  text,text,text,text,text
) FROM PUBLIC, authenticated, anonymous;

-- Only the database owner retains use for controlled legacy recovery.
-- Explicitly refresh PostgREST permissions; no existing data is changed.
NOTIFY pgrst, 'reload schema';
