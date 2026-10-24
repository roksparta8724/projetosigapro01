-- SIGAPRO IA — gate operacional, SOMENTE LEITURA.
-- Conectar EXPLICITAMENTE ao banco sigapro_migration_stage_20260923 da branch QA.
-- Nunca considera CI verde equivalente a homologação com analista autenticado.
WITH expected_functions(name,signature) AS (
 VALUES ('save_urban_precheck_run_v4','uuid,uuid,date,jsonb,jsonb'),
 ('list_urban_prechecks_v1','uuid'),
 ('save_urban_regulation_draft_v1','uuid,text,text,date,jsonb'),
 ('activate_urban_regulation_v1','uuid'),
 ('list_urban_regulation_versions_v1','uuid'),
 ('list_urban_legal_evidence_v2','uuid'),
 ('save_urban_legal_evidence_scoped_v3','uuid,text,text,integer,text,text,text,text,date,date,text')
), function_status AS (
 SELECT count(*) FILTER (WHERE to_regprocedure('public.'||name||'('||signature||')') IS NOT NULL
     AND has_function_privilege('authenticated',to_regprocedure('public.'||name||'('||signature||')'),'EXECUTE')) AS working
 FROM expected_functions
), table_status AS (
 SELECT count(*) FILTER (WHERE c.relrowsecurity) AS rls_tables
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN
 ('urban_regulation_versions','urban_legal_evidence_catalog',
  'urban_legal_evidence_scopes','process_urban_precheck_runs')
), fixtures AS (
 SELECT (SELECT count(*) FROM public.urban_regulation_versions WHERE status='active') AS active_laws,
        (SELECT count(*) FROM public.urban_legal_evidence_catalog) AS legal_evidence,
        (SELECT count(*) FROM public.process_urban_precheck_runs) AS precheck_runs,
        (SELECT count(*) FROM public.processes WHERE analysis_assigned_to_profile_id IS NOT NULL) AS assigned_processes,
        (SELECT count(*) FROM public.profiles WHERE account_status='active' AND deleted_at IS NULL) AS active_profiles,
        (SELECT count(DISTINCT coalesce(municipality_id,tenant_id)) FROM public.processes) AS process_tenants
)
SELECT current_database() database_checked,
 CASE WHEN current_database()='sigapro_migration_stage_20260923' THEN 'OK' ELSE 'WRONG_DATABASE' END database_gate,
 CASE WHEN function_status.working=7 THEN 'OK' ELSE 'BLOCKED' END rpc_gate,
 CASE WHEN table_status.rls_tables=4 THEN 'OK' ELSE 'BLOCKED' END rls_gate,
 CASE WHEN fixtures.active_laws>0 AND fixtures.assigned_processes>0
           AND fixtures.active_profiles>0 THEN 'READY_FOR_AUTHENTICATED_E2E'
      ELSE 'BLOCKED_MISSING_TEST_FIXTURES' END e2e_preparation_gate,
 CASE WHEN fixtures.process_tenants >= 2 THEN 'READY_FOR_CROSS_TENANT_AUTH_TEST'
            ELSE 'BLOCKED_SECOND_TENANT_PROCESS_FIXTURE' END AS cross_tenant_gate,
 'NOT_VERIFIED_REQUIRES_AUTHENTICATED_BROWSER_TEST' AS actual_e2e_gate,
 function_status.working AS authenticated_rpcs,
 table_status.rls_tables AS rls_tables,
 fixtures.active_laws,fixtures.legal_evidence,fixtures.precheck_runs,
 fixtures.assigned_processes,fixtures.active_profiles,fixtures.process_tenants
FROM function_status CROSS JOIN table_status CROSS JOIN fixtures;
