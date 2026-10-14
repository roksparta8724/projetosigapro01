-- Organogram access must follow Neon profile-first authentication.
-- Internal staff receives the complete institutional record.
-- External accounts receive only public unit identity/hierarchy fields.

create or replace function public.list_municipal_departments_v1(_municipality_id uuid)
returns table(
  id uuid,
  municipality_id uuid,
  code text,
  name text,
  description text,
  email text,
  phone text,
  is_active boolean,
  parent_department_id uuid,
  unit_type text,
  sort_order integer
)
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $$
begin
  if not public.is_master() and not (
    public.can_access_municipality(_municipality_id)
    and public.is_internal_municipality_role()
  ) then
    raise exception 'Sem permissão para visualizar o organograma interno desta Prefeitura.';
  end if;

  return query
  select
    d.id,
    d.municipality_id,
    d.code,
    d.name,
    d.description,
    d.email,
    d.phone,
    d.is_active,
    d.parent_department_id,
    d.unit_type,
    d.sort_order
  from public.departments d
  where d.municipality_id = _municipality_id
  order by d.sort_order, d.name;
end;
$$;

create or replace function public.list_public_municipal_departments_v1(_municipality_id uuid)
returns table(
  id uuid,
  municipality_id uuid,
  code text,
  name text,
  description text,
  email text,
  phone text,
  is_active boolean,
  parent_department_id uuid,
  unit_type text,
  sort_order integer
)
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $$
begin
  if not public.can_access_municipality(_municipality_id) then
    raise exception 'Sem permissão para visualizar a estrutura institucional desta Prefeitura.';
  end if;

  return query
  select
    d.id,
    d.municipality_id,
    d.code,
    d.name,
    ''::text as description,
    ''::text as email,
    ''::text as phone,
    d.is_active,
    d.parent_department_id,
    d.unit_type,
    d.sort_order
  from public.departments d
  where d.municipality_id = _municipality_id
    and d.is_active = true
  order by d.sort_order, d.name;
end;
$$;

grant execute on function public.list_municipal_departments_v1(uuid) to authenticated;
grant execute on function public.list_public_municipal_departments_v1(uuid) to authenticated;
