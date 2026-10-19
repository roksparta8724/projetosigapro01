-- SIGAPRO: exclusão segura de notificações pelo próprio destinatário.
-- Permite apagar selecionadas ou todas, sempre limitado ao usuário autenticado.

create or replace function public.delete_my_notifications_v1(
  _notification_ids uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _auth_user_id uuid := auth.uid();
  _profile_id uuid;
  _deleted integer := 0;
begin
  if _auth_user_id is null then
    raise exception 'Sessão inválida.';
  end if;

  select p.id
    into _profile_id
  from public.profiles p
  where p.user_id = _auth_user_id
    and p.deleted_at is null
  order by p.updated_at desc nulls last, p.created_at desc nulls last
  limit 1;

  delete from public.notifications n
  where (
      n.user_id = _auth_user_id
      or (_profile_id is not null and n.profile_id = _profile_id)
    )
    and (
      _notification_ids is null
      or cardinality(_notification_ids) = 0
      or n.id = any(_notification_ids)
    );

  get diagnostics _deleted = row_count;
  return _deleted;
end;
$$;

revoke all on function public.delete_my_notifications_v1(uuid[]) from public;
grant execute on function public.delete_my_notifications_v1(uuid[]) to authenticated;
