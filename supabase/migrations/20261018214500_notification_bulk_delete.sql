-- SIGAPRO: exclusão segura das próprias notificações.
-- Compatível com o modelo atual do Neon/Data API: ownership por profile_id/current_profile_id().

create or replace function public.delete_my_notifications_v1(
  _notification_ids uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
set row_security to 'off'
as $function$
declare
  _count integer;
begin
  delete from public.notifications n
  where n.profile_id = public.current_profile_id()
    and (
      _notification_ids is null
      or cardinality(_notification_ids) = 0
      or n.id = any(_notification_ids)
    );

  get diagnostics _count = row_count;
  return _count;
end;
$function$;

revoke all on function public.delete_my_notifications_v1(uuid[]) from public;
revoke all on function public.delete_my_notifications_v1(uuid[]) from anonymous;
grant execute on function public.delete_my_notifications_v1(uuid[]) to authenticated;


create or replace function public.delete_my_notification_v1(
  _notification_id uuid
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
set row_security to 'off'
as $function$
begin
  delete from public.notifications n
  where n.id = _notification_id
    and n.profile_id = public.current_profile_id();

  return found;
end;
$function$;

grant execute on function public.delete_my_notification_v1(uuid) to authenticated;
