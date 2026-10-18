-- SIGAPRO — fila técnica com distribuição segura por analista.
-- 1) Protocolo -> Análise entra como "distribuicao", ainda sem trabalho técnico.
-- 2) Analista assume atomicamente via start_process_analysis.
-- 3) Diretoria pode distribuir previamente para um analista sem marcar o trabalho como iniciado.

-- SIGAPRO — tramitação intersetorial canônica e protegida.
-- O despacho altera a unidade responsável, sem destruir o status real do workflow.
-- Protocolo -> Análise promove a etapa somente quando documentos e guia inicial estão válidos.

create or replace function public.create_process_dispatch(
  _process_id uuid,
  _from_department text,
  _to_department text,
  _subject text,
  _due_at timestamptz default null,
  _visibility text default 'interno',
  _priority text default 'media',
  _assigned_to text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
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

    if not _protocol_guide_paid then
      raise exception 'A Guia de Protocolo ainda não está compensada. Confirme o pagamento antes do encaminhamento.';
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



-- Distribuição inicial pela Diretoria: define um responsável sem iniciar
-- trabalho técnico. O analista só inicia ao assumir/abrir a análise, usando
-- start_process_analysis, que mantém a tomada atômica e evita trabalho duplicado.
create or replace function public.assign_process_analysis(
  _process_id uuid,
  _target_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
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

grant execute on function public.assign_process_analysis(uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
