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

create or replace function public.list_visible_user_last_access()
returns table(profile_id uuid, last_access_at timestamptz)
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
set row_security to 'off'
as $function$
  select
    p.id as profile_id,
    greatest(
      p.last_access_at,
      max(tm.last_access_at)
    ) as last_access_at
  from public.profiles p
  left join public.tenant_memberships tm
    on tm.profile_id = p.id
   and tm.is_active = true
   and tm.deleted_at is null
  where p.deleted_at is null
    and (
      public.is_master()
      or (
        p.municipality_id is not null
        and public.can_access_municipality(p.municipality_id)
      )
    )
  group by p.id, p.last_access_at
$function$;

grant execute on function public.list_visible_user_last_access() to authenticated;

update public.profiles p
set last_access_at = au.last_sign_in_at
from auth.users au
where p.user_id = au.id
  and p.last_access_at is null
  and au.last_sign_in_at is not null;

with neon_access as (
  select
    pai.profile_id,
    max(s."updatedAt") as last_access_at
  from public.profile_auth_identities pai
  join neon_auth.session s
    on s."userId"::text = pai.provider_user_id
  where pai.provider = 'neon'
    and pai.is_active = true
  group by pai.profile_id
)
update public.profiles p
set last_access_at = greatest(p.last_access_at, na.last_access_at)
from neon_access na
where p.id = na.profile_id
  and na.last_access_at is not null;

update public.tenant_memberships tm
set last_access_at = p.last_access_at
from public.profiles p
where tm.profile_id = p.id
  and tm.last_access_at is null
  and p.last_access_at is not null;

commit;
