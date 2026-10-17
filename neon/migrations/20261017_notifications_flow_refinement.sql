-- Refinamento do roteamento da Central de Notificações.

create or replace function public.trg_notify_process_flow_v1()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _municipality uuid;
  _area text;
  _source uuid := public.current_profile_id();
  _url text;
  _area_notified boolean := false;
begin
  _municipality := coalesce(new.municipality_id,new.tenant_id);
  _url := '/processos/'||new.id::text;

  if tg_op='INSERT' then
    if new.status::text <> 'rascunho' then
      perform public.notify_municipal_area_v1(
        _municipality,'protocolos',
        'Novo protocolo recebido',
        'O processo '||new.protocol_number||' entrou na fila de Protocolo.',
        'protocolo',new.id,_url,'protocolo','normal',_source,
        'process:new:'||new.id::text
      );
    end if;
    return new;
  end if;

  if new.analysis_assigned_to_profile_id is distinct from old.analysis_assigned_to_profile_id
     and new.analysis_assigned_to_profile_id is not null then
    perform public.enqueue_notification_v1(
      new.analysis_assigned_to_profile_id,
      'Nova análise atribuída',
      'O processo '||new.protocol_number||' foi atribuído a você para análise técnica.',
      'analise',new.id,_url||'?aba=analise','analise','alta',_source,
      'analysis-assigned:'||new.id::text||':'||new.analysis_assigned_to_profile_id::text,
      '{}'::jsonb
    );
  end if;

  if new.current_department is distinct from old.current_department
     or new.current_queue is distinct from old.current_queue then
    _area := public.operational_area_from_label(
      coalesce(nullif(new.current_department,''),nullif(new.current_queue,''))
    );

    if _area in ('protocolos','analise','financeiro') then
      perform public.notify_municipal_area_v1(
        _municipality,_area,
        'Processo recebido no setor',
        'O processo '||new.protocol_number||' foi encaminhado para '||
          coalesce(nullif(new.current_department,''),nullif(new.current_queue,''),_area)||'.',
        'tramite',new.id,_url,'tramite','normal',_source,
        'process-area:'||new.id::text||':'||coalesce(_area,'')
      );
      _area_notified := true;
    end if;
  end if;

  if new.status is distinct from old.status then
    perform public.notify_process_owner_v1(
      new.id,
      'Atualização do processo',
      'O processo '||new.protocol_number||' avançou para a etapa '||replace(new.status::text,'_',' ')||'.',
      'processo',_url,'processo','normal',_source,
      'process-status:'||new.id::text||':'||new.status::text
    );

    if not _area_notified then
      _area := public.operational_area_from_label(
        coalesce(nullif(new.current_department,''),nullif(new.current_queue,''))
      );

      if _area not in ('protocolos','analise','financeiro') then
        _area := case
          when new.status::text in ('protocolo','triagem','pendencia_documental')
            then 'protocolos'
          when new.status::text in ('guia_emitida','pagamento_pendente','pagamento_confirmado')
            then 'financeiro'
          when new.status::text in (
            'distribuicao','analise_tecnica','exigencia','reapresentacao',
            'deferido','indeferido'
          )
            then 'analise'
          else ''
        end;
      end if;

      if _area in ('protocolos','analise','financeiro') then
        perform public.notify_municipal_area_v1(
          _municipality,_area,
          'Etapa do processo atualizada',
          'O processo '||new.protocol_number||' está agora em '||
            replace(new.status::text,'_',' ')||'.',
          'processo',new.id,_url,'processo','normal',_source,
          'process-status-area:'||new.id::text||':'||new.status::text||':'||_area
        );
      end if;
    end if;
  end if;

  return new;
exception when others then
  raise warning 'SIGAPRO notification process-flow: %',sqlerrm;
  return new;
end;
$function$;

create or replace function public.trg_notify_dispatch_flow_v1()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _municipality uuid := coalesce(new.municipality_id,new.tenant_id);
  _protocol text;
  _area text;
  _source uuid := coalesce(new.created_by_profile_id,public.current_profile_id());
  _url text := '/processos/'||new.process_id::text;
  _target_profile_id uuid;
