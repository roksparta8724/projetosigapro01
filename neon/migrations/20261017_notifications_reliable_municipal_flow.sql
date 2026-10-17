-- SIGAPRO - central de notificações municipal, direcionada e auditável.
-- Objetivos:
-- 1) cada perfil recebe somente notificações destinadas a ele;
-- 2) eventos operacionais são roteados ao setor/pessoa responsável;
-- 3) o Master não recebe ruído operacional municipal;
-- 4) Master só pode receber aviso explicitamente enviado por Prefeitura Admin;
-- 5) leitura/contagem usam RPCs do próprio perfil, sem depender da lista de processos no navegador.

alter table public.notifications
  add column if not exists municipality_id uuid references public.municipalities(id) on delete set null,
  add column if not exists process_id uuid references public.processes(id) on delete cascade,
  add column if not exists source_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists action_url text,
  add column if not exists category text not null default 'sistema',
  add column if not exists priority text not null default 'normal',
  add column if not exists read_at timestamptz,
  add column if not exists dedupe_key text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_notifications_profile_unread
  on public.notifications(profile_id, is_read, created_at desc);

create index if not exists idx_notifications_municipality_created
  on public.notifications(municipality_id, created_at desc);

create index if not exists idx_notifications_process
  on public.notifications(process_id, created_at desc);

create unique index if not exists notifications_profile_dedupe_uidx
  on public.notifications(profile_id, dedupe_key)
  where profile_id is not null and dedupe_key is not null;

update public.notifications n
set municipality_id = coalesce(
      n.municipality_id,
      p.municipality_id,
      pr.municipality_id
    ),
    process_id = coalesce(n.process_id, pr.id),
    read_at = case
      when coalesce(n.is_read,false) and n.read_at is null then coalesce(n.created_at,now())
      else n.read_at
    end
from public.profiles p
left join public.processes pr on pr.id=n.process_id
where p.id=n.profile_id
  and (
    n.municipality_id is null
    or (coalesce(n.is_read,false) and n.read_at is null)
  );

-- Master deixa de ter leitura global da tabela. Ele verá somente linhas
-- explicitamente endereçadas ao próprio profile_id.
drop policy if exists notifications_select_scoped on public.notifications;
create policy notifications_select_own
on public.notifications
for select
to authenticated
using (
  profile_id = public.current_profile_id()
  or (
    profile_id is null
    and user_id is not null
    and user_id = public.current_legacy_user_id()
  )
);

