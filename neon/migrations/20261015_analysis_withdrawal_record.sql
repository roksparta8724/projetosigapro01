-- SIGAPRO — registro de retirada física da ficha/documento.
-- Mantido separado do payload assinado para não invalidar as assinaturas eletrônicas
-- quando o analista registrar posteriormente quem retirou o documento em mãos.

begin;

create table if not exists public.process_artifact_withdrawals (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null,
  municipality_id uuid,
  process_id uuid not null references public.processes(id) on delete cascade,
  artifact_key text not null,
  artifact_hash text,
  withdrawn_by_name text not null,
  withdrawn_at date not null,
  recorded_by_profile_id uuid references public.profiles(id),
  recorded_by_user_id uuid,
  recorded_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

drop index if exists public.ux_process_artifact_withdrawals_version;

create unique index if not exists ux_process_artifact_withdrawals_process_artifact
  on public.process_artifact_withdrawals(process_id, artifact_key);

create index if not exists ix_process_artifact_withdrawals_process
  on public.process_artifact_withdrawals(process_id, artifact_key, updated_at desc);

revoke all on table public.process_artifact_withdrawals from authenticated;

create or replace function public.get_process_artifact_withdrawal_v1(
  _process_id uuid,
  _artifact_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
set row_security to 'off'
as $$
declare
  _row public.process_artifact_withdrawals%rowtype;
begin
  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  select *
    into _row
  from public.process_artifact_withdrawals
  where process_id=_process_id
    and artifact_key=lower(btrim(coalesce(_artifact_key,'')))
  order by updated_at desc
  limit 1;

  if _row.id is null then
    return jsonb_build_object('withdrawal', null);
  end if;

  return jsonb_build_object(
    'withdrawal', jsonb_build_object(
      'id', _row.id,
      'artifact_hash', _row.artifact_hash,
      'withdrawn_by_name', _row.withdrawn_by_name,
      'withdrawn_at', _row.withdrawn_at,
      'recorded_by_profile_id', _row.recorded_by_profile_id,
      'recorded_at', _row.recorded_at,
      'updated_at', _row.updated_at
    )
  );
end;
$$;

create or replace function public.upsert_process_artifact_withdrawal_v1(
  _process_id uuid,
  _artifact_key text,
  _artifact_hash text,
  _withdrawn_by_name text,
  _withdrawn_at date
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
set row_security to 'off'
as $$
declare
  _process public.processes%rowtype;
  _profile public.profiles%rowtype;
  _role text;
  _key text := lower(btrim(coalesce(_artifact_key,'')));
  _hash text := nullif(lower(btrim(coalesce(_artifact_hash,''))), '');
  _name text := btrim(coalesce(_withdrawn_by_name,''));
  _row public.process_artifact_withdrawals%rowtype;
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
  where id=_process_id;

  if _process.id is null or not public.has_process_access(_process.id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  _role := lower(coalesce(public.current_role_code(), _profile.role, ''));

  if _role not in ('master_admin','master_ops','prefeitura_admin','prefeitura_supervisor','analista','analyst') then
    raise exception 'Somente o analista responsável pode registrar a retirada em mãos.';
  end if;

  if _key='' then
    raise exception 'Identificação da ficha inválida.';
  end if;

  if _hash is not null and _hash !~ '^[0-9a-f]{64}

  insert into public.process_artifact_withdrawals(
    tenant_id,
    municipality_id,
    process_id,
    artifact_key,
    artifact_hash,
    withdrawn_by_name,
    withdrawn_at,
    recorded_by_profile_id,
    recorded_by_user_id,
    recorded_at,
    updated_at
  )
  values(
    _process.tenant_id,
    _process.municipality_id,
    _process.id,
    _key,
    _hash,
    _name,
    _withdrawn_at,
    _profile.id,
    _profile.user_id,
    clock_timestamp(),
    clock_timestamp()
  )
  on conflict (process_id, artifact_key)
  do update set
    artifact_hash=coalesce(excluded.artifact_hash, public.process_artifact_withdrawals.artifact_hash),
    withdrawn_by_name=excluded.withdrawn_by_name,
    withdrawn_at=excluded.withdrawn_at,
    recorded_by_profile_id=excluded.recorded_by_profile_id,
    recorded_by_user_id=excluded.recorded_by_user_id,
    updated_at=clock_timestamp()
  returning * into _row;

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
    _process.tenant_id,
    _process.municipality_id,
    _process.id,
    _profile.user_id,
    _profile.id,
    'retirada',
    'Retirada em mãos registrada',
    concat(
      'Retirado por ', _name,
      ' em ', to_char(_withdrawn_at,'DD/MM/YYYY'),
      case when _hash is not null then concat(' • SHA-256 ', _hash) else '' end
    ),
    true,
    clock_timestamp()
  );

  return jsonb_build_object(
    'ok', true,
    'withdrawal', jsonb_build_object(
      'id', _row.id,
      'artifact_hash', _row.artifact_hash,
      'withdrawn_by_name', _row.withdrawn_by_name,
      'withdrawn_at', _row.withdrawn_at,
      'recorded_by_profile_id', _row.recorded_by_profile_id,
      'recorded_at', _row.recorded_at,
      'updated_at', _row.updated_at
    )
  );
end;
$$;

revoke all on function public.get_process_artifact_withdrawal_v1(uuid,text) from public;
revoke all on function public.upsert_process_artifact_withdrawal_v1(uuid,text,text,text,date) from public;

grant execute on function public.get_process_artifact_withdrawal_v1(uuid,text) to authenticated;
grant execute on function public.upsert_process_artifact_withdrawal_v1(uuid,text,text,text,date) to authenticated;

commit;

notify pgrst, 'reload schema';
 then
    raise exception 'Hash da ficha inválido.';
  end if;

  if _name='' then
    raise exception 'Informe o nome de quem retirou o documento em mãos.';
  end if;

  if _withdrawn_at is null then
    raise exception 'Informe a data da retirada.';
  end if;

  insert into public.process_artifact_withdrawals(
    tenant_id,
    municipality_id,
    process_id,
    artifact_key,
    artifact_hash,
    withdrawn_by_name,
    withdrawn_at,
    recorded_by_profile_id,
    recorded_by_user_id,
    recorded_at,
    updated_at
  )
  values(
    _process.tenant_id,
    _process.municipality_id,
    _process.id,
    _key,
    _hash,
    _name,
    _withdrawn_at,
    _profile.id,
    _profile.user_id,
    clock_timestamp(),
    clock_timestamp()
  )
  on conflict (process_id, artifact_key, artifact_hash)
  do update set
    withdrawn_by_name=excluded.withdrawn_by_name,
    withdrawn_at=excluded.withdrawn_at,
    recorded_by_profile_id=excluded.recorded_by_profile_id,
    recorded_by_user_id=excluded.recorded_by_user_id,
    updated_at=clock_timestamp()
  returning * into _row;

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
    _process.tenant_id,
    _process.municipality_id,
    _process.id,
    _profile.user_id,
    _profile.id,
    'retirada',
    'Retirada em mãos registrada',
    concat(
      'Retirado por ', _name,
      ' em ', to_char(_withdrawn_at,'DD/MM/YYYY'),
      ' • SHA-256 ', _hash
    ),
    true,
    clock_timestamp()
  );

  return jsonb_build_object(
    'ok', true,
    'withdrawal', jsonb_build_object(
      'id', _row.id,
      'artifact_hash', _row.artifact_hash,
      'withdrawn_by_name', _row.withdrawn_by_name,
      'withdrawn_at', _row.withdrawn_at,
      'recorded_by_profile_id', _row.recorded_by_profile_id,
      'recorded_at', _row.recorded_at,
      'updated_at', _row.updated_at
    )
  );
end;
$$;

revoke all on function public.get_process_artifact_withdrawal_v1(uuid,text) from public;
revoke all on function public.upsert_process_artifact_withdrawal_v1(uuid,text,text,text,date) from public;

grant execute on function public.get_process_artifact_withdrawal_v1(uuid,text) to authenticated;
grant execute on function public.upsert_process_artifact_withdrawal_v1(uuid,text,text,text,date) to authenticated;

commit;

notify pgrst, 'reload schema';
