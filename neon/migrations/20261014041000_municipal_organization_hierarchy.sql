-- Hierarquia canônica do organograma municipal no Neon.
-- Mantém compatibilidade com bancos que já receberam as colunas via migração legada.

alter table public.departments
  add column if not exists parent_department_id uuid null references public.departments(id) on delete set null,
  add column if not exists unit_type text not null default 'departamento',
  add column if not exists sort_order integer not null default 100;

create index if not exists idx_departments_parent
  on public.departments(municipality_id, parent_department_id, sort_order, name);

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
as $function$
declare
  _profile_id uuid := public.current_profile_id();
begin
  if not public.is_master()
     and (
       _profile_id is null
       or not exists (
         select 1
         from public.profiles p
         where p.id = _profile_id
           and p.municipality_id = _municipality_id
           and p.deleted_at is null
           and coalesce(p.account_status, 'active') <> 'blocked'
       )
     )
  then
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
$function$;

grant execute on function public.list_municipal_departments_v1(uuid) to authenticated;
