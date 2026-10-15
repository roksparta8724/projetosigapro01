-- SIGAPRO 2026-10-15
-- Alvará de Construção com dupla assinatura municipal.
-- IMPORTANTE: migration versionada para o deploy final. NÃO aplicada ao banco oficial nesta fase local.

create table if not exists public.construction_permits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  municipality_id uuid null references public.municipalities(id) on delete set null,
  process_id uuid not null unique references public.processes(id) on delete cascade,
  signature_block_id uuid null references public.signature_blocks(id) on delete set null,
  permit_number text not null,
  status text not null default 'rascunho'
    check (status in ('rascunho','aguardando_diretor','emitido','cancelado')),
  snapshot jsonb not null default '{}'::jsonb,
  analyst_profile_id uuid null references public.profiles(id) on delete set null,
  analyst_name text null,
  analyst_title text null,
  analyst_signed_at timestamptz null,
  director_profile_id uuid null references public.profiles(id) on delete set null,
  director_name text null,
  director_title text null,
  director_signed_at timestamptz null,
  document_hash text null,
  issued_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists construction_permits_municipality_number_key
  on public.construction_permits(municipality_id, permit_number)
  where municipality_id is not null;

create index if not exists idx_construction_permits_process
  on public.construction_permits(process_id);

create index if not exists idx_construction_permits_status
  on public.construction_permits(municipality_id, status);

alter table public.construction_permits enable row level security;

drop policy if exists construction_permits_select_scoped on public.construction_permits;
create policy construction_permits_select_scoped
on public.construction_permits
for select
using (
  public.is_master()
  or (
    public.has_process_access(process_id)
    and (
      status = 'emitido'
      or coalesce(public.current_role_code(), '') not in (
        'profissional_externo',
        'proprietario_consulta',
        'property_owner'
      )
    )
  )
);

revoke insert, update, delete on public.construction_permits from public;

create or replace function public.prepare_construction_permit_v1(
  _process_id uuid,
  _permit_number text,
  _snapshot jsonb default '{}'::jsonb
)
returns public.construction_permits
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _profile_id uuid := public.current_profile_id();
  _role text := coalesce(public.current_role_code(), '');
  _process public.processes%rowtype;
  _block_id uuid;
  _result public.construction_permits%rowtype;
begin
  if _profile_id is null then
    raise exception 'Sessão municipal inválida.';
  end if;

  if _role not in ('analista','prefeitura_supervisor','master_admin','master_ops') then
    raise exception 'Somente a Análise Técnica responsável pode preparar o Alvará.';
  end if;

  select * into _process
  from public.processes
  where id = _process_id
  for update;

  if not found or not public.has_process_access(_process_id) then
    raise exception 'Processo não encontrado ou sem acesso.';
  end if;

  if _role not in ('master_admin','master_ops','prefeitura_supervisor')
     and _process.analysis_assigned_to_profile_id is not null
     and _process.analysis_assigned_to_profile_id <> _profile_id then
    raise exception 'O Alvará deve ser preparado pelo analista responsável pelo processo.';
  end if;

  if not exists (
    select 1
    from public.payment_guides pg
    where pg.process_id = _process_id
      and pg.guide_kind = 'iss_obra'
      and (pg.status in ('compensada','confirmed','paid') or pg.paid = true)
  ) then
    raise exception 'A Guia de ISSQN / Projeto ainda não foi compensada.';
  end if;

  if exists (
    select 1
    from public.process_documents pd
    where pd.process_id = _process_id
      and pd.is_valid = true
      and pd.is_required = true
      and coalesce(pd.review_status,'pendente') <> 'aprovado'
  ) then
    raise exception 'Existem documentos obrigatórios sem aprovação.';
  end if;

  select cp.* into _result
  from public.construction_permits cp
  where cp.process_id = _process_id;

  if found then
    return _result;
  end if;

  insert into public.signature_blocks(
    tenant_id,
    municipality_id,
    process_id,
    document_id,
    title,
    status,
    evidence
  )
  values (
    _process.tenant_id,
    _process.municipality_id,
    _process_id,
    null,
    'Alvará de Construção - ' || _permit_number,
    'pendente',
    jsonb_build_object(
      'document_type','construction_permit',
      'permit_number',_permit_number,
      'process_id',_process_id
    )
  )
  returning id into _block_id;

  insert into public.construction_permits(
    tenant_id,
    municipality_id,
    process_id,
    signature_block_id,
    permit_number,
    status,
    snapshot
  )
  values (
    _process.tenant_id,
    _process.municipality_id,
    _process_id,
    _block_id,
    _permit_number,
    'rascunho',
    coalesce(_snapshot,'{}'::jsonb)
  )
  returning * into _result;

  return _result;
