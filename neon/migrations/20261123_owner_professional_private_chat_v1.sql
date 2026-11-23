-- SIGAPRO | Conversas privadas entre proprietário e profissional | Homologação 2026-11-23
-- Todos os acessos usam o profile_id autenticado; nenhum CPF/CNPJ ou texto privado
-- é exposto em notificações, e não há leitura da conversa por funcionários da Prefeitura.

create unique index if not exists project_owner_requests_active_profile_uq
on public.project_owner_requests (project_id,owner_profile_id,professional_profile_id)
where owner_profile_id is not null and professional_profile_id is not null
and status in ('pending','approved');

create index if not exists owner_professional_messages_thread_chrono_idx
on public.owner_professional_messages (
  project_id,owner_profile_id,professional_profile_id,created_at desc,id desc
);

-- A RPC era chamada pelo portal, mas não existia no Neon da homologação.
-- A validação usa o documento INTEGRAL armazenado em tabela privada;
-- nunca compara apenas os últimos quatro dígitos visíveis.
create or replace function public.create_owner_request_by_protocol(
  _protocol text, _owner_document text, _notes text default null
)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _owner_profile_id uuid := public.current_profile_id();
  _owner_municipality_id uuid;
  _owner_role text;
  _owner_legacy_id uuid;
  _professional_profile_id uuid;
  _professional_legacy_id uuid;
  _normalized_document text := regexp_replace(coalesce(_owner_document,''),'\D','','g');
  _normalized_protocol text := btrim(coalesce(_protocol,''));
  _process public.processes%rowtype;
  _request public.project_owner_requests%rowtype;
begin
  if _owner_profile_id is null then raise exception 'Conta nao autenticada'; end if;
  select p.municipality_id,p.role,p.user_id
    into _owner_municipality_id,_owner_role,_owner_legacy_id
    from public.profiles p
   where p.id=_owner_profile_id and p.account_status='active' and p.deleted_at is null;
  if _owner_municipality_id is null
     or _owner_role not in ('property_owner','proprietario_consulta') then
    raise exception 'Acesso permitido somente ao proprietario vinculado a uma Prefeitura'
      using errcode='42501';
  end if;
  if length(_normalized_protocol) < 5 or length(_normalized_protocol)>120
    or length(_normalized_document) not in (11,14) then
    raise exception 'Informe o protocolo e CPF/CNPJ completo para validar';
  end if;
  if length(btrim(coalesce(_notes,''))) > 1000 then
    raise exception 'Observacao excede 1.000 caracteres';
  end if;

  -- The owner is not allowed to inspect a non-matching process.
  select pr.* into _process
    from public.processes pr
    join public.process_parties pp on pp.process_id=pr.id
      and pp.party_type='proprietario'
    join public.process_party_private_data priv on priv.party_id=pp.id
      and priv.process_id=pr.id
   where pr.tenant_id=_owner_municipality_id
     and (
       lower(pr.protocol_number)=lower(_normalized_protocol)
       or lower(coalesce(pr.external_protocol_number,''))=lower(_normalized_protocol)
       or lower(coalesce(pr.pre_protocol_number,''))=lower(_normalized_protocol)
     )
     and regexp_replace(coalesce(priv.document_number,''),'\D','','g')=_normalized_document
   order by pr.created_at desc
   limit 1;

  if _process.id is null then
    raise exception 'Nao foi possivel confirmar protocolo e documento nesta Prefeitura';
  end if;

  select p.id,p.user_id into _professional_profile_id,_professional_legacy_id
    from public.profiles p
   where p.id=_process.created_by_profile_id
     and p.role='profissional_externo'
     and p.account_status='active' and p.deleted_at is null;

  if _professional_profile_id is null then
    select p.id,p.user_id into _professional_profile_id,_professional_legacy_id
      from public.process_parties pp
      join public.profiles p on p.id=pp.profile_id
     where pp.process_id=_process.id
       and pp.party_type in ('profissional_externo','responsavel_tecnico')
       and p.role='profissional_externo'
       and p.account_status='active' and p.deleted_at is null
     order by pp.is_primary desc,pp.created_at
     limit 1;
  end if;

  if _professional_profile_id is null or _professional_profile_id=_owner_profile_id then
    raise exception 'Profissional responsavel nao localizado neste protocolo';
  end if;

  select * into _request from public.project_owner_requests r
   where r.project_id=_process.id
     and r.owner_profile_id=_owner_profile_id
     and r.professional_profile_id=_professional_profile_id
     and r.status in ('pending','approved')
   order by r.requested_at desc
   limit 1;

  if _request.id is null then
    insert into public.project_owner_requests(
      project_id,owner_user_id,professional_user_id,
      owner_profile_id,professional_profile_id,status,requested_at,notes
    ) values (
      _process.id,_owner_legacy_id,_professional_legacy_id,
      _owner_profile_id,_professional_profile_id,'pending',now(),
      nullif(btrim(coalesce(_notes,'')),'')
    )
    on conflict do nothing
    returning * into _request;
    if _request.id is null then
      select * into _request from public.project_owner_requests r
       where r.project_id=_process.id
         and r.owner_profile_id=_owner_profile_id
         and r.professional_profile_id=_professional_profile_id
         and r.status in ('pending','approved')
       order by r.requested_at desc
       limit 1;
    end if;
  end if;

  if _request.id is null then raise exception 'Nao foi possivel registrar a solicitacao'; end if;

  return jsonb_build_object(
    'request',jsonb_build_object(
      'id',_request.id,'project_id',_request.project_id,
      'owner_profile_id',_request.owner_profile_id,
      'professional_profile_id',_request.professional_profile_id,
      'status',_request.status,'requested_at',_request.requested_at,
      'responded_at',_request.responded_at,'responded_by_profile_id',_request.responded_by_profile_id,
      'notes',_request.notes
    ),
    'process',jsonb_build_object(
      'id',_process.id,'protocol',_process.protocol_number,
      'title',_process.title,'status',_process.status
    )
  );
