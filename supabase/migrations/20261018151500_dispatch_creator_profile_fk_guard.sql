-- SIGAPRO / Neon — identidade canônica do autor no despacho.
-- Perfis Neon podem ter user_id legado sem linha correspondente em auth.users.
-- created_by é compatibilidade legada e só pode receber IDs válidos de auth.users;
-- created_by_profile_id permanece como identidade canônica e auditável.

create or replace function public.sync_dispatch_creator_profile()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _profile_id uuid;
  _legacy_id uuid;
begin
  if new.created_by_profile_id is null and new.created_by is not null then
    _profile_id := public.resolve_profile_id_from_any_user_id(new.created_by);
    new.created_by_profile_id := _profile_id;
  end if;

  if new.created_by_profile_id is null then
    new.created_by_profile_id := public.current_profile_id();
  end if;

  if new.created_by_profile_id is not null then
    select case
      when p.user_id is not null
       and exists (
         select 1
         from auth.users au
         where au.id = p.user_id
       )
      then p.user_id
      else null
    end
    into _legacy_id
    from public.profiles p
    where p.id = new.created_by_profile_id
      and p.deleted_at is null
    limit 1;

    new.created_by := _legacy_id;
  else
    new.created_by := null;
  end if;

  if new.municipality_id is null
     and new.tenant_id is not null
     and exists (
       select 1
       from public.municipalities m
       where m.id = new.tenant_id
     ) then
    new.municipality_id := new.tenant_id;
  end if;

  return new;
end;
$function$;

notify pgrst, 'reload schema';
