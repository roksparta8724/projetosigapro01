-- SIGAPRO IA: auditoria final de privilégio público e negativa de acesso.
-- Apenas SELECT; EXECUTAR somente no banco SIGAPRO da branch isolada.
-- Este diagnóstico NÃO representa teste autenticado de fluxo completo.
WITH funcs AS (
 SELECT p.oid,p.proname,p.prosecdef,
 EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
         WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname LIKE '%urban%'
), summary AS (
 SELECT count(*) AS urban_functions,
        count(*) FILTER (WHERE public_execute) AS exposed_to_public,
        count(*) FILTER (WHERE prosecdef AND public_execute) AS exposed_privileged_functions
 FROM funcs
), guards AS (
 SELECT public.can_write_process_analysis('00000000-0000-0000-0000-000000000000'::uuid)
          AS invalid_process_can_write,
        public.is_urban_regulation_admin_v1('00000000-0000-0000-0000-000000000000'::uuid)
          AS invalid_municipality_can_manage
)
SELECT current_database() AS database_checked,
       summary.urban_functions,summary.exposed_to_public,summary.exposed_privileged_functions,
       guards.invalid_process_can_write,guards.invalid_municipality_can_manage,
       CASE WHEN current_database()='sigapro_migration_stage_20260923'
                AND summary.urban_functions >= 14
                AND summary.exposed_to_public=0 AND summary.exposed_privileged_functions=0
                AND NOT guards.invalid_process_can_write
                AND NOT guards.invalid_municipality_can_manage
            THEN 'PASS_STATIC_SECURITY_AUDIT'
            ELSE 'BLOCKED_REVIEW_SECURITY' END AS static_security_gate,
       'PENDING_AUTHENTICATED_CROSS_TENANT_E2E'::text AS browser_authentication_gate
FROM summary CROSS JOIN guards;
