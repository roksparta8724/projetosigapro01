-- SIGAPRO IA: AUDITORIA SOMENTE LEITURA do banco MUNICIPAL isolado.
-- Conectar a sigapro_migration_stage_20260923; jamais executar no neondb por engano.
-- SECURITY DEFINER necessita verificacao de isolamento interno de cada RPC.
WITH functions AS (
 SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS definition,
        p.prosecdef AS security_definer
 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('save_urban_precheck_run_v3','save_urban_precheck_run_v4',
                    'list_urban_prechecks_v1','activate_urban_regulation_v1',
                    'save_urban_regulation_draft_v1')
), checks AS (
 SELECT proname, security_definer,
   has_function_privilege('authenticated',oid,'EXECUTE') AS authenticated_can_execute,
   definition ILIKE '%can_write_process_analysis%' AS direct_analysis_guard,
   definition ILIKE '%has_process_access%' AS direct_read_guard,
   definition ILIKE '%is_urban_regulation_admin_v1%' AS direct_regulation_admin_guard,
   definition ILIKE '%save_urban_precheck_run_v3%' AS delegates_to_guarded_writer
 FROM functions
)
SELECT current_database() AS inspected_database, 'RPC' AS object_type,
       proname AS object_name, security_definer, authenticated_can_execute,
       direct_analysis_guard, direct_read_guard, direct_regulation_admin_guard,
       delegates_to_guarded_writer
FROM checks
UNION ALL
SELECT current_database(), 'TABLE', c.relname, null,
       null, c.relrowsecurity, null, null, null
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN (
 'urban_regulation_versions','process_urban_precheck_runs',
 'urban_legal_evidence_catalog','urban_legal_evidence_scopes')
ORDER BY object_type,object_name;
