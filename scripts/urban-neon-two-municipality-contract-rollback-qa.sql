-- SIGAPRO IA: teste integrado de dois municípios e contrato isolado.
-- Somente QA. Todas as gravações sintéticas são revertidas no bloco de exceção.
-- NÃO comprova autenticação real via navegador.
DO $qa$
DECLARE
  a record; b record; active_plan text;
  process_a uuid; process_b uuid; regulation_a uuid; regulation_b uuid;
  verified boolean := false;
  marker text := 'QA-URBAN-TRANSIENT-20261024';
BEGIN
  IF current_database() <> 'sigapro_migration_stage_20260923' THEN
    RAISE EXCEPTION 'Banco de QA obrigatório';
  END IF;
  SELECT p.id AS profile_id,p.municipality_id INTO a
  FROM public.profiles p
  JOIN public.profile_auth_identities i ON i.profile_id=p.id AND i.provider='neon' AND i.is_active
  JOIN public.client_plan_assignments c ON c.municipality_id=p.municipality_id AND c.contract_status='ativo'
  WHERE p.account_status='active' AND p.deleted_at IS NULL
  ORDER BY p.id LIMIT 1;
  SELECT p.id AS profile_id,p.municipality_id INTO b
  FROM public.profiles p
  JOIN public.profile_auth_identities i ON i.profile_id=p.id AND i.provider='neon' AND i.is_active
  WHERE p.account_status='active' AND p.deleted_at IS NULL
    AND p.municipality_id <> a.municipality_id
  ORDER BY p.id LIMIT 1;
  SELECT c.plan_id INTO active_plan FROM public.client_plan_assignments c
  JOIN public.plans pl ON pl.id=c.plan_id AND pl.is_active AND pl.is_enabled
  WHERE c.municipality_id=a.municipality_id AND c.contract_status='ativo' LIMIT 1;
  IF a.profile_id IS NULL OR b.profile_id IS NULL OR active_plan IS NULL THEN
    RAISE EXCEPTION 'Pré-requisitos das duas prefeituras ausentes';
  END IF;
  BEGIN
    -- Both isolated QA municipalities may already have a real QA contract.
    -- A unique (municipality_id) constraint correctly forbids duplicates.
    -- Reuse an existing active QA contract; insert only when absent, and
    -- never update/replace a municipality's existing plan.
    IF NOT EXISTS(
      SELECT 1 FROM public.client_plan_assignments
      WHERE municipality_id=b.municipality_id
    ) THEN
      INSERT INTO public.client_plan_assignments
        (municipality_id,plan_id,contract_status,starts_at,billing_notes)
      VALUES(b.municipality_id,active_plan,'ativo',now(),
        marker||' CONTRATO FICTÍCIO SEM VALIDADE');
    ELSIF NOT EXISTS(
      SELECT 1 FROM public.client_plan_assignments
      WHERE municipality_id=b.municipality_id AND contract_status='ativo'
    ) THEN
      RAISE EXCEPTION 'Second QA municipality has an inactive existing contract';
    END IF;
    INSERT INTO public.processes
      (tenant_id,municipality_id,protocol_number,title,process_type,created_by_profile_id)
    VALUES(a.municipality_id,a.municipality_id,marker||'-A',marker||' PROCESSO A FICTÍCIO',
      'aprovacao_projeto',a.profile_id) RETURNING id INTO process_a;
    INSERT INTO public.processes
      (tenant_id,municipality_id,protocol_number,title,process_type,created_by_profile_id)
    VALUES(b.municipality_id,b.municipality_id,marker||'-B',marker||' PROCESSO B FICTÍCIO',
      'aprovacao_projeto',b.profile_id) RETURNING id INTO process_b;
    INSERT INTO public.urban_regulation_versions
      (municipality_id,zone_code,use_code,effective_from,version,status,rules,
       created_by_profile_id,activated_by_profile_id,activated_at)
    VALUES(a.municipality_id,marker,'QA_RES','2026-01-01',1,'active',
      '[{"metric":"front_setback_m","limit":5,"reference":"LEI FICTICIA QA SEM VALIDADE LEGAL"}]'::jsonb,
      a.profile_id,a.profile_id,now()) RETURNING id INTO regulation_a;
    INSERT INTO public.urban_regulation_versions
      (municipality_id,zone_code,use_code,effective_from,version,status,rules,
       created_by_profile_id,activated_by_profile_id,activated_at)
    VALUES(b.municipality_id,marker,'QA_RES','2026-01-01',1,'active',
      '[{"metric":"front_setback_m","limit":7,"reference":"LEI FICTICIA QA SEM VALIDADE LEGAL"}]'::jsonb,
      b.profile_id,b.profile_id,now()) RETURNING id INTO regulation_b;
    IF (SELECT count(DISTINCT coalesce(municipality_id,tenant_id))
        FROM public.processes WHERE id IN (process_a,process_b)) <> 2
      OR (SELECT count(DISTINCT municipality_id)
          FROM public.urban_regulation_versions WHERE id IN (regulation_a,regulation_b)) <> 2
    THEN RAISE EXCEPTION 'Falha ao validar dois municípios distintos'; END IF;
    verified := true;
    RAISE EXCEPTION 'QA_ROLLBACK_EXPECTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'QA_ROLLBACK_EXPECTED' THEN RAISE; END IF;
  END;
  IF NOT verified
    OR EXISTS(SELECT 1 FROM public.processes WHERE id IN (process_a,process_b))
    OR EXISTS(SELECT 1 FROM public.urban_regulation_versions WHERE id IN (regulation_a,regulation_b))
    OR EXISTS(SELECT 1 FROM public.client_plan_assignments WHERE billing_notes=marker||' CONTRATO FICTÍCIO SEM VALIDADE')
  THEN RAISE EXCEPTION 'Falha na reversão do teste QA'; END IF;
  RAISE NOTICE 'PASS: duas prefeituras, processos, leis e contrato temporário revertidos';
END $qa$;