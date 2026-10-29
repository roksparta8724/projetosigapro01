-- SIGAPRO IA: align persisted pre-analysis date with municipality's Sao Paulo civil day.
-- Apply through the normal reviewed migration workflow. Not applied to production.
-- Idempotent: refuses to replace unexpected function text.
DO $fix$
DECLARE source text; revised text;
BEGIN
 SELECT pg_get_functiondef('public.save_urban_precheck_run_v2(uuid,uuid,date,jsonb)'::regprocedure) INTO source;
 IF source LIKE '%_reference_date > (now() AT TIME ZONE ''America/Sao_Paulo'')::date%' THEN
   RAISE NOTICE 'SIGAPRO urban date alignment already installed'; RETURN;
 END IF;
 IF source NOT LIKE '%_reference_date > current_date%' THEN
   RAISE EXCEPTION 'Urban precheck writer changed; review manually before applying date alignment';
 END IF;
 revised := replace(source,'_reference_date > current_date',
   '_reference_date > (now() AT TIME ZONE ''America/Sao_Paulo'')::date');
 EXECUTE revised;
 RAISE NOTICE 'SIGAPRO urban date alignment installed';
END
$fix$;
