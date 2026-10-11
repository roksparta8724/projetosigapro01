-- SIGAPRO: início real da Análise Urbanística.
-- Evita usar set_process_status para um processo que já está em analise_tecnica
-- e registra de forma idempotente qual analista assumiu a análise.

alter table public.processes
  add column if not exists analysis_assigned_to text,
  add column if not exists analysis_assigned_to_profile_id uuid,
  add column if not exists analysis_started_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'processes_analysis_assigned_to_profile_id_fkey'
      and conrelid = 'public.processes'::regclass
  ) then
    alter table public.processes
      add constraint processes_analysis_assigned_to_profile_id_fkey
      foreign key (analysis_assigned_to_profile_id)
      references public.profiles(id)
      on delete set null;
  end if;
end
$$;

create index if not exists idx_processes_analysis_assigned_to_profile_id
  on public.processes(analysis_assigned_to_profile_id);

create or replace function public.start_process_analysis(_process_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _tenant_id uuid;
  _municipality_id uuid;
  _from_status public.process_status;
  _existing_assignee uuid;
  _existing_started_at timestamptz;
  _analyst_name text;
  _movement public.process_movements%rowtype;
  _audit public.process_audit_entries%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  select p.tenant_id,
         p.municipality_id,
         p.status,
         p.analysis_assigned_to_profile_id,
         p.analysis_started_at
    into _tenant_id,
         _municipality_id,
         _from_status,
         _existing_assignee,
         _existing_started_at
  from public.processes p
  where p.id = _process_id
  for update;

  if _tenant_id is null then
    raise exception 'Processo nao encontrado';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  if not (public.is_master() or public.is_internal_municipality_role()) then
    raise exception 'Sem permissao para iniciar analise';
  end if;

  if _from_status not in (
    'distribuicao'::public.process_status,
    'analise_tecnica'::public.process_status,
    'reapresentacao'::public.process_status
  ) then
    raise exception 'Processo nao esta disponivel para inicio da analise';
  end if;

  select coalesce(nullif(btrim(p.full_name),''), nullif(btrim(p.email),''), 'Analista')
    into _analyst_name
  from public.profiles p
  where p.id = _profile_id
    and p.deleted_at is null;

  _analyst_name := coalesce(_analyst_name, 'Analista');

  if _existing_assignee is not null
     and _existing_assignee <> _profile_id then
    raise exception 'Processo ja esta em analise por outro usuario';
  end if;

  if _existing_assignee = _profile_id
     and _existing_started_at is not null
     and _from_status = 'analise_tecnica'::public.process_status then
    return jsonb_build_object(
      'process_id', _process_id,
      'status', 'analise_tecnica',
      'assigned_to', _analyst_name,
      'assigned_to_profile_id', _profile_id,
      'started_at', _existing_started_at,
      'existing', true
    );
  end if;

  update public.processes
     set status = 'analise_tecnica'::public.process_status,
         current_department = 'Análise Urbanística',
         current_queue = 'Análise Urbanística',
         sla_stage = 'Análise Urbanística em andamento',
         process_checkpoint = 'Análise Urbanística em andamento',
         analysis_assigned_to = _analyst_name,
         analysis_assigned_to_profile_id = _profile_id,
         analysis_started_at = coalesce(analysis_started_at, now()),
         sla_breached = false,
         updated_at = now()
   where id = _process_id;

  if _from_status <> 'analise_tecnica'::public.process_status then
    insert into public.process_movements(
      tenant_id, process_id, actor_user_id, movement_type,
      from_status, to_status, description, created_at,
      visible_to_external, municipality_id, actor_profile_id
    )
    values(
      _tenant_id, _process_id, _legacy_user_id, 'status_change',
      _from_status, 'analise_tecnica'::public.process_status,
      'Análise Urbanística iniciada por ' || _analyst_name || '.',
      now(), true, _municipality_id, _profile_id
    )
    returning * into _movement;
  end if;

  insert into public.process_audit_entries(
    tenant_id, process_id, actor_user_id, category, title, detail,
    visible_to_external, created_at, municipality_id, actor_profile_id
  )
  values(
    _tenant_id, _process_id, _legacy_user_id, 'status',
    'Análise Urbanística iniciada',
    'Processo assumido por ' || _analyst_name || ' para análise urbanística.',
    true, now(), _municipality_id, _profile_id
  )
  returning * into _audit;

  return jsonb_build_object(
    'process_id', _process_id,
    'status', 'analise_tecnica',
    'assigned_to', _analyst_name,
    'assigned_to_profile_id', _profile_id,
    'started_at', (select analysis_started_at from public.processes where id = _process_id),
    'existing', false,
    'movement', case when _movement.id is null then null else to_jsonb(_movement) end,
    'audit', to_jsonb(_audit)
  );
end;
$function$;

revoke all on function public.start_process_analysis(uuid) from public;
grant execute on function public.start_process_analysis(uuid) to authenticated;
