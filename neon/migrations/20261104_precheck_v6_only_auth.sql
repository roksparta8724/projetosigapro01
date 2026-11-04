-- SECURE PRECHECK: v6 is the only entrypoint accessible to authenticated users.
-- v4/v5 remain callable by the owner-controlled v6 SECURITY DEFINER chain.
-- Existing historical rows are retained. No process, rule or evidence is rewritten.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.save_urban_precheck_run_v4(uuid,uuid,date,jsonb,jsonb) FROM authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_urban_precheck_run_v5(uuid,uuid,date,jsonb,jsonb,uuid) FROM authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_urban_precheck_run_v6(uuid,uuid,date,jsonb,jsonb,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