end;
$function$;

revoke all on function public.create_owner_request_by_protocol(text,text,text) from public;
grant execute on function public.create_owner_request_by_protocol(text,text,text) to authenticated;

-- Alteração de chat é EXCLUSIVA do profissional responsável autenticado.
create or replace function public.set_owner_chat_enabled(_link_id uuid,_enabled boolean)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _actor uuid := public.current_profile_id();
  _link public.project_owner_links%rowtype;
begin
  if _actor is null then raise exception 'Conta nao autenticada'; end if;
  if _enabled is null then raise exception 'Estado do chat nao informado'; end if;
  select * into _link from public.project_owner_links where id=_link_id for update;
  if not found then raise exception 'Conversa nao encontrada'; end if;
  if _link.professional_profile_id is distinct from _actor then
    raise exception 'Somente o profissional responsavel pode alterar o estado da conversa'
      using errcode='42501';
  end if;

  update public.project_owner_links set chat_enabled=_enabled
    where id=_link_id returning * into _link;

  return jsonb_build_object(
    'id',_link.id,'project_id',_link.project_id,
    'owner_profile_id',_link.owner_profile_id,
    'professional_profile_id',_link.professional_profile_id,
    'chat_enabled',_link.chat_enabled,'linked_at',_link.linked_at,
    'linked_by_profile_id',_link.linked_by_profile_id
  );
end;
$function$;

-- Somente os DOIS participantes podem enviar mensagens, inclusive sem
-- privilégios de exceção para master ou usuários internos.
create or replace function public.send_owner_message(_link_id uuid,_message text)
returns jsonb
language plpgsql security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _actor uuid := public.current_profile_id();
  _legacy uuid := public.current_legacy_user_id();
  _link public.project_owner_links%rowtype;
  _row public.owner_professional_messages%rowtype;
  _clean text := nullif(btrim(coalesce(_message,'')),'');
begin
  if _actor is null then raise exception 'Conta nao autenticada'; end if;
  if _clean is null then raise exception 'A mensagem nao pode estar vazia'; end if;
  if length(_clean)>4000 then raise exception 'Mensagem excede 4.000 caracteres'; end if;
  select * into _link from public.project_owner_links where id=_link_id for share;
  if not found then raise exception 'Conversa nao encontrada'; end if;
  if _link.chat_enabled is distinct from true then
    raise exception 'A conversa foi desativada pelo profissional responsavel';
  end if;
  if _actor is distinct from _link.owner_profile_id
     and _actor is distinct from _link.professional_profile_id then
    raise exception 'Sem permissao para enviar mensagem nesta conversa' using errcode='42501';
  end if;
  insert into public.owner_professional_messages(
    project_id,owner_user_id,professional_user_id,sender_user_id,
    owner_profile_id,professional_profile_id,sender_profile_id,
    message,created_at,read_at,is_system_message
  ) values (
    _link.project_id,_link.owner_user_id,_link.professional_user_id,_legacy,
    _link.owner_profile_id,_link.professional_profile_id,_actor,
    _clean,now(),null,false
  ) returning * into _row;

  return jsonb_build_object(
    'id',_row.id,'project_id',_row.project_id,
    'owner_profile_id',_row.owner_profile_id,
    'professional_profile_id',_row.professional_profile_id,
    'sender_profile_id',_row.sender_profile_id,
    'message',_row.message,'created_at',_row.created_at,
    'read_at',_row.read_at,'is_system_message',_row.is_system_message
  );
end;
$function$;

