create or replace function public.current_profile_id()
returns uuid
language sql
stable security definer
set search_path to 'public'
set row_security = off
as $$
  select p.id
  from public.profiles p
  where p.user_id = auth.uid()
    and p.deleted_at is null
  order by p.updated_at desc nulls last, p.id
  limit 1
$$;

create or replace function public.current_municipality_id()
returns uuid
language sql
stable security definer
set search_path to 'public'
set row_security = off
as $$
  select p.municipality_id
  from public.profiles p
  where p.user_id = auth.uid()
    and p.deleted_at is null
  order by p.updated_at desc nulls last, p.id
  limit 1
$$;

create or replace function public.current_role_code()
returns text
language plpgsql
stable security definer
set search_path to 'public'
set row_security = off
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
  order by tm.id
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

create or replace function public.is_admin_master()
returns boolean
language sql
stable security definer
set search_path to 'public'
set row_security = off
as $$
  select coalesce(public.current_role_code(), '') in ('admin_master', 'master_admin', 'master_ops')
$$;

create or replace function public.is_municipality_admin()
returns boolean
language sql
stable security definer
set search_path to 'public'
set row_security = off
as $$
  select coalesce(public.current_role_code(), '') in ('admin_municipality', 'admin_prefeitura', 'prefeitura_admin')
$$;

create or replace function public.is_internal_municipality_role()
returns boolean
language sql
stable security definer
set search_path to 'public'
set row_security = off
as $$
  select coalesce(public.current_role_code(), '') in (
    'admin_municipality',
    'admin_prefeitura',
    'prefeitura_admin',
    'prefeitura_supervisor',
    'analyst',
    'analista',
    'fiscal',
    'financial',
    'financeiro',
    'counter_service',
    'topography',
    'expedient',
    'setor_intersetorial'
  )
$$;

create or replace function public.is_master_user(_user_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
set row_security = off
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

create or replace function public.is_tenant_member(_tenant_id uuid, _user_id uuid default auth.uid())
returns boolean
language sql
stable security definer
set search_path to 'public'
set row_security = off
as $$
  select exists (
    select 1
    from public.tenant_memberships tm
    where tm.user_id = _user_id
      and tm.tenant_id = _tenant_id
      and tm.is_active = true
      and tm.deleted_at is null
  );
$$;

create or replace function public.can_access_municipality_scope(_municipality_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
set row_security = off
as $$
  select
    public.is_admin_master()
    or (
      _municipality_id is not null
      and _municipality_id = public.current_municipality_id()
    )
$$;

create or replace function public.can_manage_municipality_scope(_municipality_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
set row_security = off
as $$
  select
    public.is_admin_master()
    or (
      public.is_municipality_admin()
      and _municipality_id is not null
      and _municipality_id = public.current_municipality_id()
    )
$$;

create or replace function public.can_access_profile_scope(_profile_municipality_id uuid, _profile_user_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
set row_security = off
as $$
  select
    _profile_user_id = auth.uid()
    or public.is_admin_master()
    or (
      _profile_municipality_id is not null
      and _profile_municipality_id = public.current_municipality_id()
      and public.is_internal_municipality_role()
    )
$$;

create or replace function public.has_process_access(_process_id uuid, _user_id uuid default auth.uid())
returns boolean
language sql
stable security definer
set search_path to 'public'
set row_security = off
as $$
  with current_profile as (
    select
      p.user_id,
      p.municipality_id,
      p.role
    from public.profiles p
    where p.user_id = _user_id
      and p.deleted_at is null
    order by p.updated_at desc nulls last, p.id
    limit 1
  )
  select exists (
    select 1
    from public.processes pr
    cross join current_profile cp
    where pr.id = _process_id
      and (
        coalesce(cp.role, '') in ('master_admin', 'master_ops', 'admin_master')
        or (
          pr.municipality_id is not null
          and cp.municipality_id = pr.municipality_id
          and coalesce(cp.role, '') in (
            'prefeitura_admin',
            'prefeitura_supervisor',
            'analista',
            'financeiro',
            'setor_intersetorial',
            'fiscal',
            'admin_municipality',
            'analyst',
            'financial',
            'counter_service',
            'topography',
            'expedient'
          )
        )
        or (
          pr.municipality_id is not null
          and cp.municipality_id = pr.municipality_id
          and pr.created_by = _user_id
        )
        or exists (
          select 1
          from public.process_parties pp
          where pp.process_id = pr.id
            and pp.user_id = _user_id
            and (
              pp.municipality_id is null
              or cp.municipality_id is null
              or pp.municipality_id = cp.municipality_id
            )
        )
      )
  );
$$;
