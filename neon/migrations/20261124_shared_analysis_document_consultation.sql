-- Separate authorized document consultation from shared technical editing.
-- Formal signature ownership and assignment mutation remain protected.
BEGIN;
CREATE OR REPLACE FUNCTION public.can_sign_assigned_analysis_v1(_process_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _actor uuid := public.current_profile_id();
  _actor_role text := lower(coalesce(public.current_role_code(),''));
  _actor_municipality uuid;
  _actor_name text;
  _actor_area text;
  _process public.processes%rowtype;
  _assigned_name text;
begin
  -- Never permit editing technical artifacts on an unpaid / unfinished protocol,
  -- including for master accounts and stale analyst assignments.
  if not public.process_technical_release_verified_v1(_process_id) then
    return false;
  end if;
  if public.is_master() then return true; end if;
  if _actor is null then return false; end if;

  select p.municipality_id,
         lower(btrim(coalesce(p.full_name,'')))
    into _actor_municipality,_actor_name
  from public.profiles p
  where p.id=_actor
    and p.deleted_at is null
    and p.account_status='active';

  if _actor_municipality is null then return false; end if;

  select * into _process
  from public.processes
  where id=_process_id;

  if _process.id is null then return false; end if;

  if _actor_municipality is distinct from coalesce(_process.municipality_id,_process.tenant_id) then
    return false;
  end if;

  _actor_area := public.profile_operational_area(_actor);

  -- A Diretoria de Urbanismo pode supervisionar e retificar.
  if _actor_role='prefeitura_supervisor' and _actor_area='analise' then
    return true;
  end if;

  if _actor_role not in ('analista','analyst') or _actor_area<>'analise' then
    return false;
  end if;

  -- Quando existe vínculo por profile_id, ele é a fonte de verdade. Assim,
  -- ao redistribuir o processo o antigo Analista perde acesso no mesmo instante.
  if _process.analysis_assigned_to_profile_id is not null then
    return _process.analysis_assigned_to_profile_id=_actor;
  end if;

  -- Compatibilidade apenas para processos antigos sem profile_id.
  _assigned_name := lower(btrim(coalesce(_process.analysis_assigned_to,'')));
  return _assigned_name<>'' and _actor_name<>'' and _assigned_name=_actor_name;
end;
$function$;

CREATE OR REPLACE FUNCTION public.can_write_process_analysis(_process_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _actor uuid := public.current_profile_id();
  _actor_role text := lower(coalesce(public.current_role_code(),''));
  _actor_municipality uuid;
  _actor_name text;
  _actor_area text;
  _process public.processes%rowtype;
  _assigned_name text;
begin
  -- Never permit editing technical artifacts on an unpaid / unfinished protocol,
  -- including for master accounts and stale analyst assignments.
  if not public.process_technical_release_verified_v1(_process_id) then
    return false;
  end if;
  if public.is_master() then return true; end if;
  if _actor is null then return false; end if;

  select p.municipality_id,
         lower(btrim(coalesce(p.full_name,'')))
    into _actor_municipality,_actor_name
  from public.profiles p
  where p.id=_actor
    and p.deleted_at is null
    and p.account_status='active';

  if _actor_municipality is null then return false; end if;

  select * into _process
  from public.processes
  where id=_process_id;

  if _process.id is null then return false; end if;

  if _actor_municipality is distinct from coalesce(_process.municipality_id,_process.tenant_id) then
    return false;
  end if;

  _actor_area := public.profile_operational_area(_actor);

  -- A Diretoria de Urbanismo pode supervisionar e retificar.
  if _actor_role='prefeitura_supervisor' and _actor_area='analise' then
    return true;
  end if;

  if _actor_role not in ('analista','analyst') or _actor_area<>'analise' then
    return false;
  end if;

  -- Shared technical work is restricted to the current Analysis area.
  if public.process_is_in_analysis_area(_process_id) then return true; end if;

  -- Historical assigned-author access remains unchanged.
  -- Quando existe vínculo por profile_id, ele é a fonte de verdade. Assim,
  -- ao redistribuir o processo o antigo Analista perde acesso no mesmo instante.
  if _process.analysis_assigned_to_profile_id is not null then
    return _process.analysis_assigned_to_profile_id=_actor;
  end if;

  -- Compatibilidade apenas para processos antigos sem profile_id.
  _assigned_name := lower(btrim(coalesce(_process.analysis_assigned_to,'')));
  return _assigned_name<>'' and _actor_name<>'' and _assigned_name=_actor_name;
end;
$function$;

CREATE OR REPLACE FUNCTION public.authorize_technical_document_signing_v1(_document_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  _process_id uuid;
  _actor uuid := public.current_profile_id();
  _role text := lower(coalesce(public.current_role_code(),''));
BEGIN
  IF _actor IS NULL THEN RETURN false; END IF;
  SELECT d.process_id INTO _process_id FROM public.process_documents d WHERE d.id=_document_id;
  IF _process_id IS NULL OR NOT public.has_process_access(_process_id) THEN
    RETURN false;
  END IF;
  -- Signed GET authorizes consultation, not technical alteration.
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_process_artifact_signature_context_v1(_process_id uuid, _signer_slot text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _profile public.profiles%rowtype;
  _process public.processes%rowtype;
  _role text;
  _position text;
  _registration text;
  _slot text := lower(btrim(coalesce(_signer_slot,'')));
  _allowed boolean := false;
begin
  if _slot not in ('analise_tecnica','conferencia_fiscal','diretoria','secretaria','profissional') then
    raise exception 'Tipo de assinatura inválido.';
  end if;

  select * into _profile
  from public.profiles
  where id=public.current_profile_id()
    and deleted_at is null
    and account_status='active';

  if _profile.id is null then
    raise exception 'Perfil autenticado inválido.';
  end if;

  select * into _process
  from public.processes
  where id=_process_id;

  if _process.id is null or not public.has_process_access(_process.id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  _role := lower(coalesce(public.current_role_code(),_profile.role,''));

  select coalesce(
      nullif(btrim(tm.position_title),''),
      nullif(btrim(tm.profile_label),''),
      nullif(btrim(r.label),'')
    )
    into _position
  from public.tenant_memberships tm
  left join public.roles r on r.id=tm.role_id
  where tm.profile_id=_profile.id
    and tm.tenant_id=_process.tenant_id
    and tm.is_active=true
    and tm.deleted_at is null
  order by tm.updated_at desc nulls last,tm.created_at desc nulls last
  limit 1;

  _position := coalesce(_position,nullif(btrim(_profile.professional_type),''),_role);
  _registration := nullif(btrim(_profile.registration_number),'');

  if _slot='analise_tecnica' then
    -- A assinatura técnica pertence ao Analista responsável atual. A Diretoria
    -- assina no slot próprio "diretoria", nunca se passando pelo Analista.
    _allowed :=
      public.is_master()
      or (
        _role in ('analista','analyst')
        and public.can_sign_assigned_analysis_v1(_process_id)
      );
  elsif _slot='conferencia_fiscal' then
    _allowed :=
      _role in ('master_admin','master_ops','prefeitura_admin','prefeitura_supervisor','fiscal')
      or lower(coalesce(_position,'')) ~ '(fiscal|diretor|diretora|secret[aá]ri)';
  elsif _slot='diretoria' then
    _allowed :=
      replace(lower(coalesce(_profile.tipo,'')),'''','') <> 'externo'
      and _role not in ('profissional_externo','professional_external','professional','profissional')
      and (
        _role in ('diretor','director','prefeitura_diretor','prefeitura_diretora')
        or lower(coalesce(_position,'')) ~ '(diretor|diretora)'
      );
  elsif _slot='secretaria' then
    _allowed :=
      replace(lower(coalesce(_profile.tipo,'')),'''','') <> 'externo'
      and _role not in ('profissional_externo','professional_external','professional','profissional')
      and (
        _role in ('secretario','secretaria','secretary','prefeitura_secretario','prefeitura_secretaria')
        or lower(coalesce(_position,'')) ~ '(secret[aá]ri)'
      );
  elsif _slot='profissional' then
    _allowed := _role in ('profissional_externo','professional_external','professional','profissional');
  end if;

  if not _allowed then
    if _slot='analise_tecnica' then
      raise exception 'Somente o Analista responsável atual pode registrar a assinatura técnica desta versão.';
    end if;
    raise exception 'Este perfil não possui atribuição para esta assinatura.';
  end if;

  return jsonb_build_object(
    'auth_subject',public.current_auth_subject(),
    'profile_id',_profile.id,
    'user_id',_profile.user_id,
    'email',lower(coalesce(_profile.email,'')),
    'name',coalesce(nullif(btrim(_profile.full_name),''),_profile.email,'Usuário'),
    'role',_role,
    'title',_position,
    'registration',_registration,
    'signer_slot',_slot,
    'process_id',_process.id,
    'tenant_id',_process.tenant_id,
    'municipality_id',_process.municipality_id,
    'protocol_number',_process.protocol_number,
    'process_title',_process.title
  );
end;
$function$;

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
    AND (
      NOT public.can_write_process_analysis(OLD.id)
      OR (NEW.analysis_assigned_to_profile_id IS DISTINCT FROM OLD.analysis_assigned_to_profile_id
          AND NOT public.is_master()
          AND lower(coalesce(public.current_role_code(),'')) IN ('analista','analyst'))
    )
    AND NOT COALESCE((
      -- Exceção mínima para o início por RPC: antes da primeira atribuição,
      -- can_write_process_analysis(OLD.id) corretamente retorna false.
      -- Nenhum UPDATE direto fora da transação autenticada recebe esse contexto.
      coalesce(current_setting('sigapro.analysis_start_process_id', true),'') = OLD.id::text
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
    ), false) THEN

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
$function$;
REVOKE ALL ON FUNCTION public.can_sign_assigned_analysis_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_sign_assigned_analysis_v1(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