-- Confirma leitura de mensagens recebidas, sem permitir marcar as próprias.
create or replace function public.mark_owner_conversation_read(_link_id uuid)
returns integer
language plpgsql security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _actor uuid := public.current_profile_id();
  _link public.project_owner_links%rowtype;
  _updated integer := 0;
begin
  if _actor is null then raise exception 'Conta nao autenticada'; end if;
  select * into _link from public.project_owner_links where id=_link_id;
  if not found or (_actor is distinct from _link.owner_profile_id
                and _actor is distinct from _link.professional_profile_id) then
    raise exception 'Sem permissao para ler esta conversa' using errcode='42501';
  end if;
  update public.owner_professional_messages m
     set read_at=now()
   where m.project_id=_link.project_id
     and m.owner_profile_id=_link.owner_profile_id
     and m.professional_profile_id=_link.professional_profile_id
     and m.sender_profile_id is distinct from _actor
     and m.read_at is null;
  get diagnostics _updated = row_count;
  return _updated;
end;
$function$;

revoke all on function public.set_owner_chat_enabled(uuid,boolean) from public;
revoke all on function public.send_owner_message(uuid,text) from public;
revoke all on function public.mark_owner_conversation_read(uuid) from public;
grant execute on function public.set_owner_chat_enabled(uuid,boolean) to authenticated;
grant execute on function public.send_owner_message(uuid,text) to authenticated;
grant execute on function public.mark_owner_conversation_read(uuid) to authenticated;

-- Notificações privadas: nunca contêm corpo de mensagem, CPF ou dados de terceiros.
create or replace function public.notify_private_owner_chat_v1()
returns trigger language plpgsql security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _target uuid;
  _target_url text;
  _link_id uuid;
begin
  if new.sender_profile_id = new.owner_profile_id then
    _target := new.professional_profile_id;
    _target_url := '/externo/mensagens';
  else
    _target := new.owner_profile_id;
    _target_url := '/proprietario?aba=mensagens';
  end if;
  if _target is null or _target=new.sender_profile_id then return new; end if;
  select l.id into _link_id from public.project_owner_links l
   where l.project_id=new.project_id
     and l.owner_profile_id=new.owner_profile_id
     and l.professional_profile_id=new.professional_profile_id
   order by l.linked_at desc limit 1;
  if _link_id is not null then
    _target_url := _target_url || case when _target_url like '%?%' then '&' else '?' end ||
      'conversa=' || _link_id::text;
  end if;
  perform public.enqueue_notification_v1(
    _target,'Nova mensagem privada',
    'Você recebeu uma nova mensagem em uma conversa de acompanhamento.',
    'mensagem',new.project_id,_target_url,'mensagem_privada','normal',
    new.sender_profile_id,'owner-chat:' || new.id::text,
    jsonb_build_object('owner_chat',true,'link_id',_link_id)
  );
  return new;
exception when others then
  -- Não bloquear a gravação da mensagem caso o serviço de notificações falhe.
  raise log 'SIGAPRO: falha ao notificar conversa privada: %',sqlerrm;
  return new;
end;
$function$;

drop trigger if exists trg_notify_private_owner_chat_v1 on public.owner_professional_messages;
create trigger trg_notify_private_owner_chat_v1
after insert on public.owner_professional_messages
for each row execute function public.notify_private_owner_chat_v1();

create or replace function public.notify_owner_followup_request_v1()
returns trigger language plpgsql security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _target uuid;
  _source uuid;
  _target_url text;
  _title text;
begin
  if tg_op='INSERT' and new.status='pending' then
    _target:=new.professional_profile_id; _source:=new.owner_profile_id;
    _target_url:='/externo/mensagens';
    _title:='Novo pedido de acompanhamento';
  elsif tg_op='UPDATE' and new.status is distinct from old.status
     and new.status in ('approved','rejected') then
    _target:=new.owner_profile_id; _source:=new.professional_profile_id;
    _target_url:=case when new.status='approved' then '/proprietario?aba=mensagens'
                      else '/proprietario?aba=solicitacoes' end;
    _title:=case when new.status='approved' then 'Acompanhamento aprovado'
                 else 'Solicitação de acompanhamento respondida' end;
  else
    return new;
  end if;

  perform public.enqueue_notification_v1(
    _target,_title,
    'Confira o andamento de sua solicitação de acompanhamento no portal.',
    'mensagem',new.project_id,_target_url,'acompanhamento','normal',_source,
    'owner-request:' || new.id::text || ':' || new.status,
    jsonb_build_object('owner_request',true)
  );
  return new;
exception when others then
  raise log 'SIGAPRO: falha ao notificar pedido de acompanhamento: %',sqlerrm;
  return new;
end;
$function$;

drop trigger if exists trg_notify_owner_followup_request_v1 on public.project_owner_requests;
create trigger trg_notify_owner_followup_request_v1
after insert or update of status on public.project_owner_requests
for each row execute function public.notify_owner_followup_request_v1();
