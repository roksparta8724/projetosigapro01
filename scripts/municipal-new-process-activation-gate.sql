-- SIGAPRO: gate para NOVOS PROCESSOS, somente leitura, independente de guias históricas.
-- Execute com branch_id explícito da prefeitura no Neon. OK PARA TESTAR não significa liberação.
WITH a AS (
 SELECT m.id AS municipality_id,m.status='active' AS municipality_active,
 EXISTS(SELECT 1 FROM public.client_plan_assignments c
  WHERE c.municipality_id=m.id AND c.contract_status='ativo') AS contract_active,
 EXISTS(SELECT 1 FROM public.profiles p JOIN public.tenant_memberships t ON t.profile_id=p.id
  WHERE p.municipality_id=m.id AND t.tenant_id=m.id AND t.is_active AND t.deleted_at IS NULL
   AND p.account_status='active' AND p.deleted_at IS NULL
   AND p.role IN ('prefeitura_admin','prefeitura_supervisor')) AS municipal_admin_active,
 EXISTS(SELECT 1 FROM public.profiles p JOIN public.tenant_memberships t ON t.profile_id=p.id
  WHERE p.municipality_id=m.id AND t.tenant_id=m.id AND t.is_active AND t.deleted_at IS NULL
   AND p.account_status='active' AND p.deleted_at IS NULL AND p.role='analista') AS analyst_active,
 EXISTS(SELECT 1 FROM public.profiles p JOIN public.tenant_memberships t ON t.profile_id=p.id
  WHERE p.municipality_id=m.id AND t.tenant_id=m.id AND t.is_active AND t.deleted_at IS NULL
   AND p.account_status='active' AND p.deleted_at IS NULL AND p.role='financeiro') AS financial_operator_active,
 EXISTS(SELECT 1 FROM public.urban_regulation_versions l
  WHERE l.municipality_id=m.id AND l.status='active') AS active_urban_regulation,
 (SELECT c.mode FROM public.municipal_collection_configurations c
  WHERE c.municipality_id=m.id ORDER BY c.version DESC LIMIT 1) AS collection_mode,
 EXISTS(SELECT 1 FROM public.municipal_collection_configurations c
  JOIN public.municipal_payment_provider_connections p ON p.municipality_id=c.municipality_id
  WHERE c.municipality_id=m.id AND c.status='active' AND c.mode='sigapro'
    AND c.environment IN ('production','test')
    AND p.provider='mercado_pago' AND p.environment=c.environment
    AND p.status='active' AND p.last_test_status='ok'
    AND nullif(btrim(p.credentials_ciphertext),'') IS NOT NULL) AS sigapro_bank_configured
 FROM public.municipalities m
)
SELECT municipality_id,municipality_active,contract_active,municipal_admin_active,
 analyst_active,financial_operator_active,active_urban_regulation,
 collection_mode,sigapro_bank_configured,
 CASE WHEN NOT municipality_active OR NOT contract_active OR NOT municipal_admin_active
  OR NOT analyst_active OR NOT financial_operator_active OR NOT active_urban_regulation
  THEN 'BLOCKED_MUNICIPAL_ONBOARDING'
  WHEN collection_mode='municipal_system'
  THEN 'PENDING_EXTERNAL_MUNICIPAL_GATEWAY_E2E'
  WHEN NOT sigapro_bank_configured THEN 'BLOCKED_PAYMENT_PROVIDER_SETUP'
  ELSE 'READY_FOR_AUTHENTICATED_PAYMENT_AND_PERMIT_E2E'
 END AS activation_gate,
 'REAL_BANK_CREDIT_PDF_SHA_DIRECTOR_SIGNATURE_BROWSER_AND_TWO_TENANT_ACCEPTANCE_REQUIRED' AS live_acceptance_gate
FROM a ORDER BY municipality_id;
