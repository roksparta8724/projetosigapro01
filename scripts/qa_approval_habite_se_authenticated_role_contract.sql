-- ISOLATED NEON QA ONLY. Read-only role/JWT contract check, NO browser session.
-- Run against QA, not official branch, using one SQL transaction. No guides or
-- process rows are inserted/updated. Claims represent existing mapped QA actors.
BEGIN;
SELECT set_config('qa.work.hab',(SELECT id::text FROM public.processes
 WHERE lower(process_type) LIKE '%habite%'
 AND analysis_assigned_to_profile_id IS NOT NULL LIMIT 1),true);
SELECT set_config('qa.work.construction',(SELECT pr.id::text FROM public.processes pr
 JOIN public.process_construction_permits cp ON cp.process_id=pr.id
 WHERE pr.municipality_id=(SELECT municipality_id FROM public.processes
 WHERE id=current_setting('qa.work.hab')::uuid) LIMIT 1),true);
SELECT set_config('qa.work.analyst_sub',(SELECT ai.provider_user_id
 FROM public.processes pr JOIN public.profile_auth_identities ai
 ON ai.profile_id=pr.analysis_assigned_to_profile_id
 AND ai.provider='neon' AND ai.is_active
 WHERE pr.id=current_setting('qa.work.hab')::uuid LIMIT 1),true);
SELECT set_config('qa.work.foreign_sub',(SELECT ai.provider_user_id FROM public.profiles p
 JOIN public.profile_auth_identities ai ON ai.profile_id=p.id
 AND ai.provider='neon' AND ai.is_active
 WHERE p.municipality_id IS NOT NULL AND p.municipality_id<>(SELECT municipality_id
 FROM public.processes WHERE id=current_setting('qa.work.hab')::uuid)
 AND p.account_status='active' LIMIT 1),true);
SET LOCAL ROLE authenticated;
DO $acceptance$
DECLARE hab uuid:=current_setting('qa.work.hab')::uuid;
 appr uuid:=current_setting('qa.work.construction')::uuid;
 analyst_sub text:=current_setting('qa.work.analyst_sub');
 foreign_sub text:=current_setting('qa.work.foreign_sub');
 a jsonb;b jsonb;c jsonb;
 deny_h boolean:=false; deny_i boolean:=false; deny_c boolean:=false;
 deny_w boolean:=false; deny_internal boolean:=false;
BEGIN
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',analyst_sub)::text,true);
 IF NOT public.has_process_access(hab) OR NOT public.has_process_access(appr)
 THEN RAISE EXCEPTION 'Analyst denied own process'; END IF;
 a:=public.get_habite_se_permit_v1(hab);
 b:=public.get_habite_se_inspection_v1(hab);
 c:=public.get_construction_permit_v1(appr);
 IF a->'permit'='null'::jsonb OR b->'inspection'='null'::jsonb OR c->'permit'='null'::jsonb
 THEN RAISE EXCEPTION 'QA permit or inspection not readable'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',foreign_sub)::text,true);
 IF public.has_process_access(hab) OR public.has_process_access(appr)
 THEN RAISE EXCEPTION 'Cross-municipality read access'; END IF;
 BEGIN PERFORM public.get_habite_se_permit_v1(hab);
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Sem acesso ao processo.' THEN deny_h:=true; ELSE RAISE; END IF; END;
 BEGIN PERFORM public.get_habite_se_inspection_v1(hab);
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Sem acesso ao processo.' THEN deny_i:=true; ELSE RAISE; END IF; END;
 BEGIN PERFORM public.get_construction_permit_v1(appr);
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Sem acesso ao processo.' THEN deny_c:=true; ELSE RAISE; END IF; END;
 BEGIN PERFORM public.save_habite_se_permit_v1(hab,'{"test":true}'::jsonb,NULL);
 EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%Analista responsável%' THEN deny_w:=true; ELSE RAISE; END IF; END;
 BEGIN PERFORM public.try_advance_habite_se_to_inspection_v1(hab,NULL);
 EXCEPTION WHEN insufficient_privilege THEN deny_internal:=true; END;
 IF NOT(deny_h AND deny_i AND deny_c AND deny_w AND deny_internal)
 THEN RAISE EXCEPTION 'Habite-se/approval cross-tenant contract failed'; END IF;
 PERFORM set_config('request.jwt.claims','',true);
END $acceptance$;
ROLLBACK;