end;
$function$;

create or replace function public.sign_construction_permit_analyst_v1(
  _process_id uuid
)
returns public.construction_permits
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _profile_id uuid := public.current_profile_id();
  _role text := coalesce(public.current_role_code(), '');
  _permit public.construction_permits%rowtype;
  _profile public.profiles%rowtype;
  _title text;
  _now timestamptz := now();
begin
  if _profile_id is null then
    raise exception 'Sessão municipal inválida.';
  end if;

  if _role not in ('analista','prefeitura_supervisor','master_admin','master_ops') then
    raise exception 'Perfil sem permissão para assinatura técnica.';
  end if;

  select cp.* into _permit
  from public.construction_permits cp
  where cp.process_id = _process_id
  for update;

  if not found or not public.has_process_access(_process_id) then
    raise exception 'Alvará não encontrado ou sem acesso.';
  end if;

  if _permit.status = 'emitido' then
    return _permit;
  end if;

  if _role not in ('master_admin','master_ops','prefeitura_supervisor')
     and exists (
       select 1 from public.processes p
       where p.id = _process_id
         and p.analysis_assigned_to_profile_id is not null
         and p.analysis_assigned_to_profile_id <> _profile_id
     ) then
    raise exception 'Somente o analista responsável pode assinar esta etapa.';
  end if;

  select * into _profile from public.profiles where id = _profile_id;
  select coalesce(tm.position_title,tm.profile_label,'Analista Técnico')
  into _title
  from public.tenant_memberships tm
  where tm.profile_id = _profile_id
    and tm.tenant_id = _permit.tenant_id
    and tm.is_active = true
    and tm.deleted_at is null
  order by tm.updated_at desc nulls last
  limit 1;

  update public.construction_permits
  set analyst_profile_id = _profile_id,
      analyst_name = coalesce(_profile.full_name,_profile.email,'Analista Técnico'),
      analyst_title = coalesce(_title,'Analista Técnico'),
      analyst_signed_at = _now,
      status = case when director_signed_at is not null then 'emitido' else 'aguardando_diretor' end,
      issued_at = case when director_signed_at is not null then coalesce(issued_at,_now) else issued_at end,
      updated_at = _now
  where id = _permit.id
  returning * into _permit;

  insert into public.signatures(
    tenant_id,
    municipality_id,
    signature_block_id,
    signer_user_id,
    signer_profile_id,
    signer_name,
    signer_role,
    signer_order,
    status,
    signed_at
  )
  values (
    _permit.tenant_id,
    _permit.municipality_id,
    _permit.signature_block_id,
    _profile.user_id,
    _profile_id,
    _permit.analyst_name,
    _permit.analyst_title,
    1,
    'concluido',
    _now
  );

  return _permit;
end;
$function$;

create or replace function public.sign_construction_permit_director_v1(
  _process_id uuid
)
returns public.construction_permits
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _profile_id uuid := public.current_profile_id();
  _permit public.construction_permits%rowtype;
  _profile public.profiles%rowtype;
  _membership public.tenant_memberships%rowtype;
  _position text;
  _department text;
  _now timestamptz := now();
