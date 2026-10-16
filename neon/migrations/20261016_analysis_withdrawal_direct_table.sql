-- SIGAPRO — acesso direto e protegido ao registro de retirada em mãos.
-- Remove dependência do RPC novo no cliente e evita falhas de schema cache PGRST202.

begin;

alter table public.process_artifact_withdrawals enable row level security;

grant select, insert, update on table public.process_artifact_withdrawals to authenticated;

drop policy if exists process_artifact_withdrawals_select on public.process_artifact_withdrawals;
create policy process_artifact_withdrawals_select
on public.process_artifact_withdrawals
for select
to authenticated
using (public.has_process_access(process_id));

drop policy if exists process_artifact_withdrawals_insert on public.process_artifact_withdrawals;
create policy process_artifact_withdrawals_insert
on public.process_artifact_withdrawals
for insert
to authenticated
with check (
  public.has_process_access(process_id)
  and lower(coalesce(public.current_role_code(),'')) in (
    'master_admin',
    'master_ops',
    'prefeitura_admin',
    'prefeitura_supervisor',
    'analista',
    'analyst'
  )
);

drop policy if exists process_artifact_withdrawals_update on public.process_artifact_withdrawals;
create policy process_artifact_withdrawals_update
on public.process_artifact_withdrawals
for update
to authenticated
using (
  public.has_process_access(process_id)
  and lower(coalesce(public.current_role_code(),'')) in (
    'master_admin',
    'master_ops',
    'prefeitura_admin',
    'prefeitura_supervisor',
    'analista',
    'analyst'
  )
)
with check (
  public.has_process_access(process_id)
  and lower(coalesce(public.current_role_code(),'')) in (
    'master_admin',
    'master_ops',
    'prefeitura_admin',
    'prefeitura_supervisor',
    'analista',
    'analyst'
  )
);

create or replace function private.prepare_process_artifact_withdrawal_v1()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
set row_security to 'off'
as $$
declare
  _process public.processes%rowtype;
  _profile public.profiles%rowtype;
  _role text;
begin
  select * into _profile
  from public.profiles
  where id=public.current_profile_id()
    and deleted_at is null
    and account_status='active';

  if _profile.id is null then
    raise exception 'Perfil autenticado inválido.';
  end if;

  select * into _process
  from public.processes
  where id=new.process_id;

  if _process.id is null or not public.has_process_access(_process.id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  _role := lower(coalesce(public.current_role_code(), _profile.role, ''));

  if _role not in (
    'master_admin',
    'master_ops',
    'prefeitura_admin',
    'prefeitura_supervisor',
    'analista',
    'analyst'
  ) then
    raise exception 'Somente o Analista Técnico responsável pode registrar a retirada em mãos.';
  end if;

  new.artifact_key := lower(btrim(coalesce(new.artifact_key,'')));
  new.artifact_hash := nullif(lower(btrim(coalesce(new.artifact_hash,''))), '');
  new.withdrawn_by_name := btrim(coalesce(new.withdrawn_by_name,''));

  if new.artifact_key='' then
    raise exception 'Identificação da ficha inválida.';
  end if;

  if new.artifact_hash is not null and new.artifact_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Hash da ficha inválido.';
  end if;

  if new.withdrawn_by_name='' then
    raise exception 'Informe o nome de quem retirou o documento em mãos.';
  end if;

  if new.withdrawn_at is null then
    raise exception 'Informe a data da retirada.';
  end if;

  new.tenant_id := _process.tenant_id;
  new.municipality_id := _process.municipality_id;
  new.recorded_by_profile_id := _profile.id;
  new.recorded_by_user_id := _profile.user_id;

  if tg_op='INSERT' then
    new.recorded_at := clock_timestamp();
  end if;

  new.updated_at := clock_timestamp();

  return new;
end;
$$;

drop trigger if exists trg_prepare_process_artifact_withdrawal_v1
on public.process_artifact_withdrawals;

create trigger trg_prepare_process_artifact_withdrawal_v1
before insert or update on public.process_artifact_withdrawals
for each row
execute function private.prepare_process_artifact_withdrawal_v1();

create or replace function private.audit_process_artifact_withdrawal_v1()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
set row_security to 'off'
as $$
begin
  if tg_op='UPDATE'
     and old.withdrawn_by_name is not distinct from new.withdrawn_by_name
     and old.withdrawn_at is not distinct from new.withdrawn_at
     and old.artifact_hash is not distinct from new.artifact_hash then
    return new;
  end if;

  insert into public.process_audit_entries(
    tenant_id,
    municipality_id,
    process_id,
    actor_user_id,
    actor_profile_id,
    category,
    title,
    detail,
    visible_to_external,
    created_at
  )
  values(
    new.tenant_id,
    new.municipality_id,
    new.process_id,
    new.recorded_by_user_id,
    new.recorded_by_profile_id,
    'retirada',
    case when tg_op='INSERT' then 'Retirada em mãos registrada' else 'Retirada em mãos atualizada' end,
    concat(
      'Retirado por ', new.withdrawn_by_name,
      ' em ', to_char(new.withdrawn_at,'DD/MM/YYYY'),
      case when new.artifact_hash is not null then concat(' • SHA-256 ', new.artifact_hash) else '' end
    ),
    true,
    clock_timestamp()
  );

  return new;
end;
$$;

drop trigger if exists trg_audit_process_artifact_withdrawal_v1
on public.process_artifact_withdrawals;

create trigger trg_audit_process_artifact_withdrawal_v1
after insert or update on public.process_artifact_withdrawals
for each row
execute function private.audit_process_artifact_withdrawal_v1();

commit;

notify pgrst, 'reload schema';
