-- Hotfix: 500 em GET/POST profiles, municipalities e fluxos que chamam is_admin_master().
-- Causa comum: coluna profiles.role inexistente enquanto current_role_code() faz SELECT nela.
-- Também alinha is_master_user com seeds que usam admin_master (migration foundation).

alter table public.profiles add column if not exists role text;
alter table public.profiles add column if not exists deleted_at timestamptz;

drop index if exists idx_profiles_role;
create index if not exists idx_profiles_role on public.profiles (role) where role is not null;

-- Papel efetivo: vínculo em tenant_memberships → coluna opcional profiles.role → JWT (app_metadata.role)
create or replace function public.current_role_code()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _code text;
begin
  select r.code::text
    into _code
  from public.tenant_memberships tm
  join public.roles r on r.id = tm.role_id
  where tm.user_id = auth.uid()
    and tm.is_active = true
    and tm.deleted_at is null
  order by tm.updated_at desc nulls last, tm.created_at desc nulls last
  limit 1;

  if _code is not null and length(trim(_code)) > 0 then
    return _code;
  end if;

  select p.role
    into _code
  from public.profiles p
  where p.user_id = auth.uid()
    and (p.deleted_at is null)
  order by p.updated_at desc nulls last, p.id
  limit 1;

  if _code is not null and length(trim(_code)) > 0 then
    return _code;
  end if;

  select (u.raw_user_meta_data->>'role')::text
    into _code
  from auth.users u
  where u.id = auth.uid();

  return nullif(trim(_code), '');
end;
$$;

-- Reconhece master tanto no enum "antigo" (admin_master) quanto no atual (master_admin)
create or replace function public.is_master_user(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_memberships tm
    join public.roles r on r.id = tm.role_id
    where tm.user_id = _user_id
      and tm.deleted_at is null
      and r.code::text in ('master_admin', 'master_ops', 'admin_master')
  );
$$;

-- Garante INSERT próprio de perfil (upsert no login) mesmo se políticas tiverem sido alteradas
drop policy if exists "profiles_insert_self_or_admin" on public.profiles;
create policy "profiles_insert_self_or_admin"
on public.profiles
for insert
to authenticated
with check (
  user_id = auth.uid()
  or public.is_admin_master()
  or public.is_municipality_admin()
);
