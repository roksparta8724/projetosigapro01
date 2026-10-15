-- SIGAPRO — solicitação formal de assinatura da Diretoria para a ficha de análise.
-- Fluxo: Analista assina -> solicita Diretoria -> Diretor recebe pendência -> assina com senha -> PDF exibe a assinatura.

begin;

create table if not exists public.process_signature_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null,
  municipality_id uuid,
  process_id uuid not null references public.processes(id) on delete cascade,
  artifact_key text not null,
  artifact_hash text not null,
  signer_slot text not null,
  status text not null default 'pending',
  requested_by_profile_id uuid references public.profiles(id),
  requested_by_user_id uuid,
  assigned_profile_id uuid references public.profiles(id),
  requested_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  completed_by_profile_id uuid references public.profiles(id),
  note text,
  constraint ck_process_signature_requests_status
    check (status in ('pending','completed','cancelled','stale')),
  constraint ck_process_signature_requests_slot
    check (signer_slot in ('diretoria','secretaria','profissional','conferencia_fiscal'))
);

create unique index if not exists ux_process_signature_requests_pending
  on public.process_signature_requests(process_id, artifact_key, artifact_hash, signer_slot)
  where status='pending';

create index if not exists ix_process_signature_requests_process
  on public.process_signature_requests(process_id, signer_slot, requested_at desc);

revoke all on table public.process_signature_requests from authenticated;

