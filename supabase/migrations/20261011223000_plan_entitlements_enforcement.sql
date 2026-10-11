begin;

alter table public.process_documents
  add column if not exists file_size_bytes bigint null;

create index if not exists idx_process_documents_municipality_size
  on public.process_documents(municipality_id, file_size_bytes)
  where is_valid = true;

create or replace function public.normalize_plan_module_key_v1(_value text)
returns text
language sql
immutable
as $$
  select lower(
    translate(
      btrim(coalesce(_value,'')),
      'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç',
      'AAAAEEIOOOUCaaaaeeiooouc'
    )
  );
$$;

create or replace function public.municipality_plan_entitlements_v1(_municipality_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  _assignment public.client_plan_assignments%rowtype;
  _plan public.plans%rowtype;
  _users bigint := 0;
  _processes bigint := 0;
  _departments bigint := 0;
  _storage_bytes bigint := 0;
  _contract_active boolean := false;
  _reason text := '';
begin
  select * into _assignment
  from public.client_plan_assignments
  where municipality_id=_municipality_id
  limit 1;

  if _assignment.id is not null then
    select * into _plan
    from public.plans
    where id=_assignment.plan_id
    limit 1;
  end if;

  select count(distinct tm.profile_id)
    into _users
  from public.tenant_memberships tm
  join public.roles r on r.id=tm.role_id
  where tm.tenant_id=_municipality_id
    and tm.profile_id is not null
    and tm.is_active=true
    and tm.deleted_at is null
    and r.code::text not in (
      'master_admin','master_ops','admin_master',
      'profissional','profissional_externo','proprietario_consulta'
    );

  select count(*)
    into _processes
  from public.processes p
  where coalesce(p.municipality_id,p.tenant_id)=_municipality_id
    and p.archived_at is null;

  select count(*)
    into _departments
  from public.departments d
  where d.municipality_id=_municipality_id
    and d.is_active=true;

  select coalesce(sum(greatest(coalesce(pd.file_size_bytes,0),0)),0)
    into _storage_bytes
  from public.process_documents pd
  where coalesce(pd.municipality_id,pd.tenant_id)=_municipality_id
    and pd.is_valid=true;

  if _assignment.id is null then
    _reason := 'Nenhum plano comercial foi vinculado a esta Prefeitura.';
  elsif _plan.id is null then
    _reason := 'O plano vinculado nao foi encontrado.';
  elsif not _plan.is_active then
    _reason := 'O plano vinculado esta inativo.';
  elsif _assignment.contract_status not in ('ativo','trial','upgrade','downgrade') then
    _reason := 'O contrato desta Prefeitura nao esta ativo.';
  elsif _assignment.starts_at is not null and _assignment.starts_at > current_date then
    _reason := 'O contrato desta Prefeitura ainda nao iniciou.';
  elsif _assignment.ends_at is not null and _assignment.ends_at < current_date then
    _reason := 'O contrato desta Prefeitura esta vencido.';
  else
    _contract_active := true;
  end if;

  return jsonb_build_object(
    'municipalityId',_municipality_id,
    'configured',_assignment.id is not null and _plan.id is not null,
    'contractActive',_contract_active,
    'contractReason',_reason,
    'assignmentId',_assignment.id,
    'planId',_plan.id,
    'planName',_plan.name,
    'contractStatus',_assignment.contract_status,
    'startsAt',_assignment.starts_at,
    'endsAt',_assignment.ends_at,
    'modules',coalesce(_plan.modules_included,'[]'::jsonb),
    'limits',jsonb_build_object(
      'users',_plan.max_users,
      'processes',_plan.max_processes,
      'departments',_plan.max_departments,
      'storageGb',_plan.max_storage_gb
    ),
    'usage',jsonb_build_object(
      'users',_users,
      'processes',_processes,
      'departments',_departments,
      'storageBytes',_storage_bytes
    )
  );
end;
$$;

create or replace function public.assert_municipality_entitlement_v1(
  _municipality_id uuid,
  _capability text,
  _increment bigint default 1
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  _snapshot jsonb;
  _module text;
  _allowed boolean;
  _limit bigint;
  _usage bigint;
  _storage_limit_bytes bigint;
begin
  if exists (
    select 1 from public.municipalities m
    where m.id=_municipality_id
      and m.subdomain='sigapro-plataforma'
  ) then
    return;
  end if;

  _snapshot := public.municipality_plan_entitlements_v1(_municipality_id);

  if coalesce((_snapshot->>'contractActive')::boolean,false)=false then
    raise exception 'Acesso contratual bloqueado: %', coalesce(nullif(_snapshot->>'contractReason',''),'plano nao configurado');
  end if;

  if _capability like 'module:%' then
    _module := public.normalize_plan_module_key_v1(substr(_capability,8));
    select exists (
      select 1
      from jsonb_array_elements_text(coalesce(_snapshot->'modules','[]'::jsonb)) value
      where public.normalize_plan_module_key_v1(value)=_module
    ) into _allowed;
    if not _allowed then
      raise exception 'Modulo nao contratado: %', substr(_capability,8);
    end if;
    return;
  end if;

  if _capability='users' then
    _limit := nullif(_snapshot#>>'{limits,users}','')::bigint;
    _usage := coalesce((_snapshot#>>'{usage,users}')::bigint,0);
  elsif _capability='processes' then
    _limit := nullif(_snapshot#>>'{limits,processes}','')::bigint;
    _usage := coalesce((_snapshot#>>'{usage,processes}')::bigint,0);
  elsif _capability='departments' then
    _limit := nullif(_snapshot#>>'{limits,departments}','')::bigint;
    _usage := coalesce((_snapshot#>>'{usage,departments}')::bigint,0);
  elsif _capability='storage_bytes' then
    if nullif(_snapshot#>>'{limits,storageGb}','') is null then
      return;
    end if;
    _storage_limit_bytes := (_snapshot#>>'{limits,storageGb}')::bigint * 1024 * 1024 * 1024;
    _usage := coalesce((_snapshot#>>'{usage,storageBytes}')::bigint,0);
    if _usage + greatest(coalesce(_increment,0),0) > _storage_limit_bytes then
      raise exception 'Limite de armazenamento do plano atingido.';
    end if;
    return;
  else
    raise exception 'Capacidade contratual desconhecida: %',_capability;
  end if;

  if _limit is not null and _usage + greatest(coalesce(_increment,0),0) > _limit then
    raise exception 'Limite de % do plano atingido (% de %).',_capability,_usage,_limit;
  end if;
end;
$$;

create or replace function public.guard_plan_process_insert_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  _municipality_id uuid := coalesce(new.municipality_id,new.tenant_id);
  _creator_role text;
begin
  perform public.assert_municipality_entitlement_v1(_municipality_id,'module:Protocolo digital',0);
  perform public.assert_municipality_entitlement_v1(_municipality_id,'processes',1);

  if new.created_by_profile_id is not null then
    select p.role into _creator_role from public.profiles p where p.id=new.created_by_profile_id;
    if _creator_role in ('profissional','profissional_externo','proprietario_consulta') then
      perform public.assert_municipality_entitlement_v1(_municipality_id,'module:Acesso externo',0);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_plan_process_insert_v1 on public.processes;
create trigger trg_guard_plan_process_insert_v1
before insert on public.processes
for each row execute function public.guard_plan_process_insert_v1();

create or replace function public.guard_plan_department_write_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
begin
  if new.is_active=true and (
    tg_op='INSERT' or old.is_active=false
  ) then
    perform public.assert_municipality_entitlement_v1(new.municipality_id,'module:Configurações',0);
    perform public.assert_municipality_entitlement_v1(new.municipality_id,'departments',1);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_plan_department_write_v1 on public.departments;
create trigger trg_guard_plan_department_write_v1
before insert or update of is_active on public.departments
for each row execute function public.guard_plan_department_write_v1();

create or replace function public.guard_plan_membership_write_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  _role_code text;
  _already_active boolean := false;
begin
  if new.is_active<>true or new.deleted_at is not null or new.profile_id is null then
    return new;
  end if;

  select r.code::text into _role_code from public.roles r where r.id=new.role_id;
  if _role_code in (
    'master_admin','master_ops','admin_master',
    'profissional','profissional_externo','proprietario_consulta'
  ) then
    return new;
  end if;

  select exists(
    select 1 from public.tenant_memberships tm
    join public.roles r on r.id=tm.role_id
    where tm.tenant_id=new.tenant_id
      and tm.profile_id=new.profile_id
      and tm.is_active=true
      and tm.deleted_at is null
      and (tg_op='INSERT' or tm.id<>new.id)
      and r.code::text not in (
        'master_admin','master_ops','admin_master',
        'profissional','profissional_externo','proprietario_consulta'
      )
  ) into _already_active;

  if not _already_active then
    perform public.assert_municipality_entitlement_v1(new.tenant_id,'users',1);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_plan_membership_write_v1 on public.tenant_memberships;
create trigger trg_guard_plan_membership_write_v1
before insert or update of is_active,deleted_at,role_id,profile_id on public.tenant_memberships
for each row execute function public.guard_plan_membership_write_v1();

create or replace function public.guard_plan_document_storage_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  _municipality_id uuid := coalesce(new.municipality_id,new.tenant_id);
  _increment bigint := greatest(coalesce(new.file_size_bytes,0) - case when tg_op='UPDATE' then coalesce(old.file_size_bytes,0) else 0 end,0);
begin
  if _increment>0 then
    perform public.assert_municipality_entitlement_v1(_municipality_id,'storage_bytes',_increment);
  end if;

  if tg_op='UPDATE' and (
    new.review_status is distinct from old.review_status
    or new.annotations is distinct from old.annotations
  ) then
    perform public.assert_municipality_entitlement_v1(_municipality_id,'module:Analise tecnica',0);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_plan_document_storage_v1 on public.process_documents;
create trigger trg_guard_plan_document_storage_v1
before insert or update of file_size_bytes,review_status,annotations on public.process_documents
for each row execute function public.guard_plan_document_storage_v1();

create or replace function public.guard_plan_analysis_process_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  _municipality_id uuid := coalesce(new.municipality_id,new.tenant_id);
begin
  if (
    new.analysis_started_at is distinct from old.analysis_started_at
    and new.analysis_started_at is not null
  ) or (
    new.status::text in ('analise_tecnica','reapresentacao','exigencia')
    and new.status is distinct from old.status
  ) then
    perform public.assert_municipality_entitlement_v1(_municipality_id,'module:Analise tecnica',0);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_plan_analysis_process_v1 on public.processes;
create trigger trg_guard_plan_analysis_process_v1
before update of analysis_started_at,status on public.processes
for each row execute function public.guard_plan_analysis_process_v1();

create or replace function public.guard_plan_requirement_insert_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  _municipality_id uuid;
begin
  select coalesce(p.municipality_id,p.tenant_id)
    into _municipality_id
  from public.processes p
  where p.id=new.process_id;

  if _municipality_id is not null then
    perform public.assert_municipality_entitlement_v1(_municipality_id,'module:Analise tecnica',0);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_plan_requirement_insert_v1 on public.process_requirements;
create trigger trg_guard_plan_requirement_insert_v1
before insert on public.process_requirements
for each row execute function public.guard_plan_requirement_insert_v1();

create or replace function public.guard_plan_payment_guide_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  _municipality_id uuid := coalesce(new.municipality_id,new.tenant_id);
begin
  if coalesce(new.guide_kind,'protocolo') <> 'protocolo' then
    perform public.assert_municipality_entitlement_v1(_municipality_id,'module:Financeiro',0);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_plan_payment_guide_v1 on public.payment_guides;
create trigger trg_guard_plan_payment_guide_v1
before insert or update of guide_kind on public.payment_guides
for each row execute function public.guard_plan_payment_guide_v1();

grant execute on function public.municipality_plan_entitlements_v1(uuid) to authenticated;
grant execute on function public.assert_municipality_entitlement_v1(uuid,text,bigint) to authenticated;

commit;
