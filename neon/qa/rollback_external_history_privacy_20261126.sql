-- Isolated QA only. All requirement fixtures and side effects are rolled back.
DO $$
DECLARE ext record; analyst record; pid uuid; m uuid; r_internal uuid; r_public uuid; out jsonb; initial_count bigint;
BEGIN
 SELECT p.id,p.municipality_id,i.provider_user_id INTO ext
 FROM public.profiles p JOIN public.profile_auth_identities i ON i.profile_id=p.id
 WHERE p.role='profissional_externo' AND p.account_status='active' AND p.deleted_at IS NULL AND i.provider='neon' AND i.is_active
 AND EXISTS (SELECT 1 FROM public.processes x WHERE x.created_by_profile_id=p.id AND x.officialized_at IS NOT NULL AND x.status='analise_tecnica' AND public.process_is_in_analysis_area(x.id)) LIMIT 1;
 IF ext.id IS NULL THEN RAISE EXCEPTION 'Missing external fixture'; END IF;
 SELECT x.id,x.municipality_id INTO pid,m FROM public.processes x WHERE x.created_by_profile_id=ext.id AND x.officialized_at IS NOT NULL AND x.status='analise_tecnica' AND public.process_is_in_analysis_area(x.id) LIMIT 1;
 SELECT p.id,i.provider_user_id INTO analyst FROM public.profiles p JOIN public.profile_auth_identities i ON i.profile_id=p.id WHERE p.municipality_id=m AND p.role='analista' AND p.account_status='active' AND p.deleted_at IS NULL AND i.provider='neon' AND i.is_active AND public.profile_operational_area(p.id)='analise' LIMIT 1;
 IF analyst.id IS NULL THEN RAISE EXCEPTION 'Missing analyst fixture'; END IF;
 SELECT count(*) INTO initial_count FROM public.process_requirements;
 BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',analyst.provider_user_id)::text,true);
  out:=public.create_process_requirement(pid,'QA PRIVATE','QA rollback only',NULL,NULL,'interno');
  r_internal:=(out->'requirement'->>'id')::uuid;
  out:=public.create_process_requirement(pid,'QA PUBLIC','QA rollback only',NULL,NULL,'misto');
  r_public:=(out->'requirement'->>'id')::uuid;
  IF r_internal IS NULL OR r_public IS NULL THEN RAISE EXCEPTION 'Requirement fixtures absent'; END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF (SELECT count(*) FROM public.process_requirements WHERE id IN (r_internal,r_public))<>2 THEN RAISE EXCEPTION 'Analyst lost visibility'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ext.provider_user_id)::text,true);
  IF NOT public.has_process_access(pid) OR public.is_internal_municipality_role() THEN RAISE EXCEPTION 'Unexpected external role'; END IF;
  IF EXISTS(SELECT 1 FROM public.process_requirements WHERE id=r_internal) OR NOT EXISTS(SELECT 1 FROM public.process_requirements WHERE id=r_public) THEN RAISE EXCEPTION 'Requirement visibility failed'; END IF;
  IF EXISTS(SELECT 1 FROM public.process_audit_entries WHERE visible_to_external IS NOT TRUE) OR EXISTS(SELECT 1 FROM public.process_movements WHERE visible_to_external IS NOT TRUE) OR EXISTS(SELECT 1 FROM public.interdepartmental_dispatches WHERE visibility NOT IN ('externo','misto')) THEN RAISE EXCEPTION 'Internal history leaked'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.process_audit_entries WHERE process_id=pid AND visible_to_external) OR NOT EXISTS(SELECT 1 FROM public.process_movements WHERE process_id=pid AND visible_to_external) THEN RAISE EXCEPTION 'Public history missing'; END IF;
  EXECUTE 'RESET ROLE';
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='rollback privacy fixtures';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
 END;
 IF (SELECT count(*) FROM public.process_requirements)<>initial_count THEN RAISE EXCEPTION 'Rollback failed'; END IF;
END $$;
