-- SIGAPRO: helper de compatibilidade para colunas user_id durante a migração Better Auth/Neon.
-- A identidade canônica é profile_id; user_id legado é opcional.

create or replace function public.current_legacy_user_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select p.user_id
  from public.profiles p
  where p.id = public.current_profile_id()
    and p.deleted_at is null
    and p.account_status = 'active'
  limit 1
$function$;

revoke all on function public.current_legacy_user_id() from public;
grant execute on function public.current_legacy_user_id() to authenticated;
