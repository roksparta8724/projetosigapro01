-- SIGAPRO / Neon canonical last-access tracking
-- Keeps user administration "Último acesso" sourced from the official database.

begin;

alter table public.profiles
  add column if not exists last_access_at timestamptz;

alter table public.tenant_memberships
  add column if not exists last_access_at timestamptz;

create or replace function public.mark_current_profile_access()
returns timestamptz
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
set row_security to 'off'
as $function$
declare
  _profile_id uuid := public.current_profile_id();
  _now timestamptz := now();
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  update public.profiles
     set last_access_at = _now
   where id = _profile_id
     and deleted_at is null;

  update public.tenant_memberships tm
     set last_access_at = _now
   where tm.is_active = true
     and tm.deleted_at is null
     and (
       tm.profile_id = _profile_id
       or (
         tm.profile_id is null
         and tm.user_id = (
           select p.user_id
           from public.profiles p
           where p.id = _profile_id
           limit 1
         )
       )
     );

  return _now;
end;
$function$;

grant execute on function public.mark_current_profile_access() to authenticated;

update public.profiles p
set last_access_at = au.last_sign_in_at
from auth.users au
where p.user_id = au.id
  and p.last_access_at is null
  and au.last_sign_in_at is not null;

update public.tenant_memberships tm
set last_access_at = p.last_access_at
from public.profiles p
where tm.profile_id = p.id
  and tm.last_access_at is null
  and p.last_access_at is not null;

commit;
