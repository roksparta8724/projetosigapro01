-- SIGAPRO QA 2026-11-05 | Correção da atribuição inicial de analista.
-- Problema: guard_analysis_process_update() nega o próprio RPC start_process_analysis()
-- porque OLD.analysis_assigned_to_profile_id é NULL, impedindo bootstrap autorizado.
-- Preserva verificação municipal, status, guia, triagem, ator e histórico.
-- Não aplicar na branch Neon production antes dos gates da release.
-- A exceção só vale para a transição exata, com contexto transacional criado pelo RPC.
CREATE OR REPLACE FUNCTION public.start_process_analysis(_process_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _tenant_id uuid;
  _municipality_id uuid;
  _from_status public.process_status;
  _existing_assignee uuid;
  _existing_started_at timestamptz;
  _analyst_name text;
  _movement public.process_movements%rowtype;
  _audit public.process_audit_entries%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  select p.tenant_id,
         p.municipality_id,
         p.status,
         p.analysis_assigned_to_profile_id,
         p.analysis_started_at
    into _tenant_id,
         _municipality_id,
         _from_status,
         _existing_assignee,
         _existing_started_at
  from public.processes p
  where p.id = _process_id
  for update;

  if _tenant_id is null then
    raise exception 'Processo nao encontrado';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  if not (public.is_master() or public.is_internal_municipality_role()) then
    raise exception 'Sem permissao para iniciar analise';
  end if;

  if not public.process_technical_release_verified_v1(_process_id)
     or not public.process_is_in_analysis_area(_process_id) then
    raise exception 'Análise bloqueada: guia inicial, triagem e encaminhamento devem estar concluídos.';
  end if;

  if not public.is_master()
     and (
       lower(coalesce(public.current_role_code(),'')) not in ('analista','analyst')
       or public.profile_operational_area(_profile_id) <> 'analise'
     ) then
    raise exception 'Somente o Analista da Análise Urbanística pode iniciar a análise.';
  end if;

  if _from_status not in (
    'distribuicao'::public.process_status,
    'analise_tecnica'::public.process_status,
    'reapresentacao'::public.process_status
  ) then
    raise exception 'Processo nao esta disponivel para inicio da analise';
  end if;

  select coalesce(nullif(btrim(p.full_name),''), nullif(btrim(p.email),''), 'Analista')
    into _analyst_name
  from public.profiles p
  where p.id = _profile_id
    and p.deleted_at is null;

  _analyst_name := coalesce(_analyst_name, 'Analista');

  if _existing_assignee is not null
     and _existing_assignee <> _profile_id then
    raise exception 'Processo ja esta em analise por outro usuario';
  end if;

  if _existing_assignee = _profile_id
     and _existing_started_at is not null
     and _from_status = 'analise_tecnica'::public.process_status then
    return jsonb_build_object(
      'process_id', _process_id,
      'status', 'analise_tecnica',
      'assigned_to', _analyst_name,
      'assigned_to_profile_id', _profile_id,
      'started_at', _existing_started_at,
      'existing', true
    );
  end if;

  -- Chave local à transação: apenas o RPC validado pode iniciar a atribuição
  -- inicial. O gatilho confere o ator, a Prefeitura e a transição exata.
  perform set_config('sigapro.analysis_start_process_id', _process_id::text, true);

  update public.processes
     set status = 'analise_tecnica'::public.process_status,
         current_department = 'Análise Urbanística',
         current_queue = 'Análise Urbanística',
         sla_stage = 'Análise Urbanística em andamento',
         process_checkpoint = 'Análise Urbanística em andamento',
         analysis_assigned_to = _analyst_name,
         analysis_assigned_to_profile_id = _profile_id,
         analysis_started_at = coalesce(analysis_started_at, now()),
         sla_breached = false,
         updated_at = now()
   where id = _process_id;

  -- Nunca manter o contexto excepcional após a atualização autorizada.
  perform set_config('sigapro.analysis_start_process_id', '', true);

  if _from_status <> 'analise_tecnica'::public.process_status then
    insert into public.process_movements(
      tenant_id, process_id, actor_user_id, movement_type,
      from_status, to_status, description, created_at,
      visible_to_external, municipality_id, actor_profile_id
    )
    values(
      _tenant_id, _process_id, _legacy_user_id, 'status_change',
      _from_status, 'analise_tecnica'::public.process_status,
      'Análise Urbanística iniciada por ' || _analyst_name || '.',
      now(), true, _municipality_id, _profile_id
    )
    returning * into _movement;
  end if;

  insert into public.process_audit_entries(
    tenant_id, process_id, actor_user_id, category, title, detail,
    visible_to_external, created_at, municipality_id, actor_profile_id
  )
  values(
    _tenant_id, _process_id, _legacy_user_id, 'status',
    'Análise Urbanística iniciada',
    'Processo assumido por ' || _analyst_name || ' para análise urbanística.',
    true, now(), _municipality_id, _profile_id
  )
  returning * into _audit;

  return jsonb_build_object(
    'process_id', _process_id,
    'status', 'analise_tecnica',
    'assigned_to', _analyst_name,
    'assigned_to_profile_id', _profile_id,
    'started_at', (select analysis_started_at from public.processes where id = _process_id),
    'existing', false,
    'movement', case when _movement.id is null then null else to_jsonb(_movement) end,
    'audit', to_jsonb(_audit)
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.guard_analysis_process_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
BEGIN
  IF public.current_profile_id() IS NOT NULL
    AND public.process_is_in_analysis_area(OLD.id)
    AND (
      NEW.status IS DISTINCT FROM OLD.status
      OR NEW.current_department IS DISTINCT FROM OLD.current_department
      OR NEW.current_queue IS DISTINCT FROM OLD.current_queue
      OR NEW.analysis_assigned_to_profile_id IS DISTINCT FROM OLD.analysis_assigned_to_profile_id
    )
    AND NOT public.can_write_process_analysis(OLD.id)
    AND NOT (
      -- Exceção mínima para o início por RPC: antes da primeira atribuição,
      -- can_write_process_analysis(OLD.id) corretamente retorna false.
      -- Nenhum UPDATE direto fora da transação autenticada recebe esse contexto.
      current_setting('sigapro.analysis_start_process_id', true) = OLD.id::text
      AND OLD.status IN ('distribuicao'::public.process_status, 'reapresentacao'::public.process_status)
      AND OLD.analysis_assigned_to_profile_id IS NULL
      AND OLD.analysis_started_at IS NULL
      AND NEW.status = 'analise_tecnica'::public.process_status
      AND NEW.analysis_assigned_to_profile_id = public.current_profile_id()
      AND NEW.analysis_started_at IS NOT NULL
      AND NEW.current_department = 'Análise Urbanística'
      AND NEW.current_queue = 'Análise Urbanística'
      AND NEW.municipality_id IS NOT DISTINCT FROM OLD.municipality_id
      AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
      AND NEW.triage_status IS NOT DISTINCT FROM OLD.triage_status
      AND lower(coalesce(public.current_role_code(),'')) IN ('analista','analyst')
      AND public.profile_operational_area(public.current_profile_id()) = 'analise'
      AND EXISTS (
        SELECT 1 FROM public.profiles a
        WHERE a.id = public.current_profile_id()
          AND a.account_status = 'active'
          AND a.deleted_at IS NULL
          AND a.municipality_id = coalesce(OLD.municipality_id, OLD.tenant_id)
      )
      AND public.process_technical_release_verified_v1(OLD.id)
      AND public.process_is_in_analysis_area(OLD.id)
    ) THEN

    IF (public.is_master() OR lower(coalesce(public.current_role_code(),''))='prefeitura_admin')
      AND OLD.status IN ('analise_tecnica'::public.process_status,'distribuicao'::public.process_status)
      AND OLD.triage_status IN ('recebido','em_triagem')
      AND NEW.triage_status IS NOT DISTINCT FROM OLD.triage_status
      AND NEW.status = 'triagem'::public.process_status
      AND NEW.current_department = 'Setor de Protocolo'
      AND NEW.current_queue = 'Triagem de Protocolo'
      AND NEW.analysis_assigned_to_profile_id IS NULL
      AND NEW.analysis_started_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.interdepartmental_dispatches d
        WHERE d.process_id=OLD.id AND public.operational_area_from_label(d.to_department)='analise'
      )
      AND NOT EXISTS (SELECT 1 FROM public.process_analysis_sheets a WHERE a.process_id=OLD.id)
      AND NOT EXISTS (SELECT 1 FROM public.process_requirements r WHERE r.process_id=OLD.id)
      AND EXISTS (
        SELECT 1 FROM public.process_audit_entries a
        WHERE a.process_id=OLD.id
          AND a.category='sistema'
          AND a.title='Correção administrativa da triagem autorizada'
          AND a.actor_profile_id=public.current_profile_id()
          AND a.created_at >= clock_timestamp()-INTERVAL '30 seconds'
      ) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Somente a equipe da Análise Urbanística desta Prefeitura pode alterar o fluxo desta etapa.';
  END IF;
  RETURN NEW;
END;
$function$

