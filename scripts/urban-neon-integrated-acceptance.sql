-- SIGAPRO urban acceptance: authorized write+history and foreign-tenant refusal.
-- Isolated Neon database ONLY. No production changes; synthetic writes always
-- rolled back by the deliberate exception subtransaction.
-- JWT claim emulation tests SQL authorization, NOT real browser authentication.
DO $qa$
DECLARE actor record; outsider text; outsider_profile uuid; outsider_municipality uuid; norm uuid; foreign_norm uuid; foreign_process uuid; saved jsonb; history jsonb; passed boolean:=false;
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
 SELECT a.provider_user_id,p.id,p.municipality_id INTO outsider,outsider_profile,outsider_municipality FROM public.profiles p
 JOIN public.profile_auth_identities a ON a.profile_id=p.id AND a.provider='neon' AND a.is_active
 WHERE p.municipality_id<>actor.municipality_id AND p.deleted_at IS NULL
 AND p.account_status='active' LIMIT 1;
 IF outsider IS NULL THEN RAISE EXCEPTION 'No other municipality identity in QA'; END IF;
 BEGIN
   norm:=gen_random_uuid();
   foreign_norm:=gen_random_uuid();
   foreign_process:=gen_random_uuid();
   INSERT INTO public.processes (id,tenant_id,municipality_id,protocol_number,title,process_type,created_by_profile_id)
   VALUES (foreign_process,outsider_municipality,outsider_municipality,
     'QA-ISOLAMENTO-'||foreign_process::text,'Processo sintetico de segregacao QA',
     'aprovacao_projeto',outsider_profile);
   -- Validate both access directions: a creator in the second municipality
   -- must see its own synthetic process, while neither identity sees the
   -- other municipality's process. No QA record survives this DO block.
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',outsider)::text,true);
   IF NOT public.has_process_access(foreign_process) THEN
     RAISE EXCEPTION 'FOREIGN_CREATOR_DENIED_OWN_PROCESS';
   END IF;
   IF public.has_process_access(actor.process_id) OR public.can_write_process_analysis(actor.process_id)
   THEN RAISE EXCEPTION 'FOREIGN_CREATOR_CAN_ACCESS_ACTOR_PROCESS'; END IF;
   -- The synthetic second-tenant process only exists inside the rollback scope.
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor.subject_id)::text,true);
   IF public.has_process_access(foreign_process) OR public.can_write_process_analysis(foreign_process)
   THEN RAISE EXCEPTION 'ACTOR_CAN_ACCESS_FOREIGN_PROCESS'; END IF;
   BEGIN
     PERFORM public.list_urban_prechecks_v1(foreign_process);
     RAISE EXCEPTION 'ACTOR_READ_FOREIGN_PROCESS_HISTORY';
   EXCEPTION WHEN OTHERS THEN
     IF SQLERRM <> 'Sem acesso ao historico de analises.' THEN RAISE; END IF;
   END;
   INSERT INTO public.urban_regulation_versions
    (id,municipality_id,zone_code,use_code,effective_from,version,status,rules,
     created_by_profile_id,activated_by_profile_id,activated_at)
   VALUES(norm,actor.municipality_id,'QA_ACCEPTANCE_ZONE','QA_ACCEPTANCE_USE',
    '2026-01-01',1,'active',
    '[{"metric":"front_setback_m","limit":5,"reference":"NORMA FICTICIA QA - SEM EFEITO LEGAL"}]'::jsonb,
    actor.profile_id,actor.profile_id,clock_timestamp());
   INSERT INTO public.urban_regulation_versions
    (id,municipality_id,zone_code,use_code,effective_from,version,status,rules,
     created_by_profile_id,activated_by_profile_id,activated_at)
   VALUES(foreign_norm,outsider_municipality,'QA_ACCEPTANCE_ZONE','QA_ACCEPTANCE_USE',
    '2026-01-01',1,'active',
    '[{"metric":"front_setback_m","limit":7,"reference":"NORMA FICTICIA SEGUNDO MUNICIPIO QA"}]'::jsonb,
    outsider_profile,outsider_profile,clock_timestamp());
   -- Even with a real active rule for the other municipality, the assigned
   -- analyst must not be able to write any historical record for its process.
   -- The procedure must deny the request before validating the norm itself.
   BEGIN
     PERFORM public.save_urban_precheck_run_v4(
       foreign_process,foreign_norm,'2026-10-23'::date,
       '{"front_setback_m":{"value":7,"evidence":"Prancha de QA isolada"}}'::jsonb,
       '{"evidence_ids":[],"note":"","document_scope_confirmed":false}'::jsonb);
     RAISE EXCEPTION 'ACTOR_WROTE_FOREIGN_PROCESS';
   EXCEPTION WHEN OTHERS THEN
     IF SQLERRM <> 'Somente o analista responsavel ou Diretoria pode registrar a revisao.'
     THEN RAISE EXCEPTION 'Foreign process write not denied by role: %', SQLERRM; END IF;
   END;
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor.subject_id)::text,true);
   -- A refused cross-tenant write must not create an audit row, even if
   -- the foreign municipality has a valid active regulation version.
   IF EXISTS (
     SELECT 1 FROM public.process_urban_precheck_runs
     WHERE process_id=foreign_process OR regulation_version_id=foreign_norm
   ) THEN RAISE EXCEPTION 'FOREIGN_WRITE_CREATED_UNAUTHORIZED_AUDIT_ROW'; END IF;
   -- Confirm legislation listings preserve municipal isolation before any precheck.
   IF NOT EXISTS (
     SELECT 1 FROM jsonb_array_elements(public.list_urban_regulation_versions_v1(actor.municipality_id)) v
     WHERE v->>'id'=norm::text
   ) THEN RAISE EXCEPTION 'Municipal regulation not visible to its own tenant'; END IF;
   -- Verify both municipal catalogs are isolated, including asymmetric limits.
   IF EXISTS (SELECT 1 FROM jsonb_array_elements(public.list_urban_regulation_versions_v1(actor.municipality_id)) v
     WHERE v->>'id'=foreign_norm::text)
   THEN RAISE EXCEPTION 'FOREIGN_NORM_EXPOSED_TO_ACTOR'; END IF;
   -- An outsider must not obtain an active norm from the analyst's municipality.
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',outsider)::text,true);
   BEGIN
     IF EXISTS (
       SELECT 1 FROM jsonb_array_elements(public.list_urban_regulation_versions_v1(actor.municipality_id)) v
       WHERE v->>'id'=norm::text
     ) THEN RAISE EXCEPTION 'CROSS_TENANT_REGULATION_LEAK'; END IF;
   EXCEPTION WHEN OTHERS THEN
     IF SQLERRM='CROSS_TENANT_REGULATION_LEAK' THEN RAISE; END IF;
     -- A permission denial is expected; unrelated DB failures must fail QA.
     IF SQLERRM<>'Sem permissao para consultar normas urbanisticas municipais.'
     THEN RAISE EXCEPTION 'Unexpected foreign regulation lookup failure: %',SQLERRM; END IF;
   END;
   -- A second tenant may have a valid account with a restricted role: either
   -- receive only its own catalog or be denied altogether. Neither can leak
   -- the other municipality's legislation.
   BEGIN
     IF EXISTS (SELECT 1 FROM jsonb_array_elements(public.list_urban_regulation_versions_v1(outsider_municipality)) v
       WHERE v->>'id'=norm::text)
     THEN RAISE EXCEPTION 'ACTOR_NORM_LEAKED_TO_FOREIGN_TENANT'; END IF;
   EXCEPTION WHEN OTHERS THEN
     IF SQLERRM='ACTOR_NORM_LEAKED_TO_FOREIGN_TENANT' THEN RAISE; END IF;
     IF SQLERRM<>'Sem permissao para consultar normas urbanisticas municipais.' THEN RAISE; END IF;
   END;
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor.subject_id)::text,true);
   IF NOT public.can_write_process_analysis(actor.process_id) THEN
     RAISE EXCEPTION 'Assigned analyst unexpectedly denied';
   END IF;
   saved:=public.save_urban_precheck_run_v4(actor.process_id,norm,'2026-10-23'::date,
    '{"front_setback_m":{"value":6,"evidence":"Prancha sintetica QA pagina 1"}}'::jsonb,
    '{"evidence_ids":[],"note":"","document_scope_confirmed":false}'::jsonb);
   -- Verify persisted tenant, legal version, analyst, reference date and evidence;
   -- a successful RPC result alone is not enough to guarantee audit integrity.
   IF NOT EXISTS (
     SELECT 1 FROM public.process_urban_precheck_runs r
     WHERE r.id=(saved->>'id')::uuid
       AND r.process_id=actor.process_id
       AND r.municipality_id=actor.municipality_id
       AND r.regulation_version_id=norm
       AND r.reviewer_profile_id=actor.profile_id
       AND r.reference_date='2026-10-23'::date
       AND r.measurements->'front_setback_m'->>'evidence'='Prancha sintetica QA pagina 1'
       AND r.measurements->'front_setback_m'->>'value'='6'
       AND r.legal_review->'evidence_ids'='[]'::jsonb
   ) THEN RAISE EXCEPTION 'Precheck audit fields do not match saved evidence'; END IF;
   IF (SELECT count(*) FROM public.process_urban_precheck_runs WHERE regulation_version_id=norm)<>1
   THEN RAISE EXCEPTION 'Unexpected number of precheck records after one save'; END IF;
   history:=public.list_urban_prechecks_v1(actor.process_id);
   IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(history) h WHERE h->>'id'=saved->>'id')
   THEN RAISE EXCEPTION 'Saved analysis is absent from history'; END IF;
   -- An unauthenticated request cannot read or create an urban precheck.
   PERFORM set_config('request.jwt.claims','',true);
   IF public.has_process_access(actor.process_id) OR public.can_write_process_analysis(actor.process_id)
   THEN RAISE EXCEPTION 'ANONYMOUS_PERMISSION_LEAK'; END IF;
   BEGIN
     PERFORM public.save_urban_precheck_run_v4(actor.process_id,norm,'2026-10-23'::date,
       '{"front_setback_m":{"value":6,"evidence":"Prancha sintetica QA pagina 1"}}'::jsonb,
       '{"evidence_ids":[],"note":"","document_scope_confirmed":false}'::jsonb);
     RAISE EXCEPTION 'ANONYMOUS_WRITE_LEAK';
   EXCEPTION WHEN OTHERS THEN
     IF SQLERRM <> 'Somente o analista responsavel ou Diretoria pode registrar a revisao.' THEN
       RAISE EXCEPTION 'Unexpected anonymous write outcome: %',SQLERRM;
     END IF;
   END;
   BEGIN
     PERFORM public.list_urban_prechecks_v1(actor.process_id);
     RAISE EXCEPTION 'ANONYMOUS_HISTORY_LEAK';
   EXCEPTION WHEN OTHERS THEN
     IF SQLERRM <> 'Sem acesso ao historico de analises.' THEN
       RAISE EXCEPTION 'Unexpected anonymous history outcome: %',SQLERRM;
     END IF;
   END;
   IF (SELECT count(*) FROM public.process_urban_precheck_runs WHERE regulation_version_id=norm)<>1
   THEN RAISE EXCEPTION 'ANONYMOUS_WRITE_SIDE_EFFECT'; END IF;
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
     IF SQLERRM <> 'Somente o analista responsavel ou Diretoria pode registrar a revisao.' THEN
       RAISE EXCEPTION 'Unexpected write rejection (not permission denial): %',SQLERRM;
     END IF;
   END;
   IF (SELECT count(*) FROM public.process_urban_precheck_runs WHERE regulation_version_id=norm)<>1
   THEN RAISE EXCEPTION 'CROSS_TENANT_RPC_WRITE_SIDE_EFFECT'; END IF;
   BEGIN
     PERFORM public.list_urban_prechecks_v1(actor.process_id);
     RAISE EXCEPTION 'CROSS_TENANT_HISTORY_LEAK';
   EXCEPTION WHEN OTHERS THEN
     IF SQLERRM <> 'Sem acesso ao historico de analises.' THEN
       RAISE EXCEPTION 'Unexpected history rejection (not permission denial): %',SQLERRM;
     END IF;
   END;
   passed:=true;
   RAISE EXCEPTION 'QA_ROLLBACK_SUCCESS';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM<>'QA_ROLLBACK_SUCCESS' THEN RAISE; END IF;
 END;
 PERFORM set_config('request.jwt.claims','',true);
 IF NOT passed OR EXISTS(SELECT 1 FROM public.urban_regulation_versions WHERE id IN (norm,foreign_norm))
    OR EXISTS(SELECT 1 FROM public.process_urban_precheck_runs WHERE regulation_version_id=norm)
    OR EXISTS(SELECT 1 FROM public.processes WHERE id=foreign_process)
 THEN RAISE EXCEPTION 'QA acceptance failed: fixture leak'; END IF;
 RAISE NOTICE 'PASS: analyst saved and retrieved; other tenant blocked; fixture fully rolled back';
END $qa$;
