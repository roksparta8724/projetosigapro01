-- SIGAPRO IA — reversible database write/read smoke test.
-- EXECUTE ONLY on isolated Neon QA: sigapro_migration_stage_20260923.
-- Uses a PL/pgSQL exception subtransaction to force full rollback of test INSERT.
-- NO changes to existing municipal records or to production.
DO $qa$
DECLARE
  municipality uuid; profile uuid; synthetic_id uuid := gen_random_uuid();
  read_back boolean := false; rolled_back boolean := false;
BEGIN
 IF current_database() <> 'sigapro_migration_stage_20260923' THEN
   RAISE EXCEPTION 'Wrong QA database: %', current_database();
 END IF;
 SELECT municipality_id,id INTO municipality,profile
 FROM public.profiles WHERE municipality_id IS NOT NULL AND deleted_at IS NULL LIMIT 1;
 IF municipality IS NULL OR profile IS NULL THEN
   RAISE EXCEPTION 'QA profile fixture unavailable';
 END IF;
 BEGIN
   INSERT INTO public.urban_regulation_versions
   (id, municipality_id, zone_code, use_code, effective_from, version,
    status, rules, created_by_profile_id)
   VALUES (synthetic_id,municipality,'QA_TRANSIENT_ZONE','QA_TRANSIENT_USE',
    '2026-01-01',1,'draft',
    '[{"metric":"front_setback_m","limit":5,"reference":"NORMA FICTICIA SOMENTE TESTE"}]'::jsonb,
    profile);
   SELECT EXISTS(SELECT 1 FROM public.urban_regulation_versions
                 WHERE id=synthetic_id) INTO read_back;
   IF NOT read_back THEN RAISE EXCEPTION 'QA_INSERT_NOT_VISIBLE'; END IF;
   RAISE EXCEPTION 'QA_INTENTIONAL_ROLLBACK';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM <> 'QA_INTENTIONAL_ROLLBACK' THEN RAISE; END IF;
   rolled_back := true;
 END;
 IF NOT rolled_back OR NOT read_back OR EXISTS(
      SELECT 1 FROM public.urban_regulation_versions WHERE id=synthetic_id)
 THEN RAISE EXCEPTION 'QA_ROLLBACK_FAILURE'; END IF;
 RAISE NOTICE 'PASS: insert/read/revert regulation fixture; no persistent write';
END
$qa$;
