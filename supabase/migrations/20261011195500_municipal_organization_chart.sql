begin;

alter table public.departments
  add column if not exists parent_department_id uuid null references public.departments(id) on delete set null,
  add column if not exists unit_type text not null default 'departamento',
  add column if not exists sort_order integer not null default 100;

create index if not exists idx_departments_parent
  on public.departments(municipality_id, parent_department_id, sort_order, name);

create or replace function public.upsert_municipal_department_v1(
  _municipality_id uuid,
  _department_id uuid default null,
  _name text default null,
  _code text default null,
  _description text default null,
  _email text default null,
  _phone text default null,
  _parent_department_id uuid default null,
  _unit_type text default 'departamento',
  _sort_order integer default 100,
  _is_active boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _id uuid;
  _row public.departments%rowtype;
begin
  if not public.is_master() and not public.can_manage_municipality(_municipality_id) then
    raise exception 'Sem permissão para administrar o organograma desta Prefeitura.';
  end if;

  if nullif(btrim(coalesce(_name,'')),'') is null then
    raise exception 'Informe o nome da unidade.';
  end if;

  if _parent_department_id is not null and not exists (
    select 1 from public.departments
    where id=_parent_department_id and municipality_id=_municipality_id
  ) then
    raise exception 'A unidade superior não pertence a esta Prefeitura.';
  end if;

  if _department_id is null then
    insert into public.departments(
      municipality_id, code, name, description, email, phone, is_active,
      parent_department_id, unit_type, sort_order, updated_at
    ) values (
      _municipality_id, nullif(btrim(coalesce(_code,'')),''),
      btrim(_name), nullif(btrim(coalesce(_description,'')),''),
      nullif(lower(btrim(coalesce(_email,''))),''),
      nullif(btrim(coalesce(_phone,'')),''),
      coalesce(_is_active,true), _parent_department_id,
      coalesce(nullif(btrim(_unit_type),''),'departamento'),
      coalesce(_sort_order,100), now()
    )
    returning id into _id;
  else
    update public.departments
       set code=nullif(btrim(coalesce(_code,'')),''),
           name=btrim(_name),
           description=nullif(btrim(coalesce(_description,'')),''),
           email=nullif(lower(btrim(coalesce(_email,''))),''),
           phone=nullif(btrim(coalesce(_phone,'')),''),
           is_active=coalesce(_is_active,true),
           parent_department_id=_parent_department_id,
           unit_type=coalesce(nullif(btrim(_unit_type),''),'departamento'),
           sort_order=coalesce(_sort_order,100),
           updated_at=now()
     where id=_department_id and municipality_id=_municipality_id
     returning id into _id;
    if _id is null then raise exception 'Unidade não encontrada.'; end if;
  end if;

  select * into _row from public.departments where id=_id;
  return to_jsonb(_row);
end;
$$;

create or replace function public.assign_profile_department_v1(
  _municipality_id uuid,
  _profile_id uuid,
  _department_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _department_name text;
  _profile public.profiles%rowtype;
begin
  if not public.is_master() and not public.can_manage_municipality(_municipality_id) then
    raise exception 'Sem permissão para administrar a equipe desta Prefeitura.';
  end if;

  if _department_id is not null then
    select name into _department_name
    from public.departments
    where id=_department_id and municipality_id=_municipality_id and is_active;
    if _department_name is null then raise exception 'Departamento inválido ou inativo.'; end if;
  end if;

  update public.profiles
     set department_id=_department_id, updated_at=now()
   where id=_profile_id and municipality_id=_municipality_id and deleted_at is null
   returning * into _profile;

  if _profile.id is null then raise exception 'Usuário não pertence a esta Prefeitura.'; end if;

  update public.tenant_memberships
     set department=_department_name, updated_at=now()
   where tenant_id=_municipality_id and profile_id=_profile_id and deleted_at is null;

  return jsonb_build_object(
    'profile_id', _profile.id,
    'municipality_id', _profile.municipality_id,
    'department_id', _profile.department_id,
    'department_name', _department_name
  );
end;
$$;

grant execute on function public.upsert_municipal_department_v1(uuid,uuid,text,text,text,text,text,uuid,text,integer,boolean) to authenticated;
grant execute on function public.assign_profile_department_v1(uuid,uuid,uuid) to authenticated;

commit;