create or replace function public.get_process_artifact_signature_context_v1(
  _process_id uuid,
  _signer_slot text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
set row_security to 'off'
as $$
declare
  _profile public.profiles%rowtype;
  _process public.processes%rowtype;
  _role text;
  _position text;
  _registration text;
  _slot text := lower(btrim(coalesce(_signer_slot,'')));
  _allowed boolean := false;
begin
  if _slot not in ('analise_tecnica','conferencia_fiscal','diretoria','secretaria','profissional') then
    raise exception 'Tipo de assinatura inválido.';
  end if;

  select * into _profile
  from public.profiles
  where id = public.current_profile_id()
    and deleted_at is null
    and account_status = 'active';

  if _profile.id is null then
    raise exception 'Perfil autenticado inválido.';
  end if;

  select * into _process
  from public.processes
  where id = _process_id;

  if _process.id is null or not public.has_process_access(_process.id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  _role := lower(coalesce(public.current_role_code(), _profile.role, ''));

  select coalesce(
      nullif(btrim(tm.position_title), ''),
      nullif(btrim(tm.profile_label), ''),
      nullif(btrim(r.label), '')
    )
    into _position
  from public.tenant_memberships tm
  left join public.roles r on r.id = tm.role_id
  where tm.profile_id = _profile.id
    and tm.tenant_id = _process.tenant_id
    and tm.is_active = true
    and tm.deleted_at is null
  order by tm.updated_at desc nulls last, tm.created_at desc nulls last
  limit 1;

  _position := coalesce(_position, nullif(btrim(_profile.professional_type), ''), _role);
  _registration := nullif(btrim(_profile.registration_number), '');

  if _slot = 'analise_tecnica' then
    _allowed :=
      _role in ('master_admin','master_ops','prefeitura_admin','prefeitura_supervisor','analista','analyst')
      or lower(coalesce(_position,'')) ~ '(diretor|diretora|secret[aá]ri)';
  elsif _slot = 'conferencia_fiscal' then
    _allowed :=
      _role in ('master_admin','master_ops','prefeitura_admin','prefeitura_supervisor','fiscal')
      or lower(coalesce(_position,'')) ~ '(fiscal|diretor|diretora|secret[aá]ri)';
  elsif _slot = 'diretoria' then
    _allowed :=
      lower(coalesce(_profile.tipo,'')) <> 'externo'
      and (
        _role in ('diretor','director','prefeitura_diretor','prefeitura_diretora')
        or lower(coalesce(_position,'')) ~ '(diretor|diretora)'
      );
  elsif _slot = 'secretaria' then
    _allowed :=
      lower(coalesce(_profile.tipo,'')) <> 'externo'
      and (
        _role in ('secretario','secretaria','secretary','prefeitura_secretario','prefeitura_secretaria')
        or lower(coalesce(_position,'')) ~ '(secret[aá]ri)'
      );
  elsif _slot = 'profissional' then
    _allowed :=
      _role in ('profissional_externo','professional_external','professional','profissional');
  end if;

  if not _allowed then
    raise exception 'Este perfil não possui atribuição para esta assinatura.';
  end if;

  return jsonb_build_object(
    'auth_subject', public.current_auth_subject(),
    'profile_id', _profile.id,
    'user_id', _profile.user_id,
    'email', lower(coalesce(_profile.email,'')),
    'name', coalesce(nullif(btrim(_profile.full_name),''), _profile.email, 'Usuário'),
    'role', _role,
    'title', _position,
    'registration', _registration,
    'signer_slot', _slot,
    'process_id', _process.id,
    'tenant_id', _process.tenant_id,
    'municipality_id', _process.municipality_id,
    'protocol_number', _process.protocol_number,
    'process_title', _process.title
  );
end;
$$;

create or replace function public.get_process_artifact_signature_request_v1(
  _process_id uuid,
  _artifact_key text,
  _signer_slot text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
set row_security to 'off'
as $$
declare
  _request public.process_signature_requests%rowtype;
  _key text := lower(btrim(coalesce(_artifact_key,'')));
  _slot text := lower(btrim(coalesce(_signer_slot,'')));
  _requester_name text;
  _completed_name text;
  _candidate_count integer := 0;
begin
  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  select *
    into _request
  from public.process_signature_requests
  where process_id=_process_id
    and artifact_key=_key
    and signer_slot=_slot
  order by
    case status when 'pending' then 0 when 'completed' then 1 else 2 end,
    requested_at desc
  limit 1;

  select count(distinct p.id)::int
    into _candidate_count
  from public.processes pr
  join public.profiles p
    on p.municipality_id=pr.municipality_id
   and p.deleted_at is null
   and p.account_status='active'
  left join public.tenant_memberships tm
    on tm.profile_id=p.id
   and tm.tenant_id=pr.tenant_id
   and tm.is_active=true
   and tm.deleted_at is null
  left join public.roles r on r.id=tm.role_id
  where pr.id=_process_id
    and lower(coalesce(p.tipo,'')) <> 'externo'
    and (
      lower(coalesce(tm.position_title,'')) ~ '(diretor|diretora)'
      or lower(coalesce(tm.profile_label,'')) ~ '(diretor|diretora)'
      or lower(coalesce(r.code::text,'')) ~ '(diretor|director)'
      or lower(coalesce(p.role,'')) ~ '(diretor|director)'
    );

  if _request.id is null then
    return jsonb_build_object(
      'request', null,
      'candidate_count', _candidate_count
    );
  end if;

  select coalesce(nullif(btrim(full_name),''), email, 'Servidor')
    into _requester_name
  from public.profiles
  where id=_request.requested_by_profile_id;

  select coalesce(nullif(btrim(full_name),''), email, 'Servidor')
    into _completed_name
  from public.profiles
  where id=_request.completed_by_profile_id;

  return jsonb_build_object(
    'request', jsonb_build_object(
      'id', _request.id,
      'status', _request.status,
      'signer_slot', _request.signer_slot,
      'artifact_key', _request.artifact_key,
      'artifact_hash', _request.artifact_hash,
      'requested_at', _request.requested_at,
      'requested_by_profile_id', _request.requested_by_profile_id,
      'requested_by_name', _requester_name,
      'assigned_profile_id', _request.assigned_profile_id,
      'completed_at', _request.completed_at,
      'completed_by_profile_id', _request.completed_by_profile_id,
      'completed_by_name', _completed_name,
      'note', _request.note
    ),
    'candidate_count', _candidate_count
  );
end;
$$;

create or replace function public.request_process_artifact_signature_v1(
  _process_id uuid,
  _artifact_key text,
  _artifact_hash text,
  _signer_slot text default 'diretoria'
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
  _block public.signature_blocks%rowtype;
  _request public.process_signature_requests%rowtype;
  _key text := lower(btrim(coalesce(_artifact_key,'')));
  _hash text := lower(btrim(coalesce(_artifact_hash,'')));
  _slot text := lower(btrim(coalesce(_signer_slot,'')));
  _role text;
  _created boolean := false;
  _candidate_count integer := 0;
begin
  if _slot <> 'diretoria' then
    raise exception 'Somente a assinatura da Diretoria pode ser solicitada por este fluxo.';
  end if;

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

  select * into _block
  from public.signature_blocks
  where process_id=_process_id
    and document_id is null
    and artifact_key=_key
    and evidence_hash=_hash
    and status='concluido'
  order by artifact_version desc
  limit 1;

  if _block.id is null then
    raise exception 'A versão assinada da ficha não foi localizada.';
  end if;

  if not exists (
    select 1 from public.signatures
    where signature_block_id=_block.id
      and signer_slot='analise_tecnica'
      and status='concluido'
  ) then
    raise exception 'A análise técnica precisa estar assinada antes de solicitar a Diretoria.';
  end if;

  if not (
    exists (
      select 1 from public.signatures
      where signature_block_id=_block.id
        and signer_slot='analise_tecnica'
        and signer_profile_id=_profile.id
        and status='concluido'
    )
    or _role in ('master_admin','master_ops','prefeitura_admin','prefeitura_supervisor')
  ) then
    raise exception 'Somente o analista responsável ou a administração pode solicitar a assinatura da Diretoria.';
  end if;

  if exists (
    select 1 from public.signatures
    where signature_block_id=_block.id
      and signer_slot='diretoria'
      and status='concluido'
  ) then
    raise exception 'A Diretoria já assinou eletronicamente esta versão.';
  end if;

  update public.process_signature_requests
  set status='stale'
  where process_id=_process_id
    and artifact_key=_key
    and signer_slot=_slot
    and status='pending'
    and artifact_hash<>_hash;

  insert into public.process_signature_requests(
    tenant_id, municipality_id, process_id, artifact_key, artifact_hash,
    signer_slot, status, requested_by_profile_id, requested_by_user_id
  )
  values(
    _process.tenant_id, _process.municipality_id, _process.id, _key, _hash,
    _slot, 'pending', _profile.id, _profile.user_id
  )
  on conflict do nothing
  returning * into _request;

  if _request.id is not null then
    _created := true;
  else
    select * into _request
    from public.process_signature_requests
    where process_id=_process_id
      and artifact_key=_key
      and artifact_hash=_hash
      and signer_slot=_slot
      and status='pending'
    order by requested_at desc
    limit 1;
  end if;

  select count(distinct p.id)::int
    into _candidate_count
  from public.profiles p
  left join public.tenant_memberships tm
    on tm.profile_id=p.id
   and tm.tenant_id=_process.tenant_id
   and tm.is_active=true
   and tm.deleted_at is null
  left join public.roles r on r.id=tm.role_id
  where p.municipality_id=_process.municipality_id
    and p.deleted_at is null
    and p.account_status='active'
    and lower(coalesce(p.tipo,'')) <> 'externo'
    and (
      lower(coalesce(tm.position_title,'')) ~ '(diretor|diretora)'
      or lower(coalesce(tm.profile_label,'')) ~ '(diretor|diretora)'
      or lower(coalesce(r.code::text,'')) ~ '(diretor|director)'
      or lower(coalesce(p.role,'')) ~ '(diretor|director)'
    );

  if _created then
    insert into public.notifications(
      user_id, related_project_id, title, message, type, is_read, created_at, profile_id
    )
    select
      p.user_id,
      _process.id,
      'Assinatura da Diretoria solicitada',
      concat(
        'O processo ',
        coalesce(_process.protocol_number, _process.id::text),
        ' aguarda sua assinatura eletrônica na ficha de análise.'
      ),
      'signature_request',
      false,
      clock_timestamp(),
      p.id
    from public.profiles p
    left join public.tenant_memberships tm
      on tm.profile_id=p.id
     and tm.tenant_id=_process.tenant_id
     and tm.is_active=true
     and tm.deleted_at is null
    left join public.roles r on r.id=tm.role_id
    where p.municipality_id=_process.municipality_id
      and p.deleted_at is null
      and p.account_status='active'
      and lower(coalesce(p.tipo,'')) <> 'externo'
      and (
        lower(coalesce(tm.position_title,'')) ~ '(diretor|diretora)'
        or lower(coalesce(tm.profile_label,'')) ~ '(diretor|diretora)'
        or lower(coalesce(r.code::text,'')) ~ '(diretor|director)'
        or lower(coalesce(p.role,'')) ~ '(diretor|director)'
      );

    insert into public.process_audit_entries(
      tenant_id, municipality_id, process_id,
      actor_user_id, actor_profile_id,
      category, title, detail, visible_to_external, created_at
    )
    values(
      _process.tenant_id,
      _process.municipality_id,
      _process.id,
      _profile.user_id,
      _profile.id,
      'assinatura',
      'Assinatura da Diretoria solicitada',
      concat(
        'Solicitação enviada para a Diretoria • SHA-256 ',
        _hash
      ),
      false,
      clock_timestamp()
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'created', _created,
    'candidate_count', _candidate_count,
    'request', jsonb_build_object(
      'id', _request.id,
      'status', _request.status,
      'signer_slot', _request.signer_slot,
      'artifact_key', _request.artifact_key,
      'artifact_hash', _request.artifact_hash,
      'requested_at', _request.requested_at,
      'requested_by_profile_id', _request.requested_by_profile_id
    )
  );
end;
$$;

create or replace function private.enforce_process_signature_request()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
set row_security to 'off'
as $$
declare
  _block public.signature_blocks%rowtype;
begin
  if lower(coalesce(new.signer_slot,'')) <> 'diretoria' then
    return new;
  end if;

  select * into _block
  from public.signature_blocks
  where id=new.signature_block_id;

  if _block.id is null then
    raise exception 'Bloco de assinatura inválido.';
  end if;

  if not exists (
    select 1
    from public.process_signature_requests r
    where r.process_id=_block.process_id
      and r.artifact_key=_block.artifact_key
      and r.artifact_hash=_block.evidence_hash
      and r.signer_slot='diretoria'
      and r.status='pending'
  ) then
    raise exception 'A assinatura da Diretoria ainda não foi solicitada pelo analista.';
  end if;

  return new;
end;
$$;

create or replace function private.complete_process_signature_request()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
set row_security to 'off'
as $$
declare
  _block public.signature_blocks%rowtype;
begin
  if lower(coalesce(new.signer_slot,'')) <> 'diretoria' or new.status <> 'concluido' then
    return new;
  end if;

  select * into _block
  from public.signature_blocks
  where id=new.signature_block_id;

  update public.process_signature_requests
  set status='completed',
      completed_at=coalesce(new.signed_at, clock_timestamp()),
      completed_by_profile_id=new.signer_profile_id
  where process_id=_block.process_id
    and artifact_key=_block.artifact_key
    and artifact_hash=_block.evidence_hash
    and signer_slot='diretoria'
    and status='pending';

  update public.notifications
  set is_read=true
  where related_project_id=_block.process_id
    and type='signature_request'
    and coalesce(is_read,false)=false;

  return new;
end;
$$;

drop trigger if exists trg_enforce_process_signature_request on public.signatures;
create trigger trg_enforce_process_signature_request
before insert on public.signatures
for each row
execute function private.enforce_process_signature_request();

drop trigger if exists trg_complete_process_signature_request on public.signatures;
create trigger trg_complete_process_signature_request
after insert on public.signatures
for each row
execute function private.complete_process_signature_request();

revoke all on function public.get_process_artifact_signature_request_v1(uuid,text,text) from public;
revoke all on function public.request_process_artifact_signature_v1(uuid,text,text,text) from public;

grant execute on function public.get_process_artifact_signature_request_v1(uuid,text,text) to authenticated;
grant execute on function public.request_process_artifact_signature_v1(uuid,text,text,text) to authenticated;

commit;

notify pgrst, 'reload schema';