begin
  if _profile_id is null then
    raise exception 'Sessão municipal inválida.';
  end if;

  select cp.* into _permit
  from public.construction_permits cp
  where cp.process_id = _process_id
  for update;

  if not found or not public.has_process_access(_process_id) then
    raise exception 'Alvará não encontrado ou sem acesso.';
  end if;

  if _permit.analyst_signed_at is null then
    raise exception 'A assinatura da Análise Técnica deve ocorrer antes da Diretoria.';
  end if;

  select tm.* into _membership
  from public.tenant_memberships tm
  where tm.profile_id = _profile_id
    and tm.tenant_id = _permit.tenant_id
    and tm.is_active = true
    and tm.deleted_at is null
  order by tm.updated_at desc nulls last
  limit 1;

  _position := lower(translate(
    coalesce(_membership.position_title,'') || ' ' || coalesce(_membership.profile_label,''),
    'ÁÀÃÂÉÊÍÓÔÕÚÇáàãâéêíóôõúç',
    'AAAAEEIOOOUCaaaaeeiooouc'
  ));
  _department := lower(translate(
    coalesce(_membership.department,''),
    'ÁÀÃÂÉÊÍÓÔÕÚÇáàãâéêíóôõúç',
    'AAAAEEIOOOUCaaaaeeiooouc'
  ));

  if _position !~ '(diretor|diretora)'
     or _department !~ '(urban|obra|planejamento|projeto|habitacao)' then
    raise exception 'A assinatura final exige usuário cadastrado como Diretor/Diretora da área de Planejamento Urbano ou Obras.';
  end if;

  select * into _profile from public.profiles where id = _profile_id;

  update public.construction_permits
  set director_profile_id = _profile_id,
      director_name = coalesce(_profile.full_name,_profile.email,'Diretor'),
      director_title = coalesce(_membership.position_title,_membership.profile_label,'Diretor'),
      director_signed_at = _now,
      status = 'emitido',
      issued_at = coalesce(issued_at,_now),
      updated_at = _now
  where id = _permit.id
  returning * into _permit;

  insert into public.signatures(
    tenant_id,
    municipality_id,
    signature_block_id,
    signer_user_id,
    signer_profile_id,
    signer_name,
    signer_role,
    signer_order,
    status,
    signed_at
  )
  values (
    _permit.tenant_id,
    _permit.municipality_id,
    _permit.signature_block_id,
    _profile.user_id,
    _profile_id,
    _permit.director_name,
    _permit.director_title,
    2,
    'concluido',
    _now
  );

  update public.signature_blocks
  set status = 'concluido',
      evidence = coalesce(evidence,'{}'::jsonb) || jsonb_build_object(
        'completed_at',_now,
        'permit_number',_permit.permit_number
      )
  where id = _permit.signature_block_id;

  update public.processes
  set status = 'deferido',
      process_checkpoint = 'Alvará de Construção emitido',
      updated_at = _now
  where id = _process_id;

  insert into public.process_audit_entries(
    tenant_id,
    municipality_id,
    process_id,
    actor_user_id,
    actor_profile_id,
    category,
    title,
    detail,
    visible_to_external
  )
  values (
    _permit.tenant_id,
    _permit.municipality_id,
    _process_id,
    _profile.user_id,
    _profile_id,
    'assinatura',
    'Alvará de Construção emitido',
    'Alvará ' || _permit.permit_number || ' concluído após assinatura da Análise Técnica e da Diretoria responsável.',
    true
  );

  return _permit;
end;
$function$;

revoke all on function public.prepare_construction_permit_v1(uuid,text,jsonb) from public;
revoke all on function public.sign_construction_permit_analyst_v1(uuid) from public;
revoke all on function public.sign_construction_permit_director_v1(uuid) from public;

grant execute on function public.prepare_construction_permit_v1(uuid,text,jsonb) to authenticated;
grant execute on function public.sign_construction_permit_analyst_v1(uuid) to authenticated;
grant execute on function public.sign_construction_permit_director_v1(uuid) to authenticated;

comment on table public.construction_permits is
  'Alvarás de Construção do SIGAPRO. O documento final exige assinatura da análise técnica e da Diretoria responsável.';

notify pgrst, 'reload schema';
