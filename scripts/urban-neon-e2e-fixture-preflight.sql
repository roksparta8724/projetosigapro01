-- SIGAPRO IA: prerequisitos de homologacao com duas prefeituras (somente leitura).
-- Executar no banco sigapro_migration_stage_20260923 de uma branch isolada.
-- Nao cria contratos, usuarios, processos nem normas.
WITH tenants AS (
 SELECT m.id,
  EXISTS (SELECT 1 FROM public.profiles p JOIN public.profile_auth_identities i
    ON i.profile_id=p.id AND i.provider='neon' AND i.is_active
    WHERE p.municipality_id=m.id AND p.account_status='active' AND p.deleted_at IS NULL) identity_ready,
  EXISTS (SELECT 1 FROM public.client_plan_assignments c
    JOIN public.plans pl ON pl.id=c.plan_id
    WHERE c.municipality_id=m.id AND c.contract_status='ativo'
    AND pl.is_active AND pl.is_enabled
    AND pl.modules_included ? 'Protocolo digital') contract_ready,
  EXISTS (SELECT 1 FROM public.processes proc
    WHERE coalesce(proc.municipality_id,proc.tenant_id)=m.id) process_ready,
  EXISTS (SELECT 1 FROM public.urban_regulation_versions v
    WHERE v.municipality_id=m.id AND v.status='active') regulation_ready
 FROM public.municipalities m
), totals AS (
 SELECT count(*) municipalities,
   count(*) FILTER (WHERE identity_ready) authenticated_tenants,
   count(*) FILTER (WHERE contract_ready) contracted_tenants,
   count(*) FILTER (WHERE process_ready) process_tenants,
   count(*) FILTER (WHERE regulation_ready) regulation_tenants
 FROM tenants
)
SELECT current_database() database_checked,
 CASE WHEN current_database()='sigapro_migration_stage_20260923' THEN 'OK' ELSE 'WRONG_DATABASE' END database_gate,
 municipalities,authenticated_tenants,contracted_tenants,process_tenants,regulation_tenants,
 CASE WHEN authenticated_tenants>=2 AND contracted_tenants>=2
         AND process_tenants>=2 AND regulation_tenants>=2
      THEN 'READY_FOR_AUTHENTICATED_E2E'
      ELSE 'BLOCKED_MISSING_SECOND_TENANT_FIXTURES_OR_CONTRACT' END AS preparation_gate,
 'NOT_VERIFIED_REQUIRES_REAL_BROWSER_SESSIONS' AS browser_gate
FROM totals;