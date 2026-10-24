-- SIGAPRO QA-only regression for attempted legacy-ID impersonation.
-- Running this intentionally rolls back temporary fixture changes.
-- Requires the two isolated synthetic QA processes from 2026-10-24.
DO $qa$
DECLARE proc_a uuid; sub_a text; sub_b text; chosen_legacy uuid;
        outsider boolean := true; spoofed boolean := true; rightful boolean := false;
        completed boolean := false;
BEGIN
 IF current_database() <> 'sigapro_migration_stage_20260923' THEN
   RAISE EXCEPTION 'QA only. No production execution.';
 END IF;
 SELECT id INTO proc_a FROM public.processes
 WHERE title='QA-URBAN-E2E-20261024 PROCESSO A FICTÍCIO';
 SELECT i.provider_user_id INTO sub_a FROM public.processes p
 JOIN public.profile_auth_identities i ON i.profile_id=p.analysis_assigned_to_profile_id
 WHERE p.id=proc_a AND i.provider='neon' AND i.is_active LIMIT 1;
 SELECT i.provider_user_id INTO sub_b FROM public.processes p
 JOIN public.profile_auth_identities i ON i.profile_id=p.analysis_assigned_to_profile_id
 WHERE p.title='QA-URBAN-E2E-20261024 PROCESSO B FICTÍCIO'
 AND i.provider='neon' AND i.is_active LIMIT 1;
 SELECT id INTO chosen_legacy FROM auth.users ORDER BY id LIMIT 1;
 IF proc_a IS NULL OR sub_a IS NULL OR sub_b IS NULL OR chosen_legacy IS NULL THEN
   RAISE EXCEPTION 'Synthetic QA fixtures missing';
 END IF;
 BEGIN
   UPDATE public.processes SET created_by=chosen_legacy WHERE id=proc_a;
   PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',sub_b)::text,true);
   outsider:=public.has_process_access(proc_a);
   spoofed:=public.has_process_access(proc_a,chosen_legacy);
   IF outsider OR spoofed THEN RAISE EXCEPTION 'SECURITY REGRESSION: spoof accepted'; END IF;
   PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',sub_a)::text,true);
   rightful:=public.has_process_access(proc_a);
   IF NOT rightful THEN RAISE EXCEPTION 'Legitimate analyst blocked'; END IF;
   completed:=true;
   RAISE EXCEPTION 'ROLLBACK_SYNTHETIC_FIXTURE';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM <> 'ROLLBACK_SYNTHETIC_FIXTURE' THEN RAISE; END IF;
 END;
 PERFORM set_config('request.jwt.claims','',true);
 IF NOT completed OR outsider OR spoofed OR NOT rightful THEN
   RAISE EXCEPTION 'QA security regression failed';
 END IF;
 IF EXISTS(SELECT 1 FROM public.processes WHERE id=proc_a AND created_by=chosen_legacy) THEN
   RAISE EXCEPTION 'QA fixture rollback failed';
 END IF;
END $qa$;
