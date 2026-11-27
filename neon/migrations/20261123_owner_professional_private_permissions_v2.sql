-- Complemento de privacidade: impedir acesso administrativo às mensagens
-- privadas e bloquear o RPC legado que aceitava pedidos sem documento.
revoke all on function public.create_owner_request(uuid,uuid,text) from public;
revoke all on function public.create_owner_request(uuid,uuid,text) from authenticated;

drop policy if exists owner_professional_messages_select_scoped on public.owner_professional_messages;
create policy owner_professional_messages_select_scoped
  on public.owner_professional_messages for select to authenticated
  using (
    public.current_profile_id() is not null
    and (
      owner_profile_id=public.current_profile_id()
      or professional_profile_id=public.current_profile_id()
    )
  );

-- Respostas não são emitidas por Master: o dono legítimo da responsabilidade
-- profissional decide a aprovação ou rejeição, mesmo em preprotocolo.
do $patch$
declare
  _definition text;
  _old text := $before$
  if not public.is_master()
     and (
       _request.professional_profile_id is distinct from _actor_profile_id
       or not public.has_process_access(_request.project_id)
     ) then
$before$;
  _new text := $after$
  if _request.professional_profile_id is distinct from _actor_profile_id
     or not public.has_process_access(_request.project_id) then
$after$;
begin
  select pg_get_functiondef('public.respond_owner_request(uuid,text,text)'::regprocedure) into _definition;
  if position(_old in _definition)=0 then
    raise exception 'O código de resposta mudou: revisão manual necessária antes de alterar permissões';
  end if;
  execute replace(_definition,_old,_new);
end;
$patch$;