begin
  select p.protocol_number into _protocol
  from public.processes p where p.id=new.process_id;

  if tg_op='INSERT' then
    if nullif(btrim(coalesce(new.assigned_to,'')),'') is not null then
      select p.id into _target_profile_id
      from public.profiles p
      where p.deleted_at is null
        and p.account_status='active'
        and p.municipality_id=_municipality
        and p.id is distinct from _source
        and (
          lower(btrim(coalesce(p.full_name,'')))=lower(btrim(new.assigned_to))
          or lower(btrim(coalesce(p.email,'')))=lower(btrim(new.assigned_to))
        )
      limit 1;
    end if;

    if _target_profile_id is not null then
      perform public.enqueue_notification_v1(
        _target_profile_id,
        'Novo despacho atribuído a você',
        coalesce(_protocol,'Processo')||': '||new.subject||'.',
        'tramite',new.process_id,_url,'tramite',
        case when new.priority='alta' then 'alta' else 'normal' end,
        _source,'dispatch:assigned:'||new.id::text,'{}'::jsonb
      );
    else
      _area := public.operational_area_from_label(new.to_department);
      if _area in ('protocolos','analise','financeiro') then
        perform public.notify_municipal_area_v1(
          _municipality,_area,
          'Novo despacho recebido',
          coalesce(_protocol,'Processo')||': '||new.subject||'.',
          'tramite',new.process_id,_url,'tramite',
          case when new.priority='alta' then 'alta' else 'normal' end,
          _source,'dispatch:new:'||new.id::text
        );
      end if;
    end if;

    return new;
  end if;

  if new.status is distinct from old.status
     and new.status in ('concluido','devolvido','retornado') then
    if new.created_by_profile_id is not null then
      perform public.enqueue_notification_v1(
        new.created_by_profile_id,
        case when new.status='concluido' then 'Despacho concluído' else 'Despacho devolvido' end,
        coalesce(_protocol,'Processo')||': '||new.subject||'.',
        'tramite',new.process_id,_url,'tramite','normal',
        public.current_profile_id(),
        'dispatch:'||new.status||':'||new.id::text,
        '{}'::jsonb
      );
    end if;
  end if;

  return new;
exception when others then
  raise warning 'SIGAPRO notification dispatch-flow: %',sqlerrm;
  return new;
end;
$function$;

create or replace function public.trg_notify_message_flow_v1()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _municipality uuid := coalesce(new.municipality_id,new.tenant_id);
  _protocol text;
  _sender_role text := lower(coalesce(new.sender_role,''));
  _area text;
  _url text := '/processos/'||new.process_id::text;
  _recipient_profile_id uuid;
begin
  select p.protocol_number,
         public.operational_area_from_label(
           coalesce(nullif(p.current_department,''),nullif(p.current_queue,''))
         )
    into _protocol,_area
  from public.processes p where p.id=new.process_id;

  if nullif(btrim(coalesce(new.recipient_name,'')),'') is not null then
    select p.id into _recipient_profile_id
    from public.profiles p
    where p.deleted_at is null
      and p.account_status='active'
      and p.municipality_id=_municipality
      and p.id is distinct from new.sender_profile_id
      and (
        lower(btrim(coalesce(p.full_name,'')))=lower(btrim(new.recipient_name))
        or lower(btrim(coalesce(p.email,'')))=lower(btrim(new.recipient_name))
      )
    limit 1;
  end if;

  if _recipient_profile_id is not null then
    perform public.enqueue_notification_v1(
      _recipient_profile_id,
      'Nova mensagem no processo',
      coalesce(_protocol,'Processo')||': '||left(new.message,180),
      'mensagem',new.process_id,_url,'mensagem','normal',
      new.sender_profile_id,'message:recipient:'||new.id::text,'{}'::jsonb
    );
    return new;
  end if;

  if _sender_role in ('profissional_externo','property_owner','proprietario_consulta','owner','external') then
    if public.notify_process_analyst_v1(
      new.process_id,
      'Nova mensagem no processo',
      coalesce(_protocol,'Processo')||': '||left(new.message,180),
      'mensagem',_url,'mensagem','normal',new.sender_profile_id,
      'message:analyst:'||new.id::text
    ) is null and _area in ('protocolos','analise','financeiro') then
      perform public.notify_municipal_area_v1(
        _municipality,_area,
        'Nova mensagem no processo',
        coalesce(_protocol,'Processo')||': '||left(new.message,180),
        'mensagem',new.process_id,_url,'mensagem','normal',
        new.sender_profile_id,'message:area:'||new.id::text
      );
    end if;
  elsif new.audience in ('externo','misto') then
    perform public.notify_process_owner_v1(
      new.process_id,
      'Nova mensagem da Prefeitura',
      coalesce(_protocol,'Processo')||': '||left(new.message,180),
      'mensagem',_url,'mensagem','normal',new.sender_profile_id,
      'message:owner:'||new.id::text
    );
  end if;

  return new;
