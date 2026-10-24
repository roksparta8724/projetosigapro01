-- SIGAPRO IA - tenant authorization regression on isolated Neon QA.
-- READ-ONLY: selects existing profiles/processes and simulates the JWT request claim.
-- Does not prove signed browser authentication or access through the API gateway.
DO $qa$
DECLARE target uuid; tenant uuid; subject text; denied boolean:=false;
BEGIN
 IF current_database()<>'sigapro_migration_stage_20260923' THEN
   RAISE EXCEPTION 'Wrong DB for cross-tenant QA';
 END IF;
 SELECT id,coalesce(municipality_id,tenant_id) INTO target,tenant
 FROM public.processes LIMIT 1;
 SELECT ai.provider_user_id INTO subject
 FROM public.profiles p
 JOIN public.profile_auth_identities ai ON ai.profile_id=p.id
   AND ai.provider='neon' AND ai.is_active
 WHERE p.municipality_id<>tenant
   AND p.deleted_at IS NULL AND p.account_status='active'
 LIMIT 1;
 IF target IS NULL OR subject IS NULL THEN
   RAISE EXCEPTION 'Cross-tenant QA fixtures absent';
 END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',subject)::text,true);
 IF public.has_process_access(target) THEN RAISE EXCEPTION 'CROSS_TENANT_LEAK'; END IF;
 IF public.can_write_process_analysis(target) THEN RAISE EXCEPTION 'CROSS_TENANT_WRITE_LEAK'; END IF;
 BEGIN
   PERFORM public.list_urban_prechecks_v1(target);
   RAISE EXCEPTION 'CROSS_TENANT_HISTORY_LEAK';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='CROSS_TENANT_HISTORY_LEAK' THEN RAISE; END IF;
   denied:=true;
 END;
 PERFORM set_config('request.jwt.claims','',true);
 IF NOT denied THEN RAISE EXCEPTION 'Missing history access denial'; END IF;
 RAISE NOTICE 'PASS: foreign municipality cannot access, write or read process history';
END $qa$;
