-- SIGAPRO 2026-11-01: release gate shared by technical RPCs and document guards.
-- Signed-off workflow: initial guide compensation -> completed protocol triage
-- -> formal dispatch to Urban Analysis. Historic official processes are preserved.
CREATE OR REPLACE FUNCTION public.process_technical_release_verified_v1(_process_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
SET row_security TO 'off'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.processes p
    WHERE p.id = _process_id
      AND p.triage_status = 'concluido'
      AND (
        nullif(btrim(coalesce(p.pre_protocol_number,'')), '') IS NULL
        OR p.officialized_at IS NOT NULL
      )
      AND (
        EXISTS (
          SELECT 1 FROM public.interdepartmental_dispatches d
          WHERE d.process_id = p.id
            AND public.operational_area_from_label(d.to_department) = 'analise'
        )
        OR (
          p.created_at < TIMESTAMPTZ '2026-10-18 00:00:00+00'
          AND p.analysis_started_at IS NOT NULL
        )
      )
      AND EXISTS (
        SELECT 1 FROM public.payment_guides g
        WHERE g.process_id = p.id
          AND g.guide_kind = 'protocolo'
          AND (
            g.paid IS TRUE
            OR lower(coalesce(g.status,'')) IN ('compensada','confirmed','paid','pago','confirmado')
          )
      )
  );
$function$;

REVOKE ALL ON FUNCTION public.process_technical_release_verified_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_technical_release_verified_v1(uuid) TO authenticated;

-- Backend authorization contract: can_write_process_analysis(uuid)
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

-- Backend authorization contract: start_process_analysis(uuid)
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
$function$;

