begin;

create or replace function public.list_municipal_departments_v1(
  _municipality_id uuid
) returns table (
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
set search_path = public
as $$
begin
  if not public.is_master() and not exists (
    select 1
      from public.profiles p
     where p.user_id = auth.uid()
       and p.municipality_id = _municipality_id
       and p.deleted_at is null
       and coalesce(p.account_status, 'active') <> 'blocked'
  ) then
    raise exception 'Sem permissão para visualizar o organograma desta Prefeitura.';
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

grant execute on function public.list_municipal_departments_v1(uuid) to authenticated;

commit;
