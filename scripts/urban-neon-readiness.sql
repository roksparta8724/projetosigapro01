-- SIGAPRO IA Urbanismo — auditoria somente leitura de homologação.
-- IMPORTANTE: conectar explicitamente ao banco sigapro_migration_stage_20260923
-- na branch Neon de QA desejada. O banco padrão "neondb" NÃO é o SIGAPRO.
-- Não modifica esquema, usuários, dados ou documentos.
WITH expected_functions(name, arg_types) AS (
 VALUES
 ('list_urban_regulation_versions_v1','uuid'),
 ('save_urban_regulation_draft_v1','uuid,text,text,date,jsonb'),
 ('activate_urban_regulation_v1','uuid'),
 ('list_urban_prechecks_v1','uuid'),
 ('save_urban_precheck_run_v4','uuid,uuid,date,jsonb,jsonb'),
 ('list_urban_legal_evidence_v2','uuid'),
 ('save_urban_legal_evidence_scoped_v3','uuid,text,text,integer,text,text,text,text,date,date,text')
), expected_tables(name) AS (
 VALUES ('urban_regulation_versions'),('process_urban_precheck_runs'),
 ('urban_legal_evidence_catalog'),('urban_legal_evidence_scopes')
), function_checks AS (
 SELECT 'FUNCTION'::text AS kind, name AS object_name,
        coalesce(to_regprocedure('public.'||name||'('||arg_types||')') IS NOT NULL,false) AS present,
        CASE WHEN to_regprocedure('public.'||name||'('||arg_types||')') IS NULL THEN false
             ELSE has_function_privilege('authenticated',
               to_regprocedure('public.'||name||'('||arg_types||')'),'EXECUTE')
        END AS authorized
 FROM expected_functions
), table_checks AS (
 SELECT 'TABLE'::text AS kind,name AS object_name,
        to_regclass('public.'||name) IS NOT NULL AS present,
        NULL::boolean AS authorized
 FROM expected_tables
)
SELECT current_database() AS inspected_database,
       CASE WHEN current_database() = 'sigapro_migration_stage_20260923'
            THEN 'SIGAPRO_DB' ELSE 'WRONG_DATABASE' END AS database_identity,
       kind,object_name,present,authorized
FROM (SELECT * FROM function_checks UNION ALL SELECT * FROM table_checks) audit
ORDER BY kind,object_name;
