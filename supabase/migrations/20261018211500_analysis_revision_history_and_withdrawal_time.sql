-- SIGAPRO — retificação auditável da análise e horário oficial da retirada física.
-- Preserva todos os blocos de assinatura já existentes e expõe o histórico de versões
-- sem sobrescrever versões antigas.

begin;

alter table public.process_artifact_withdrawals
  add column if not exists withdrawn_at_exact timestamptz;

-- Registros anteriores continuam usando recorded_at como fallback de horário.
-- Novas retiradas recebem withdrawn_at_exact diretamente do servidor.

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
  _official_timestamp timestamptz := clock_timestamp();
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
    'master_admin','master_ops','prefeitura_admin','prefeitura_supervisor','analista','analyst'
  ) then
    raise exception 'Somente o Analista Técnico responsável pode registrar a retirada física.';
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
    raise exception 'Informe o nome de quem retirou o documento.';
  end if;

  if tg_op='INSERT' then
    new.withdrawn_at := _official_date;
    new.withdrawn_at_exact := _official_timestamp;
    new.recorded_at := _official_timestamp;
  else
    new.withdrawn_at := old.withdrawn_at;
    new.withdrawn_at_exact := coalesce(old.withdrawn_at_exact, old.recorded_at, _official_timestamp);
  end if;

  new.tenant_id := _process.tenant_id;
  new.municipality_id := _process.municipality_id;
  new.recorded_by_profile_id := _profile.id;
  new.recorded_by_user_id := _profile.user_id;
  new.updated_at := _official_timestamp;

  return new;
end;
$$;

create or replace function private.audit_process_artifact_withdrawal_v1()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
set row_security to 'off'
as $$
declare
  _moment timestamptz := coalesce(new.withdrawn_at_exact,new.recorded_at,new.updated_at,clock_timestamp());
begin
  if tg_op='UPDATE'
     and old.withdrawn_by_name is not distinct from new.withdrawn_by_name
     and old.withdrawn_at is not distinct from new.withdrawn_at
     and old.artifact_hash is not distinct from new.artifact_hash then
    return new;
  end if;

  insert into public.process_audit_entries(
    tenant_id,municipality_id,process_id,actor_user_id,actor_profile_id,
    category,title,detail,visible_to_external,created_at
  )
  values(
    new.tenant_id,new.municipality_id,new.process_id,
    new.recorded_by_user_id,new.recorded_by_profile_id,
    'retirada',
    case when tg_op='INSERT' then 'Retirada física registrada' else 'Registro de retirada física retificado' end,
    concat(
      'Retirado por ',new.withdrawn_by_name,
      ' em ',to_char(_moment at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI'),
      case when new.artifact_hash is not null then concat(' • SHA-256 ',new.artifact_hash) else '' end
    ),
    true,clock_timestamp()
  );

  return new;
end;
$$;

create or replace function public.get_process_artifact_version_history_v1(
  _process_id uuid,
  _artifact_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $$
declare
  _key text := lower(btrim(coalesce(_artifact_key,'')));
  _versions jsonb := '[]'::jsonb;
begin
  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',b.id,
        'artifact_type',b.artifact_type,
        'artifact_key',b.artifact_key,
        'artifact_version',b.artifact_version,
        'artifact_hash',b.evidence_hash,
        'verification_code',b.verification_code,
        'completed_at',b.completed_at,
        'payload',b.artifact_payload,
        'signers',coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'profile_id',s.signer_profile_id,
                'name',s.signer_name,
                'role',s.signer_role,
                'title',s.signer_title,
                'slot',s.signer_slot,
                'signed_at',s.signed_at,
                'status',s.status
              )
              order by s.signed_at
            )
            from public.signatures s
            where s.signature_block_id=b.id
              and s.status='concluido'
          ),
          '[]'::jsonb
        )
      )
      order by b.artifact_version desc
    ),
    '[]'::jsonb
  )
  into _versions
  from public.signature_blocks b
  where b.process_id=_process_id
    and b.document_id is null
    and b.artifact_key=_key
    and b.status='concluido';

  return jsonb_build_object('versions',_versions);
end;
$$;

revoke all on function public.get_process_artifact_version_history_v1(uuid,text) from public;
grant execute on function public.get_process_artifact_version_history_v1(uuid,text) to authenticated;

commit;

notify pgrst, 'reload schema';