-- Backend authorization contract: assign_process_analysis(uuid,uuid)
CREATE OR REPLACE FUNCTION public.assign_process_analysis(_process_id uuid, _target_profile_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _actor uuid := public.current_profile_id();
  _process public.processes%rowtype;
  _target public.profiles%rowtype;
  _target_name text;
begin
  if _actor is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select * into _process
  from public.processes
  where id=_process_id
  for update;

  if _process.id is null then
    raise exception 'Processo não encontrado.';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  if not public.process_technical_release_verified_v1(_process_id) then
    raise exception 'Distribuição bloqueada: confirme o pagamento e conclua a triagem do Protocolo.';
  end if;

  if not (public.is_master() or public.can_supervise_process_analysis(_process_id)) then
    raise exception 'Somente a Diretoria da Análise pode distribuir processos.';
  end if;

  if public.operational_area_from_label(
       coalesce(_process.current_department,_process.current_queue,'')
     ) <> 'analise' then
    raise exception 'O processo ainda não está na fila da Análise Urbanística.';
  end if;

  if _process.status not in (
    'distribuicao'::public.process_status,
    'analise_tecnica'::public.process_status,
    'reapresentacao'::public.process_status
  ) then
    raise exception 'O processo não está disponível para distribuição na Análise.';
  end if;

  select * into _target
  from public.profiles p
  where p.id=_target_profile_id
    and p.deleted_at is null
    and p.account_status='active';

  if _target.id is null then
    raise exception 'Analista não encontrado ou inativo.';
  end if;

  if _target.role <> 'analista' then
    raise exception 'A responsabilidade técnica só pode ser atribuída a perfil Analista.';
  end if;

  if _target.municipality_id is distinct from _process.municipality_id then
    raise exception 'O analista pertence a outra Prefeitura.';
  end if;

  if public.profile_operational_area(_target.id) <> 'analise' then
    raise exception 'O analista não pertence à unidade de Urbanismo/Análise.';
  end if;

  _target_name := coalesce(nullif(btrim(_target.full_name),''),nullif(btrim(_target.email),''),'Analista');

  if _process.analysis_assigned_to_profile_id is not null
     and _process.analysis_assigned_to_profile_id <> _target.id then
    raise exception 'Este processo já está atribuído a outro analista. Use redistribuição auditada.';
  end if;

  if _process.analysis_assigned_to_profile_id = _target.id then
    return jsonb_build_object(
      'process_id',_process_id,
      'assigned_profile_id',_target.id,
      'assigned_to',_target_name,
      'status',_process.status::text,
      'existing',true
    );
  end if;

  update public.processes
     set analysis_assigned_to_profile_id=_target.id,
         analysis_assigned_to=_target_name,
         process_checkpoint='Distribuído para '||_target_name||' — aguardando início da análise',
         updated_at=clock_timestamp()
   where id=_process_id;

  insert into public.process_audit_entries(
    tenant_id,process_id,category,title,detail,visible_to_external,
    created_at,municipality_id,actor_profile_id
  )
  values(
    _process.tenant_id,_process_id,'supervisao','Processo distribuído para análise',
    'Responsabilidade inicial atribuída a '||_target_name||
      '. O trabalho técnico ainda aguarda o analista iniciar a análise.',
    false,clock_timestamp(),_process.municipality_id,_actor
  );

  perform public.enqueue_notification_v1(
    _target.id,
    'Nova análise atribuída',
    coalesce(nullif(btrim(_process.protocol_number),''),'Processo')||
      ' foi distribuído para você. Abra a fila da Análise para iniciar o trabalho técnico.',
    'tramite',
    _process_id,
    '/processos/'||_process_id::text,
    'analise',
    'normal',
    _actor,
    'analysis:assigned:'||_process_id::text,
    jsonb_build_object('assigned_to',_target_name,'stage','distribuicao')
  );

  return jsonb_build_object(
    'process_id',_process_id,
    'assigned_profile_id',_target.id,
    'assigned_to',_target_name,
    'status',(select status::text from public.processes where id=_process_id),
    'existing',false
  );
end;
$function$;

-- Backend authorization contract: create_process_dispatch(uuid,text,text,text,timestamp with time zone,text,text,text)
CREATE OR REPLACE FUNCTION public.create_process_dispatch(_process_id uuid, _from_department text, _to_department text, _subject text, _due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, _visibility text DEFAULT 'interno'::text, _priority text DEFAULT 'media'::text, _assigned_to text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _profile public.profiles%rowtype;
  _process public.processes%rowtype;
  _destination public.departments%rowtype;
  _origin_department text;
  _origin_area text;
  _destination_area text;
  _actor_area text;
  _actor_role text;
  _next_status public.process_status;
  _next_triage_status text;
  _protocol_guide_paid boolean := false;
  _required_missing boolean := false;
  _dispatch public.interdepartmental_dispatches%rowtype;
  _movement public.process_movements%rowtype;
  _audit public.process_audit_entries%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuário não autenticado ou sem perfil.';
  end if;

  if nullif(btrim(_to_department),'') is null
     or nullif(btrim(_subject),'') is null then
    raise exception 'Destino e assunto do encaminhamento são obrigatórios.';
  end if;

  if _visibility not in ('interno','externo','misto') then
    raise exception 'Visibilidade inválida.';
  end if;

  if _priority not in ('baixa','media','alta','critica') then
    raise exception 'Prioridade inválida.';
  end if;

  select * into _profile
  from public.profiles
  where id=_profile_id
    and deleted_at is null
    and account_status='active';

  select * into _process
  from public.processes
  where id=_process_id
  for update;

  if _process.id is null then
    raise exception 'Processo não encontrado.';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  if not (public.is_master() or public.is_internal_municipality_role()) then
    raise exception 'Sem permissão para encaminhar processo.';
  end if;

  _actor_role := lower(coalesce(public.current_role_code(),_profile.role,''));
  _origin_department := coalesce(
    nullif(btrim(_process.current_department),''),
    nullif(btrim(_process.current_queue),''),
    nullif(btrim(_from_department),''),
    'Unidade não informada'
  );
  _origin_area := public.operational_area_from_label(_origin_department);
  _actor_area := public.profile_operational_area(_profile_id);

  if not public.is_master()
     and _actor_role not in ('prefeitura_admin','prefeitura_supervisor','admin_municipality')
     and coalesce(_origin_area,'') <> ''
     and coalesce(_actor_area,'') <> coalesce(_origin_area,'') then
    raise exception 'Somente a unidade responsável pela etapa atual pode encaminhar este processo.';
  end if;

  select d.* into _destination
  from public.departments d
  where d.municipality_id=coalesce(_process.municipality_id,_process.tenant_id)
    and d.is_active=true
    and (
      lower(btrim(d.name))=lower(btrim(_to_department))
      or lower(btrim(coalesce(d.code,'')))=lower(btrim(_to_department))
    )
  order by
    case when lower(btrim(d.name))=lower(btrim(_to_department)) then 0 else 1 end,
    d.sort_order,
    d.name
  limit 1;

  if _destination.id is null then
    raise exception 'O destino selecionado não pertence ao organograma ativo desta Prefeitura.';
  end if;

  if lower(btrim(_origin_department))=lower(btrim(_destination.name)) then
    raise exception 'O destino selecionado já é a unidade atual do processo.';
  end if;

  if exists (
    select 1
    from public.interdepartmental_dispatches d
    where d.process_id=_process_id
      and d.status in ('aguardando','respondido')
      and lower(btrim(d.to_department))=lower(btrim(_destination.name))
  ) then
    raise exception 'Já existe um encaminhamento ativo deste processo para esta unidade.';
  end if;

  _destination_area := public.operational_area_from_label(_destination.name);
  _next_status := _process.status;
  _next_triage_status := _process.triage_status;

  -- Entrada oficial do Protocolo na fila de distribuição da Análise.
  -- Não cria um status paralelo de "despacho_intersetorial"; preserva o workflow real.
  if coalesce(_origin_area,'')='protocolos'
     and coalesce(_destination_area,'')='analise' then

    select exists (
      select 1
      from public.payment_guides g
      where g.process_id=_process_id
        and coalesce(g.guide_kind,'protocolo')='protocolo'
        and (
          coalesce(g.paid,false)=true
          or lower(coalesce(g.status,'')) in ('compensada','confirmed','paid','pago','confirmado')
        )
    ) into _protocol_guide_paid;

    select exists (
      select 1
      from public.process_documents doc
      where doc.process_id=_process_id
        and coalesce(doc.is_required,false)=true
        and (
          nullif(btrim(coalesce(doc.file_path,'')),'') is null
          and nullif(btrim(coalesce(doc.preview_url,'')),'') is null
        )
    ) into _required_missing;

    if _required_missing then
      raise exception 'Existem documentos obrigatórios pendentes. Conclua a entrega documental antes do encaminhamento.';
    end if;

    -- Não considerar lista vazia de documentos como "nenhuma pendência".
    -- Para aprovação, exigir os quatro tipos mínimos, cada um com anexo real.
    -- Habite-se possui documentos próprios e não usa as quatro categorias da aprovação.
    if lower(coalesce(_process.process_type,'')) like '%habite%' then
      if not exists (
        select 1 from public.process_documents d
        where d.process_id = _process_id
          and d.is_required is true
          and (
            nullif(btrim(coalesce(d.file_path,'')),'') is not null
            or nullif(btrim(coalesce(d.preview_url,'')),'') is not null
          )
      ) then
        raise exception 'Habite-se: anexe a documentação obrigatória antes do encaminhamento.';
      end if;
    elsif lower(coalesce(_process.process_type,'')) ~ '(aprov|licenciament|arquitet|projeto)' then
      if (
        select count(distinct case
          when lower(d.title) ~ 'projeto arquitet[oô]nico' then 'projeto'
          when lower(d.title) ~ 'memorial descritivo' then 'memorial'
          when lower(d.title) ~ 'art|rrt' then 'art_rrt'
          when lower(d.title) ~ 'matr[ií]cula|escritura' then 'matricula'
          else null
        end)
        from public.process_documents d
        where d.process_id = _process_id
          and d.is_required is true
          and (
            nullif(btrim(coalesce(d.file_path,'')),'') is not null
            or nullif(btrim(coalesce(d.preview_url,'')),'') is not null
          )
      ) < 4 then
        raise exception 'Anexe os quatro documentos mínimos: Projeto Arquitetônico, Memorial Descritivo, ART/RRT e Escritura/Matrícula.';
      end if;
    elsif not exists (
      select 1 from public.process_documents d
      where d.process_id=_process_id
        and (
          nullif(btrim(coalesce(d.file_path,'')),'') is not null
          or nullif(btrim(coalesce(d.preview_url,'')),'') is not null
        )
    ) then
      raise exception 'Inclua e confira os documentos pertinentes a este serviço antes do despacho.';
    end if;

    if not _protocol_guide_paid then
      raise exception 'A Guia de Protocolo ainda não está compensada. Confirme o pagamento antes do encaminhamento.';
    end if;

    if coalesce(_process.triage_status,'recebido') <> 'concluido' then
      raise exception 'Conclua a triagem documental antes de encaminhar para a Análise Urbanística.';
    end if;

    _next_status := 'distribuicao'::public.process_status;
    _next_triage_status := 'concluido';
  end if;

  insert into public.interdepartmental_dispatches(
    tenant_id,process_id,from_department,to_department,subject,due_at,
    created_by,created_at,visibility,municipality_id,created_by_profile_id,
    status,priority,assigned_to
  )
  values(
    _process.tenant_id,_process_id,_origin_department,_destination.name,
    btrim(_subject),_due_at,_legacy_user_id,clock_timestamp(),_visibility,
    _process.municipality_id,_profile_id,'aguardando',_priority,
    nullif(btrim(_assigned_to),'')
  )
  returning * into _dispatch;

  update public.processes
  set status=_next_status,
      triage_status=_next_triage_status,
      current_department=_destination.name,
      current_queue=_destination.name,
      sla_stage=case
        when coalesce(_origin_area,'')='protocolos'
         and coalesce(_destination_area,'')='analise'
          then 'Aguardando distribuição na Análise Urbanística'
        else sla_stage
      end,
      process_checkpoint=case
        when coalesce(_origin_area,'')='protocolos'
         and coalesce(_destination_area,'')='analise'
          then 'Recebido na Análise Urbanística — aguardando distribuição'
        else process_checkpoint
      end,
      updated_at=clock_timestamp()
  where id=_process_id;

  insert into public.process_movements(
    tenant_id,process_id,actor_user_id,movement_type,
    from_status,to_status,description,created_at,
    visible_to_external,municipality_id,actor_profile_id
  )
  values(
    _process.tenant_id,_process_id,_legacy_user_id,'dispatch',
    _process.status,_next_status,
    btrim(_subject)||' — '||_origin_department||' → '||_destination.name,
    clock_timestamp(),(_visibility<>'interno'),_process.municipality_id,_profile_id
  )
  returning * into _movement;

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,category,title,detail,
    visible_to_external,created_at,municipality_id,actor_profile_id
  )
  values(
    _process.tenant_id,_process_id,_legacy_user_id,'despacho',
    'Processo encaminhado',
    'Encaminhamento oficial de '||_origin_department||' para '||_destination.name||
      '. Assunto: '||btrim(_subject)||'.',
    (_visibility<>'interno'),clock_timestamp(),_process.municipality_id,_profile_id
  )
  returning * into _audit;

  return jsonb_build_object(
    'ok',true,
    'process_id',_process_id,
    'from_department',_origin_department,
    'to_department',_destination.name,
    'previous_status',_process.status::text,
    'current_status',_next_status::text,
    'dispatch',to_jsonb(_dispatch),
    'movement',to_jsonb(_movement),
    'audit',to_jsonb(_audit)
  );
end;
$function$;


-- Signed private document URLs cannot bypass the same release gate as the UI.
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
  IF _role IN ('analista','analyst','prefeitura_supervisor')
     AND public.profile_operational_area(_actor)='analise' THEN
    RETURN public.process_technical_release_verified_v1(_process_id);
  END IF;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.authorize_technical_document_signing_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authorize_technical_document_signing_v1(uuid) TO authenticated;

-- Narrow recovery for an official QA/municipal case incorrectly advanced to
-- technical analysis without completing triage. Never overwrite payment or files.
-- All permitted transitions require an authenticated municipal administrator,
-- an explicit reason and an audit record created in the same transaction.
CREATE OR REPLACE FUNCTION public.guard_analysis_process_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
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
    AND NOT public.can_write_process_analysis(OLD.id) THEN

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

CREATE OR REPLACE FUNCTION public.reconcile_unreleased_process_triage_v1(
  _process_id uuid, _reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
SET row_security TO 'off'
AS $function$
DECLARE
  _actor uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _process public.processes%rowtype;
  _reason_text text := btrim(coalesce(_reason,''));
BEGIN
  IF _actor IS NULL OR NOT (public.is_master() OR lower(coalesce(public.current_role_code(),''))='prefeitura_admin') THEN
    RAISE EXCEPTION 'Somente o administrador municipal pode solicitar a correção da etapa.';
  END IF;
  IF length(_reason_text) < 15 THEN
    RAISE EXCEPTION 'Justifique a correção em ao menos 15 caracteres.';
  END IF;
  SELECT * INTO _process FROM public.processes WHERE id=_process_id FOR UPDATE;
  IF _process.id IS NULL OR NOT public.has_process_access(_process_id) THEN
    RAISE EXCEPTION 'Processo não encontrado ou fora do escopo da Prefeitura.';
  END IF;
  IF _process.officialized_at IS NULL
    OR _process.status NOT IN ('analise_tecnica'::public.process_status,'distribuicao'::public.process_status)
    OR _process.triage_status NOT IN ('recebido','em_triagem')
    OR EXISTS (
      SELECT 1 FROM public.interdepartmental_dispatches d
      WHERE d.process_id=_process_id AND public.operational_area_from_label(d.to_department)='analise'
    )
    OR EXISTS (SELECT 1 FROM public.process_analysis_sheets a WHERE a.process_id=_process_id)
    OR EXISTS (SELECT 1 FROM public.process_requirements r WHERE r.process_id=_process_id)
  THEN
    RAISE EXCEPTION 'Este processo não pode retornar automaticamente. Solicite revisão administrativa do histórico e documentos.';
  END IF;

  INSERT INTO public.process_audit_entries(
    tenant_id, process_id, category, title, detail, visible_to_external,
    municipality_id, actor_profile_id, actor_user_id
  ) VALUES (
    _process.tenant_id, _process_id, 'sistema',
    'Correção administrativa da triagem autorizada',
    'Reconciliação auditada: '||_reason_text||
    '. Etapa anterior: '||_process.status::text||
    '. Documentos, guias financeiras e histórico preservados.',
    false, _process.municipality_id, _actor, _legacy_user_id
  );

  UPDATE public.processes SET
    status='triagem'::public.process_status,
    current_department='Setor de Protocolo',
    current_queue='Triagem de Protocolo',
    sla_stage='Triagem documental pendente',
    process_checkpoint='Retornado à Triagem com auditoria',
    triage_notes='Correção administrativa auditada: '||_reason_text,
    analysis_assigned_to=NULL,
    analysis_assigned_to_profile_id=NULL,
    analysis_started_at=NULL,
    updated_at=clock_timestamp()
  WHERE id=_process_id;

  INSERT INTO public.process_movements(
    tenant_id,process_id,movement_type,from_status,to_status,description,
    visible_to_external,municipality_id,actor_profile_id,actor_user_id
  ) VALUES (
    _process.tenant_id,_process_id,'status_change',_process.status,
    'triagem'::public.process_status,
    'Reconciliação de fluxo pelo administrador municipal: '||_reason_text,
    false,_process.municipality_id,_actor,_legacy_user_id
  );

  RETURN jsonb_build_object('ok',true,'process_id',_process_id,
    'previous_status',_process.status::text,'status','triagem',
    'triage_status',_process.triage_status,
    'payment_modified',false,'documents_modified',false);
END;
$function$;

REVOKE ALL ON FUNCTION public.reconcile_unreleased_process_triage_v1(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_unreleased_process_triage_v1(uuid,text) TO authenticated;
