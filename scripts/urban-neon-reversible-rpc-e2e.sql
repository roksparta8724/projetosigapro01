-- SIGAPRO IA -- Teste transacional integrado v4 + histórico (somente Neon QA).
-- Simula contexto JWT no SQL: NÃO valida login real, browser, ou separação de tenants.
-- Usa um analista já vinculado; somente insere linhas inteiramente fictícias.
-- Exception subtransaction guarantees rollback of synthetic regulation and history.
DO $qa$
DECLARE actor record; norm uuid; saved jsonb; history jsonb; passed boolean:=false;
BEGIN
 IF current_database()<>'sigapro_migration_stage_20260923' THEN
   RAISE EXCEPTION 'Wrong database; QA only';
 END IF;
 FOR actor IN
   SELECT proc.id process_id,coalesce(proc.municipality_id,proc.tenant_id) municipality_id,
     pai.provider_user_id subject_id,pr.id profile_id
   FROM public.processes proc
   JOIN public.profiles pr ON pr.id=proc.analysis_assigned_to_profile_id
   JOIN public.profile_auth_identities pai ON pai.profile_id=pr.id
      AND pai.provider='neon' AND pai.is_active=true
   WHERE pr.account_status='active' AND pr.deleted_at IS NULL
     AND coalesce(proc.municipality_id,proc.tenant_id)=pr.municipality_id
 LOOP
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor.subject_id)::text,true);
   IF NOT public.can_write_process_analysis(actor.process_id) THEN CONTINUE; END IF;
   BEGIN
     norm:=gen_random_uuid();
     INSERT INTO public.urban_regulation_versions
       (id,municipality_id,zone_code,use_code,effective_from,version,status,rules,
        created_by_profile_id,activated_by_profile_id,activated_at)
     VALUES(norm,actor.municipality_id,'QA_E2E_ZONE','QA_E2E_USE','2026-01-01',1,'active',
       '[{"metric":"front_setback_m","limit":5,"reference":"NORMA FICTICIA EXCLUSIVA PARA QA"}]'::jsonb,
       actor.profile_id,actor.profile_id,now());
     saved:=public.save_urban_precheck_run_v4(actor.process_id,norm,'2026-10-23'::date,
       '{"front_setback_m":{"value":6,"evidence":"Prancha ficticia QA pagina 1"}}'::jsonb,
       '{"evidence_ids":[],"note":"","document_scope_confirmed":false}'::jsonb);
     history:=public.list_urban_prechecks_v1(actor.process_id);
     IF NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(history) entry
       WHERE entry->>'id'=saved->>'id'
     ) THEN RAISE EXCEPTION 'QA failed: saved entry missing from history'; END IF;
     passed:=true;
     RAISE EXCEPTION 'QA_ROLLBACK';
   EXCEPTION WHEN OTHERS THEN
     IF SQLERRM <> 'QA_ROLLBACK' THEN RAISE; END IF;
   END;
   EXIT;
 END LOOP;
 PERFORM set_config('request.jwt.claims','',true);
 IF NOT passed THEN RAISE EXCEPTION 'No eligible analyst for isolated QA'; END IF;
 IF EXISTS(SELECT 1 FROM public.urban_regulation_versions WHERE id=norm)
    OR EXISTS(SELECT 1 FROM public.process_urban_precheck_runs WHERE regulation_version_id=norm)
 THEN RAISE EXCEPTION 'Test fixtures persisted unexpectedly'; END IF;
 RAISE NOTICE 'PASS: v4 write and v1 history read; all synthetic records reverted';
END $qa$;
