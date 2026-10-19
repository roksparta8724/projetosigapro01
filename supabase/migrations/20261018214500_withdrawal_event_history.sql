-- SIGAPRO — histórico profissional de entrega física da ficha técnica.
-- Cada confirmação gera um evento imutável com nome, data e hora do servidor.
-- O registro corrente continua existindo para compatibilidade com o PDF/fluxo atual.

begin;

create table if not exists public.process_artifact_withdrawal_events (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null,
  municipality_id uuid,
  process_id uuid not null references public.processes(id) on delete cascade,
  artifact_key text not null,
  artifact_hash text,
  withdrawn_by_name text not null,
  withdrawn_at_exact timestamptz not null,
  recorded_by_profile_id uuid references public.profiles(id),
  recorded_by_user_id uuid,
  event_kind text not null default 'registro'
    check (event_kind in ('registro','retificacao','registro_inicial')),
  source_withdrawal_id uuid references public.process_artifact_withdrawals(id) on delete set null,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists ix_process_artifact_withdrawal_events_process
  on public.process_artifact_withdrawal_events(process_id, artifact_key, withdrawn_at_exact desc);

revoke all on public.process_artifact_withdrawal_events from public;

-- Preserva o registro que já existia antes da implantação do histórico.
insert into public.process_artifact_withdrawal_events(
  tenant_id,municipality_id,process_id,artifact_key,artifact_hash,
  withdrawn_by_name,withdrawn_at_exact,recorded_by_profile_id,
  recorded_by_user_id,event_kind,source_withdrawal_id,created_at
)
select
  w.tenant_id,w.municipality_id,w.process_id,w.artifact_key,w.artifact_hash,
  w.withdrawn_by_name,
  coalesce(
    w.withdrawn_at_exact,
    w.recorded_at,
    w.withdrawn_at::timestamp at time zone 'America/Sao_Paulo'
  ),
  w.recorded_by_profile_id,w.recorded_by_user_id,'registro_inicial',w.id,
  coalesce(w.recorded_at,clock_timestamp())
from public.process_artifact_withdrawals w
where not exists (
  select 1
  from public.process_artifact_withdrawal_events e
  where e.source_withdrawal_id=w.id
    and e.event_kind='registro_inicial'
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

  -- Cada confirmação representa um registro físico novo/retificado e recebe
  -- data e hora oficiais do servidor. Nunca aceitamos horário digitado no navegador.
  new.withdrawn_at := _official_date;
  new.withdrawn_at_exact := _official_timestamp;

  new.tenant_id := _process.tenant_id;
  new.municipality_id := _process.municipality_id;
  new.recorded_by_profile_id := _profile.id;
  new.recorded_by_user_id := _profile.user_id;
  new.recorded_at := case
    when tg_op='INSERT' then _official_timestamp
    else coalesce(old.recorded_at,_official_timestamp)
  end;
  new.updated_at := _official_timestamp;

  return new;
end;
$$;

create or replace function private.append_process_artifact_withdrawal_event_v1()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
set row_security to 'off'
as $$
begin
  insert into public.process_artifact_withdrawal_events(
    tenant_id,municipality_id,process_id,artifact_key,artifact_hash,
    withdrawn_by_name,withdrawn_at_exact,recorded_by_profile_id,
    recorded_by_user_id,event_kind,source_withdrawal_id,created_at
  )
  values(
    new.tenant_id,new.municipality_id,new.process_id,new.artifact_key,new.artifact_hash,
    new.withdrawn_by_name,
    coalesce(new.withdrawn_at_exact,new.updated_at,new.recorded_at,clock_timestamp()),
    new.recorded_by_profile_id,new.recorded_by_user_id,
    case when tg_op='INSERT' then 'registro' else 'retificacao' end,
    new.id,clock_timestamp()
  );

  return new;
end;
$$;

drop trigger if exists trg_append_process_artifact_withdrawal_event_v1
  on public.process_artifact_withdrawals;

create trigger trg_append_process_artifact_withdrawal_event_v1
after insert or update on public.process_artifact_withdrawals
for each row
execute function private.append_process_artifact_withdrawal_event_v1();

create or replace function public.get_process_artifact_withdrawal_history_v1(
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
  _events jsonb := '[]'::jsonb;
begin
  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',e.id,
        'artifact_hash',e.artifact_hash,
        'withdrawn_by_name',e.withdrawn_by_name,
        'withdrawn_at_exact',e.withdrawn_at_exact,
        'recorded_by_profile_id',e.recorded_by_profile_id,
        'recorded_by_name',coalesce(nullif(btrim(p.full_name),''),nullif(btrim(p.email),''),'Sistema'),
        'event_kind',e.event_kind,
        'created_at',e.created_at
      )
      order by e.withdrawn_at_exact desc,e.created_at desc
    ),
    '[]'::jsonb
  )
  into _events
  from public.process_artifact_withdrawal_events e
  left join public.profiles p on p.id=e.recorded_by_profile_id
  where e.process_id=_process_id
    and e.artifact_key=_key;

  return jsonb_build_object('events',_events);
end;
$$;

revoke all on function public.get_process_artifact_withdrawal_history_v1(uuid,text) from public;
grant execute on function public.get_process_artifact_withdrawal_history_v1(uuid,text) to authenticated;

comment on function public.get_process_artifact_withdrawal_history_v1(uuid,text)
is 'Lista imutável de registros/retificações de retirada física, com data e hora oficiais do servidor.';

commit;

notify pgrst, 'reload schema';
