-- SIGAPRO urban acceptance: authorized write+history and foreign-tenant refusal.
-- Isolated Neon database ONLY. No production changes; synthetic writes always
-- rolled back by the deliberate exception subtransaction.
-- JWT claim emulation tests SQL authorization, NOT real browser authentication.
DO $qa$
DECLARE actor record; outsider text; norm uuid; saved jsonb; history jsonb; passed boolean:=false;
BEGIN
 IF current_database()<>'sigapro_migration_stage_20260923' THEN
   RAISE EXCEPTION 'This test may only run on isolated QA database';
 END IF;
 SELECT proc.id process_id,coalesce(proc.municipality_id,proc.tenant_id) municipality_id,
        p.id profile_id, a.provider_user_id subject_id
 INTO actor
 FROM public.processes proc JOIN public.profiles p ON p.id=proc.analysis_assigned_to_profile_id
 JOIN public.profile_auth_identities a ON a.profile_id=p.id AND a.provider='neon' AND a.is_active
 WHERE p.account_status='active' AND p.deleted_at IS NULL
 AND p.municipality_id=coalesce(proc.municipality_id,proc.tenant_id)
 LIMIT 1;
 IF actor.process_id IS NULL THEN RAISE EXCEPTION 'No assigned QA analyst'; END IF;
 SELECT a.provider_user_id INTO outsider FROM public.profiles p
 JOIN public.profile_auth_identities a ON a.profile_id=p.id AND a.provider='neon' AND a.is_active
 WHERE p.municipality_id<>actor.municipality_id AND p.deleted_at IS NULL
 AND p.account_status='active' LIMIT 1;
 IF outsider IS NULL THEN RAISE EXCEPTION 'No other municipality identity in QA'; END IF;
 BEGIN
   norm:=gen_random_uuid();
   INSERT INTO public.urban_regulation_versions
    (id,municipality_id,zone_code,use_code,effective_from,version,status,rules,
     created_by_profile_id,activated_by_profile_id,activated_at)
   VALUES(norm,actor.municipality_id,'QA_ACCEPTANCE_ZONE','QA_ACCEPTANCE_USE',
    '2026-01-01',1,'active',
    '[{"metric":"front_setback_m","limit":5,"reference":"NORMA FICTICIA QA - SEM EFEITO LEGAL"}]'::jsonb,
    actor.profile_id,actor.profile_id,clock_timestamp());
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor.subject_id)::text,true);
   IF NOT public.can_write_process_analysis(actor.process_id) THEN
     RAISE EXCEPTION 'Assigned analyst unexpectedly denied';
   END IF;
   saved:=public.save_urban_precheck_run_v4(actor.process_id,norm,'2026-10-23'::date,
    '{"front_setback_m":{"value":6,"evidence":"Prancha sintetica QA pagina 1"}}'::jsonb,
    '{"evidence_ids":[],"note":"","document_scope_confirmed":false}'::jsonb);
   history:=public.list_urban_prechecks_v1(actor.process_id);
   IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(history) h WHERE h->>'id'=saved->>'id')
   THEN RAISE EXCEPTION 'Saved analysis is absent from history'; END IF;
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',outsider)::text,true);
   IF public.has_process_access(actor.process_id) OR public.can_write_process_analysis(actor.process_id)
   THEN RAISE EXCEPTION 'CROSS_TENANT_ACCESS_LEAK'; END IF;
   -- Exercise the actual write RPC, not merely its permission helper.
   BEGIN
     PERFORM public.save_urban_precheck_run_v4(actor.process_id,norm,'2026-10-23'::date,
       '{"front_setback_m":{"value":6,"evidence":"Prancha sintetica QA pagina 1"}}'::jsonb,
       '{"evidence_ids":[],"note":"","document_scope_confirmed":false}'::jsonb);
     RAISE EXCEPTION 'CROSS_TENANT_RPC_WRITE_LEAK';
   EXCEPTION WHEN OTHERS THEN
     IF SQLERRM='CROSS_TENANT_RPC_WRITE_LEAK' THEN RAISE; END IF;
   END;
   IF (SELECT count(*) FROM public.process_urban_precheck_runs WHERE regulation_version_id=norm)<>1
   THEN RAISE EXCEPTION 'CROSS_TENANT_RPC_WRITE_SIDE_EFFECT'; END IF;
   BEGIN
     PERFORM public.list_urban_prechecks_v1(actor.process_id);
     RAISE EXCEPTION 'CROSS_TENANT_HISTORY_LEAK';
   EXCEPTION WHEN OTHERS THEN
     IF SQLERRM='CROSS_TENANT_HISTORY_LEAK' THEN RAISE; END IF;
   END;
   passed:=true;
   RAISE EXCEPTION 'QA_ROLLBACK_SUCCESS';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM<>'QA_ROLLBACK_SUCCESS' THEN RAISE; END IF;
 END;
 PERFORM set_config('request.jwt.claims','',true);
 IF NOT passed OR EXISTS(SELECT 1 FROM public.urban_regulation_versions WHERE id=norm)
    OR EXISTS(SELECT 1 FROM public.process_urban_precheck_runs WHERE regulation_version_id=norm)
 THEN RAISE EXCEPTION 'QA acceptance failed: fixture leak'; END IF;
 RAISE NOTICE 'PASS: analyst saved and retrieved; other tenant blocked; fixture fully rolled back';
END $qa$;
