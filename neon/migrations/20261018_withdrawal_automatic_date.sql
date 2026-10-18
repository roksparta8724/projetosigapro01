-- SIGAPRO — data oficial automática da retirada física.
-- A data deixa de ser informada pelo navegador. O banco registra o dia oficial
-- no momento da primeira retirada e preserva essa data em atualizações futuras.

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
  _official_date date := (clock_timestamp() at time zone 'America/Sao_Paulo')::date;
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

  -- A primeira gravação recebe a data oficial do servidor municipal.
  -- Atualizações de nome/hash preservam a data histórica da retirada original.
  if tg_op='INSERT' then
    new.withdrawn_at := _official_date;
  else
    new.withdrawn_at := old.withdrawn_at;
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
  _official_date date := (clock_timestamp() at time zone 'America/Sao_Paulo')::date;
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

  if _hash is not null and _hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Hash da ficha inválido.';
  end if;

  if _name='' then
    raise exception 'Informe o nome de quem retirou o documento em mãos.';
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
    _official_date,
    _profile.id,
    _profile.user_id,
    clock_timestamp(),
    clock_timestamp()
  )
  on conflict (process_id, artifact_key)
  do update set
    artifact_hash=coalesce(excluded.artifact_hash, public.process_artifact_withdrawals.artifact_hash),
    withdrawn_by_name=excluded.withdrawn_by_name,
    withdrawn_at=public.process_artifact_withdrawals.withdrawn_at,
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
      ' em ', to_char(_row.withdrawn_at,'DD/MM/YYYY'),
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

notify pgrst, 'reload schema';