exception when others then
  raise warning 'SIGAPRO notification message-flow: %',sqlerrm;
  return new;
end;
$function$;

create or replace function public.trg_notify_payment_guide_flow_v1()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _process public.processes%rowtype;
  _municipality uuid;
  _source uuid := public.current_profile_id();
  _url text;
  _label text;
  _responsible_area text;
begin
  if new.process_id is null then return new; end if;

  select * into _process from public.processes where id=new.process_id;
  if _process.id is null then return new; end if;

  _municipality := coalesce(new.municipality_id,_process.municipality_id,_process.tenant_id);
  _url := '/processos/'||new.process_id::text;
  _label := case coalesce(new.guide_kind,'')
    when 'protocolo' then 'Guia de Protocolo'
    when 'iss_obra' then 'Guia de ISSQN / Obra'
    when 'aprovacao_final' then 'Guia de Aprovação / Alvará'
    else 'Guia de recolhimento'
  end;
  _responsible_area := case
    when coalesce(new.guide_kind,'')='protocolo' then 'protocolos'
    else 'financeiro'
  end;

  if tg_op='INSERT' then
    perform public.notify_process_owner_v1(
      new.process_id,
      _label||' emitida',
      'A '||_label||' do processo '||_process.protocol_number||' foi emitida.',
      'financeiro',_url,'financeiro','alta',_source,
      'guide:new:'||new.id::text
    );

    perform public.notify_municipal_area_v1(
      _municipality,_responsible_area,
      'Nova guia emitida',
      _process.protocol_number||': '||_label||' disponível para acompanhamento.',
      'financeiro',new.process_id,_url,'financeiro','normal',_source,
      'guide:area:'||new.id::text||':'||_responsible_area
    );
    return new;
  end if;

  if (
    coalesce(new.paid,false) is distinct from coalesce(old.paid,false)
    or coalesce(new.status,'') is distinct from coalesce(old.status,'')
  ) and (
    coalesce(new.paid,false)
    or lower(coalesce(new.status,'')) in ('paid','compensada','pago','confirmed','confirmado')
  ) then
    perform public.notify_process_owner_v1(
      new.process_id,
      'Pagamento confirmado',
      _process.protocol_number||': '||_label||' compensada.',
      'financeiro',_url,'financeiro','normal',_source,
      'guide:paid:owner:'||new.id::text
    );

    perform public.notify_process_analyst_v1(
      new.process_id,
      'Pagamento liberado para continuidade',
      _process.protocol_number||': '||_label||' foi compensada.',
      'financeiro',_url||'?aba=analise','financeiro','normal',_source,
      'guide:paid:analyst:'||new.id::text
    );

    perform public.notify_municipal_area_v1(
      _municipality,_responsible_area,
      'Pagamento confirmado',
      _process.protocol_number||': '||_label||' foi compensada.',
      'financeiro',new.process_id,_url,'financeiro','normal',_source,
      'guide:paid:area:'||new.id::text||':'||_responsible_area
    );
  end if;

  return new;
exception when others then
  raise warning 'SIGAPRO notification payment-guide-flow: %',sqlerrm;
  return new;
end;
$function$;

notify pgrst, 'reload schema';
