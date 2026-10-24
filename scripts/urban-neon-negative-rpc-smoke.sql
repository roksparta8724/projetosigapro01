-- Negative-path smoke test. Run only on isolated Neon QA database.
-- The DO statement raises when an invalid request is unexpectedly permitted.
-- No fixture writes; no changes to production or existing municipal records.
DO $qa$
DECLARE passed integer := 0;
BEGIN
 IF current_database() <> 'sigapro_migration_stage_20260923' THEN
   RAISE EXCEPTION 'Wrong database: %',current_database();
 END IF;
 BEGIN
   PERFORM public.list_urban_prechecks_v1('00000000-0000-0000-0000-000000000000'::uuid);
   RAISE EXCEPTION 'SECURITY_BYPASS_history';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='SECURITY_BYPASS_history' THEN RAISE; END IF;
   passed := passed+1;
 END;
 BEGIN
   PERFORM public.list_urban_regulation_versions_v1('00000000-0000-0000-0000-000000000000'::uuid);
   RAISE EXCEPTION 'SECURITY_BYPASS_law';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='SECURITY_BYPASS_law' THEN RAISE; END IF;
   passed := passed+1;
 END;
 BEGIN
   PERFORM public.save_urban_precheck_run_v4(
     '00000000-0000-0000-0000-000000000000'::uuid,
     '00000000-0000-0000-0000-000000000000'::uuid,
     '2026-10-23'::date,'{}'::jsonb,'{"evidence_ids":[]}'::jsonb
   );
   RAISE EXCEPTION 'SECURITY_BYPASS_write';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='SECURITY_BYPASS_write' THEN RAISE; END IF;
   passed := passed+1;
 END;
 IF passed <> 3 THEN RAISE EXCEPTION 'Expected three rejected invalid RPCs; got %',passed; END IF;
 RAISE NOTICE 'SIGAPRO QA: all three invalid requests rejected';
END
$qa$;
