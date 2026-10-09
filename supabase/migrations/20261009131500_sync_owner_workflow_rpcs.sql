-- SIGAPRO: versiona workflow de proprietário já validado em produção.

CREATE OR REPLACE FUNCTION public.respond_owner_request(_request_id uuid, _status text, _notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _actor_profile_id uuid := public.current_profile_id();
  _actor_legacy_id uuid := public.current_legacy_user_id();
  _request public.project_owner_requests%rowtype;
  _link public.project_owner_links%rowtype;
begin
  if _actor_profile_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if _status not in ('approved','rejected') then
    raise exception 'Status de resposta invalido';
  end if;

  select *
    into _request
    from public.project_owner_requests
   where id=_request_id
   for update;

  if not found then
    raise exception 'Solicitacao nao encontrada';
  end if;

  if _request.status <> 'pending' then
    raise exception 'Solicitacao ja respondida';
  end if;

  if not public.is_master()
     and (
       _request.professional_profile_id is distinct from _actor_profile_id
       or not public.has_process_access(_request.project_id)
     ) then
    raise exception 'Somente o profissional responsavel pode responder esta solicitacao';
  end if;

  update public.project_owner_requests
     set status=_status,
         responded_at=now(),
         responded_by=_actor_legacy_id,
         responded_by_profile_id=_actor_profile_id,
         notes=coalesce(nullif(trim(_notes),''),notes)
   where id=_request_id
   returning * into _request;

  if _status='approved' then
    insert into public.project_owner_links(
      project_id,
      owner_user_id,
      professional_user_id,
      owner_profile_id,
      professional_profile_id,
      chat_enabled,
      linked_at,
      linked_by,
      linked_by_profile_id
    )
    values(
      _request.project_id,
      _request.owner_user_id,
      _request.professional_user_id,
      _request.owner_profile_id,
      _request.professional_profile_id,
      true,
      now(),
      _actor_legacy_id,
      _actor_profile_id
    )
    on conflict do nothing;

    select *
      into _link
      from public.project_owner_links
     where project_id=_request.project_id
       and owner_profile_id=_request.owner_profile_id
       and professional_profile_id=_request.professional_profile_id
     order by linked_at desc nulls last
     limit 1;

    if _link.id is null then
      raise exception 'Falha ao criar vinculo aprovado';
    end if;
  end if;

  return jsonb_build_object(
    'request',jsonb_build_object(
      'id',_request.id,
      'project_id',_request.project_id,
      'owner_user_id',_request.owner_user_id,
      'professional_user_id',_request.professional_user_id,
      'owner_profile_id',_request.owner_profile_id,
      'professional_profile_id',_request.professional_profile_id,
      'status',_request.status,
      'requested_at',_request.requested_at,
      'responded_at',_request.responded_at,
      'responded_by',_request.responded_by,
      'responded_by_profile_id',_request.responded_by_profile_id,
      'notes',_request.notes
    ),
    'link',case
      when _status='approved' then jsonb_build_object(
        'id',_link.id,
        'project_id',_link.project_id,
        'owner_user_id',_link.owner_user_id,
        'professional_user_id',_link.professional_user_id,
        'owner_profile_id',_link.owner_profile_id,
        'professional_profile_id',_link.professional_profile_id,
        'chat_enabled',_link.chat_enabled,
        'linked_at',_link.linked_at,
        'linked_by',_link.linked_by,
        'linked_by_profile_id',_link.linked_by_profile_id
      )
      else null
    end
  );
end;
$function$;

revoke all on function public.respond_owner_request(uuid,text,text) from public;
grant execute on function public.respond_owner_request(uuid,text,text) to authenticated;

CREATE OR REPLACE FUNCTION public.send_owner_message(_link_id uuid, _message text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _link public.project_owner_links%rowtype;
  _row public.owner_professional_messages%rowtype;
  _message_clean text := nullif(trim(coalesce(_message,'')),'');
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if _message_clean is null then
    raise exception 'Mensagem obrigatoria';
  end if;

  if length(_message_clean) > 4000 then
    raise exception 'Mensagem excede o limite permitido';
  end if;

  select *
    into _link
    from public.project_owner_links
   where id=_link_id
   for share;

  if not found then
    raise exception 'Vinculo nao encontrado';
  end if;

  if _link.chat_enabled is not true then
    raise exception 'Chat desabilitado para este vinculo';
  end if;

  if not public.is_master()
     and _profile_id is distinct from _link.owner_profile_id
     and _profile_id is distinct from _link.professional_profile_id then
    raise exception 'Sem permissao para enviar mensagem neste vinculo';
  end if;

  insert into public.owner_professional_messages(
    project_id,
    owner_user_id,
    professional_user_id,
    sender_user_id,
    owner_profile_id,
    professional_profile_id,
    sender_profile_id,
    message,
    created_at,
    read_at,
    is_system_message
  )
  values(
    _link.project_id,
    _link.owner_user_id,
    _link.professional_user_id,
    _legacy_user_id,
    _link.owner_profile_id,
    _link.professional_profile_id,
    _profile_id,
    _message_clean,
    now(),
    null,
    false
  )
  returning * into _row;

  return jsonb_build_object(
    'id',_row.id,
    'project_id',_row.project_id,
    'owner_user_id',_row.owner_user_id,
    'professional_user_id',_row.professional_user_id,
    'sender_user_id',_row.sender_user_id,
    'owner_profile_id',_row.owner_profile_id,
    'professional_profile_id',_row.professional_profile_id,
    'sender_profile_id',_row.sender_profile_id,
    'message',_row.message,
    'created_at',_row.created_at,
    'read_at',_row.read_at,
    'is_system_message',_row.is_system_message
  );
end;
$function$;

revoke all on function public.send_owner_message(uuid,text) from public;
grant execute on function public.send_owner_message(uuid,text) to authenticated;

CREATE OR REPLACE FUNCTION public.set_owner_chat_enabled(_link_id uuid, _enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _profile_id uuid := public.current_profile_id();
  _link public.project_owner_links%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select *
    into _link
    from public.project_owner_links
   where id=_link_id
   for update;

  if not found then
    raise exception 'Vinculo nao encontrado';
  end if;

  if not public.is_master()
     and _link.owner_profile_id is distinct from _profile_id
     and _link.professional_profile_id is distinct from _profile_id then
    raise exception 'Sem permissao para alterar o chat deste vinculo';
  end if;

  update public.project_owner_links
     set chat_enabled=_enabled
   where id=_link_id
   returning * into _link;

  return jsonb_build_object(
    'id',_link.id,
    'project_id',_link.project_id,
    'owner_user_id',_link.owner_user_id,
    'professional_user_id',_link.professional_user_id,
    'owner_profile_id',_link.owner_profile_id,
    'professional_profile_id',_link.professional_profile_id,
    'chat_enabled',_link.chat_enabled,
    'linked_at',_link.linked_at,
    'linked_by',_link.linked_by,
    'linked_by_profile_id',_link.linked_by_profile_id
  );
end;
$function$;

revoke all on function public.set_owner_chat_enabled(uuid,boolean) from public;
grant execute on function public.set_owner_chat_enabled(uuid,boolean) to authenticated;