create or replace function public.enqueue_notification_v1(
  _target_profile_id uuid,
  _title text,
  _message text,
  _type text default 'info',
  _process_id uuid default null,
  _action_url text default null,
  _category text default 'sistema',
  _priority text default 'normal',
  _source_profile_id uuid default null,
  _dedupe_key text default null,
  _metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _target_role text;
  _target_municipality uuid;
  _source uuid := coalesce(_source_profile_id, public.current_profile_id());
  _source_role text;
  _source_municipality uuid;
  _process_municipality uuid;
  _id uuid;
begin
  if _target_profile_id is null
     or nullif(btrim(coalesce(_title,'')),'') is null
     or nullif(btrim(coalesce(_message,'')),'') is null then
    return null;
  end if;

  select lower(coalesce(p.role,'')),p.municipality_id
    into _target_role,_target_municipality
  from public.profiles p
  where p.id=_target_profile_id
    and p.deleted_at is null
    and p.account_status='active';

  if _target_role is null then return null; end if;

  if _source is not null then
    select lower(coalesce(p.role,'')),p.municipality_id
      into _source_role,_source_municipality
    from public.profiles p
    where p.id=_source
      and p.deleted_at is null;
  end if;

  if _process_id is not null then
    select coalesce(p.municipality_id,p.tenant_id)
      into _process_municipality
    from public.processes p
    where p.id=_process_id;
  end if;

  -- Master nunca recebe evento operacional da Prefeitura.
  -- A única porta de entrada é master_support originado por Prefeitura Admin.
  if _target_role in ('master_admin','master_ops','admin_master') then
    if coalesce(_source_role,'') <> 'prefeitura_admin'
       or coalesce(_category,'') <> 'master_support' then
      return null;
    end if;
  else
    -- Um perfil municipal não pode enviar notificação a outra Prefeitura.
    if _source is not null
       and coalesce(_source_role,'') not in ('master_admin','master_ops','admin_master')
       and _source_municipality is not null
       and _target_municipality is not null
       and _source_municipality <> _target_municipality then
      return null;
    end if;

    if _process_municipality is not null
       and _target_municipality is not null
       and _process_municipality <> _target_municipality then
      return null;
    end if;
  end if;

  insert into public.notifications(
    profile_id,title,message,type,is_read,created_at,
    municipality_id,process_id,source_profile_id,action_url,
    category,priority,dedupe_key,metadata
  )
  values(
    _target_profile_id,btrim(_title),btrim(_message),coalesce(nullif(btrim(_type),''),'info'),
    false,clock_timestamp(),
    coalesce(_target_municipality,_process_municipality),_process_id,_source,
    nullif(btrim(coalesce(_action_url,'')),''),
    coalesce(nullif(btrim(_category),''),'sistema'),
    coalesce(nullif(btrim(_priority),''),'normal'),
    nullif(btrim(coalesce(_dedupe_key,'')),''),
    coalesce(_metadata,'{}'::jsonb)
  )
  on conflict (profile_id,dedupe_key)
    where profile_id is not null and dedupe_key is not null
  do nothing
  returning id into _id;

  if _id is null and nullif(btrim(coalesce(_dedupe_key,'')),'') is not null then
    select n.id into _id
    from public.notifications n
    where n.profile_id=_target_profile_id
      and n.dedupe_key=btrim(_dedupe_key)
    order by n.created_at desc nulls last
    limit 1;
  end if;

  return _id;
end;
$function$;

create or replace function public.notify_municipal_area_v1(
  _municipality_id uuid,
  _area text,
  _title text,
  _message text,
  _type text default 'info',
  _process_id uuid default null,
  _action_url text default null,
  _category text default 'operacional',
  _priority text default 'normal',
  _source_profile_id uuid default null,
  _dedupe_prefix text default null
)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _target record;
  _count integer := 0;
  _source uuid := coalesce(_source_profile_id,public.current_profile_id());
  _key text;
begin
  if _municipality_id is null or nullif(btrim(coalesce(_area,'')),'') is null then
    return 0;
  end if;

  for _target in
    select p.id
    from public.profiles p
    where p.deleted_at is null
      and p.account_status='active'
      and p.municipality_id=_municipality_id
      and p.id is distinct from _source
      and lower(coalesce(p.role,'')) not in (
        'master_admin','master_ops','admin_master',
        'profissional_externo','property_owner','proprietario_consulta'
      )
      and public.profile_operational_area(p.id)=_area
  loop
    _key := case
      when nullif(btrim(coalesce(_dedupe_prefix,'')),'') is null then null
      else btrim(_dedupe_prefix)||':'||_target.id::text
    end;

    if public.enqueue_notification_v1(
      _target.id,_title,_message,_type,_process_id,_action_url,
      _category,_priority,_source,_key,'{}'::jsonb
    ) is not null then
      _count := _count+1;
    end if;
  end loop;

  return _count;
end;
$function$;

create or replace function public.notify_process_owner_v1(
  _process_id uuid,
  _title text,
  _message text,
  _type text default 'info',
  _action_url text default null,
  _category text default 'processo',
  _priority text default 'normal',
  _source_profile_id uuid default null,
  _dedupe_key text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _target uuid;
begin
  select p.created_by_profile_id into _target
  from public.processes p
  where p.id=_process_id;

  if _target is null or _target=coalesce(_source_profile_id,public.current_profile_id()) then
    return null;
  end if;

  return public.enqueue_notification_v1(
    _target,_title,_message,_type,_process_id,_action_url,
    _category,_priority,_source_profile_id,_dedupe_key,'{}'::jsonb
  );
end;
$function$;

create or replace function public.notify_process_analyst_v1(
  _process_id uuid,
  _title text,
  _message text,
  _type text default 'info',
  _action_url text default null,
  _category text default 'analise',
  _priority text default 'normal',
  _source_profile_id uuid default null,
  _dedupe_key text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _target uuid;
begin
  select p.analysis_assigned_to_profile_id into _target
  from public.processes p
  where p.id=_process_id;

  if _target is null or _target=coalesce(_source_profile_id,public.current_profile_id()) then
    return null;
  end if;

  return public.enqueue_notification_v1(
    _target,_title,_message,_type,_process_id,_action_url,
    _category,_priority,_source_profile_id,_dedupe_key,'{}'::jsonb
  );
end;
$function$;

create or replace function public.notify_master_support_v1(
  _title text,
  _message text,
  _priority text default 'normal'
)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _actor uuid := public.current_profile_id();
  _actor_role text;
  _actor_municipality uuid;
  _target record;
  _count integer := 0;
begin
  select lower(coalesce(p.role,'')),p.municipality_id
    into _actor_role,_actor_municipality
  from public.profiles p
  where p.id=_actor
    and p.deleted_at is null
    and p.account_status='active';

  if _actor_role <> 'prefeitura_admin' then
    raise exception 'Somente o Administrador da Prefeitura pode enviar aviso ao Master.';
  end if;

  for _target in
    select p.id
    from public.profiles p
    where p.deleted_at is null
      and p.account_status='active'
      and lower(coalesce(p.role,'')) in ('master_admin','master_ops','admin_master')
  loop
    if public.enqueue_notification_v1(
      _target.id,_title,_message,'master_support',null,'/master',
      'master_support',_priority,_actor,
      'master-support:'||_actor::text||':'||md5(coalesce(_title,'')||coalesce(_message,'')),
      jsonb_build_object('municipality_id',_actor_municipality)
    ) is not null then
      _count := _count+1;
    end if;
  end loop;

  return _count;
end;
$function$;

create or replace function public.get_my_notifications_v1(
  _limit integer default 100,
  _unread_only boolean default false
)
returns table(
  id uuid,
  title text,
  message text,
  type text,
  is_read boolean,
  created_at timestamptz,
  municipality_id uuid,
  process_id uuid,
  source_profile_id uuid,
  action_url text,
  category text,
  priority text,
  read_at timestamptz,
  metadata jsonb
)
language sql
stable
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
  select
    n.id,n.title,n.message,n.type,coalesce(n.is_read,false),n.created_at,
    n.municipality_id,n.process_id,n.source_profile_id,n.action_url,
    n.category,n.priority,n.read_at,n.metadata
  from public.notifications n
  where n.profile_id=public.current_profile_id()
    and (not coalesce(_unread_only,false) or not coalesce(n.is_read,false))
  order by coalesce(n.is_read,false) asc,n.created_at desc nulls last
  limit greatest(1,least(coalesce(_limit,100),250))
$function$;

create or replace function public.get_my_unread_notification_count_v1()
returns integer
language sql
stable
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
  select count(*)::integer
  from public.notifications n
  where n.profile_id=public.current_profile_id()
    and not coalesce(n.is_read,false)
$function$;

create or replace function public.mark_my_notification_read_v1(
  _notification_id uuid,
  _read boolean default true
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
begin
  update public.notifications
  set is_read=coalesce(_read,true),
      read_at=case when coalesce(_read,true) then clock_timestamp() else null end
  where id=_notification_id
    and profile_id=public.current_profile_id();

  return found;
end;
$function$;

create or replace function public.mark_all_my_notifications_read_v1()
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _count integer;
begin
  update public.notifications
  set is_read=true,read_at=clock_timestamp()
  where profile_id=public.current_profile_id()
    and not coalesce(is_read,false);

  get diagnostics _count = row_count;
  return _count;
end;
$function$;

-- Novo protocolo e mudanças de responsabilidade/etapa.
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
  end if;

  return new;
exception when others then
  raise warning 'SIGAPRO notification process-flow: %',sqlerrm;
  return new;
end;
$function$;

drop trigger if exists trg_notifications_process_flow_v1 on public.processes;
create trigger trg_notifications_process_flow_v1
after insert or update of status,current_department,current_queue,analysis_assigned_to_profile_id
on public.processes
for each row execute function public.trg_notify_process_flow_v1();

-- Exigências: profissional recebe abertura; analista recebe resposta.
create or replace function public.trg_notify_requirement_flow_v1()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _protocol text;
  _source uuid := coalesce(new.created_by_profile_id,public.current_profile_id());
  _url text := '/processos/'||new.process_id::text||'?aba=analise';
begin
  select p.protocol_number into _protocol
  from public.processes p where p.id=new.process_id;

  if tg_op='INSERT' then
    if new.visibility in ('externo','misto') then
      perform public.notify_process_owner_v1(
        new.process_id,
        'Nova exigência no processo',
        coalesce(_protocol,'Processo')||': '||new.title||'.',
        'exigencia',_url,'exigencia','alta',_source,
        'requirement:new:'||new.id::text
      );
    end if;
    return new;
  end if;

  if new.status is distinct from old.status and new.status='respondida' then
    perform public.notify_process_analyst_v1(
      new.process_id,
      'Exigência respondida',
      coalesce(_protocol,'Processo')||': a exigência "'||new.title||'" recebeu resposta.',
      'exigencia',_url,'exigencia','alta',
      coalesce(new.response_by_profile_id,public.current_profile_id()),
      'requirement:answered:'||new.id::text
    );
  end if;

  return new;
exception when others then
  raise warning 'SIGAPRO notification requirement-flow: %',sqlerrm;
  return new;
end;
$function$;

drop trigger if exists trg_notifications_requirement_flow_v1 on public.process_requirements;
create trigger trg_notifications_requirement_flow_v1
after insert or update of status
on public.process_requirements
for each row execute function public.trg_notify_requirement_flow_v1();

-- Trâmites: setor destino recebe o despacho; autor recebe retorno/conclusão.
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
begin
  select p.protocol_number into _protocol
  from public.processes p where p.id=new.process_id;

  if tg_op='INSERT' then
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

drop trigger if exists trg_notifications_dispatch_flow_v1 on public.interdepartmental_dispatches;
create trigger trg_notifications_dispatch_flow_v1
after insert or update of status
on public.interdepartmental_dispatches
for each row execute function public.trg_notify_dispatch_flow_v1();

-- Mensagens: interna -> titular externo; externa -> analista/setor atual.
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
begin
  select p.protocol_number,
         public.operational_area_from_label(
           coalesce(nullif(p.current_department,''),nullif(p.current_queue,''))
         )
    into _protocol,_area
  from public.processes p where p.id=new.process_id;

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

drop trigger if exists trg_notifications_message_flow_v1 on public.process_messages;
create trigger trg_notifications_message_flow_v1
after insert on public.process_messages
for each row execute function public.trg_notify_message_flow_v1();

-- Guias: titular é avisado na emissão; Financeiro recebe guia nova;
-- quando compensada, titular e analista recebem atualização.
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

  if tg_op='INSERT' then
    perform public.notify_process_owner_v1(
      new.process_id,
      _label||' emitida',
      'A '||_label||' do processo '||_process.protocol_number||' foi emitida.',
      'financeiro',_url,'financeiro','alta',_source,
      'guide:new:'||new.id::text
    );

    perform public.notify_municipal_area_v1(
      _municipality,'financeiro',
      'Nova guia emitida',
      _process.protocol_number||': '||_label||' disponível para acompanhamento.',
      'financeiro',new.process_id,_url,'financeiro','normal',_source,
      'guide:finance:'||new.id::text
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
  end if;

  return new;
exception when others then
  raise warning 'SIGAPRO notification payment-guide-flow: %',sqlerrm;
  return new;
end;
$function$;

drop trigger if exists trg_notifications_payment_guide_flow_v1 on public.payment_guides;
create trigger trg_notifications_payment_guide_flow_v1
after insert or update of paid,status
on public.payment_guides
for each row execute function public.trg_notify_payment_guide_flow_v1();

-- Alvará assinado: avisa analista e titular. A solicitação à Diretoria é
-- gerada pela RPC oficial, com alvo individual dos Diretores elegíveis.
create or replace function public.trg_notify_permit_signed_v1()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _process public.processes%rowtype;
  _source uuid := public.current_profile_id();
  _url text;
begin
  if new.status is distinct from old.status and new.status='signed' then
    select * into _process from public.processes where id=new.process_id;
    _url := '/processos/'||new.process_id::text||'?aba=alvara';

    perform public.notify_process_analyst_v1(
      new.process_id,
      'Alvará assinado pela Diretoria',
      'O Alvará '||new.permit_number||' foi assinado eletronicamente e está emitido.',
      'assinatura',_url,'assinatura','alta',_source,
      'permit:signed:analyst:'||new.id::text
    );

    perform public.notify_process_owner_v1(
      new.process_id,
      'Alvará emitido',
      'O Alvará '||new.permit_number||' foi assinado e já está disponível no processo.',
      'assinatura',_url,'assinatura','alta',_source,
      'permit:signed:owner:'||new.id::text
    );
  end if;

  return new;
exception when others then
  raise warning 'SIGAPRO notification permit-signed: %',sqlerrm;
  return new;
end;
$function$;

drop trigger if exists trg_notifications_permit_signed_v1 on public.process_construction_permits;
create trigger trg_notifications_permit_signed_v1
after update of status on public.process_construction_permits
for each row execute function public.trg_notify_permit_signed_v1();

grant execute on function public.get_my_notifications_v1(integer,boolean) to authenticated;
grant execute on function public.get_my_unread_notification_count_v1() to authenticated;
grant execute on function public.mark_my_notification_read_v1(uuid,boolean) to authenticated;
grant execute on function public.mark_all_my_notifications_read_v1() to authenticated;
grant execute on function public.notify_master_support_v1(text,text,text) to authenticated;

notify pgrst, 'reload schema';
