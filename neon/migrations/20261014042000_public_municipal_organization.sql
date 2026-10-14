-- Estrutura institucional mínima para acompanhamento externo.
-- Não expõe contatos, usuários, cargos pessoais ou controles internos.

create or replace function public.list_public_municipal_departments_v1(
  _municipality_id uuid
)
returns table(
  id uuid,
  municipality_id uuid,
  code text,
  name text,
  parent_department_id uuid,
  unit_type text,
  sort_order integer,
  is_active boolean
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  _profile_id uuid := public.current_profile_id();
begin
  if _profile_id is null then
    raise exception 'Autenticação necessária para consultar a estrutura institucional.';
  end if;

  if not public.is_master()
     and not exists (
       select 1
       from public.profiles p
       where p.id = _profile_id
         and p.municipality_id = _municipality_id
         and p.deleted_at is null
         and coalesce(p.account_status, 'active') <> 'blocked'
     )
     and not exists (
       select 1
       from public.tenant_memberships tm
       where tm.profile_id = _profile_id
         and tm.tenant_id = _municipality_id
         and tm.is_active = true
         and tm.deleted_at is null
     )
     and not exists (
       select 1
       from public.processes pr
       where coalesce(pr.municipality_id, pr.tenant_id) = _municipality_id
         and public.has_process_access(pr.id)
     )
  then
    raise exception 'Sem acesso à estrutura institucional desta Prefeitura.';
  end if;

  return query
  select
    d.id,
    d.municipality_id,
    d.code,
    d.name,
    d.parent_department_id,
    d.unit_type,
    d.sort_order,
    d.is_active
  from public.departments d
  where d.municipality_id = _municipality_id
    and d.is_active = true
  order by d.sort_order, d.name;
end;
$function$;

revoke all on function public.list_public_municipal_departments_v1(uuid) from public;
grant execute on function public.list_public_municipal_departments_v1(uuid) to authenticated;
