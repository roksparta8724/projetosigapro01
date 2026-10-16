-- SIGAPRO — fluxo persistente do Alvará de Construção.
-- O formulário deixa de depender somente do localStorage e pode ser encaminhado
-- pelo Analista à Diretoria antes da geração do PDF.

begin;

create table if not exists public.process_construction_permits (
  id uuid primary key default extensions.gen_random_uuid(),
  tenant_id uuid not null,
  municipality_id uuid,
  process_id uuid not null references public.processes(id) on delete cascade,
  permit_number text not null,
  form_data jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  signature_mode text,
  director_requested_at timestamptz,
  director_requested_by_profile_id uuid references public.profiles(id),
  manual_pdf_prepared_at timestamptz,
  manual_pdf_prepared_by_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint ck_process_construction_permits_status
    check (status in ('draft','awaiting_director','manual_signature','signed')),
  constraint ck_process_construction_permits_signature_mode
    check (signature_mode is null or signature_mode in ('electronic','manual'))
);

create unique index if not exists ux_process_construction_permits_process
  on public.process_construction_permits(process_id);

create index if not exists ix_process_construction_permits_status
  on public.process_construction_permits(tenant_id, status, updated_at desc);

revoke all on table public.process_construction_permits from authenticated;

create or replace function public.get_construction_permit_v1(
  _process_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $$
declare
  _row public.process_construction_permits%rowtype;
begin
  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  select * into _row
  from public.process_construction_permits
  where process_id=_process_id;

  if _row.id is null then
    return jsonb_build_object('permit', null);
  end if;

  return jsonb_build_object(
    'permit', jsonb_build_object(
      'id', _row.id,
      'process_id', _row.process_id,
      'municipality_id', _row.municipality_id,
      'permit_number', _row.permit_number,
      'form_data', _row.form_data,
      'status', _row.status,
      'signature_mode', _row.signature_mode,
      'director_requested_at', _row.director_requested_at,
      'director_requested_by_profile_id', _row.director_requested_by_profile_id,
      'manual_pdf_prepared_at', _row.manual_pdf_prepared_at,
      'created_at', _row.created_at,
      'updated_at', _row.updated_at
    )
  );
end;
$$;

create or replace function public.save_construction_permit_draft_v1(
  _process_id uuid,
  _permit_number text,
  _form_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $$
declare
  _process public.processes%rowtype;
  _profile public.profiles%rowtype;
  _role text;
  _row public.process_construction_permits%rowtype;
begin
  select * into _profile
  from public.profiles
  where id=public.current_profile_id()
    and deleted_at is null
    and account_status='active';

  select * into _process
  from public.processes
  where id=_process_id;

  if _profile.id is null or _process.id is null or not public.has_process_access(_process.id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  _role := lower(coalesce(public.current_role_code(), _profile.role, ''));

  if _role not in ('master_admin','master_ops','prefeitura_admin','prefeitura_supervisor','analista','analyst') then
    raise exception 'Somente o Analista Técnico pode preparar o Alvará.';
  end if;

  if btrim(coalesce(_permit_number,''))='' or _form_data is null or jsonb_typeof(_form_data)<>'object' then
    raise exception 'Dados do Alvará inválidos.';
  end if;

  insert into public.process_construction_permits(
    tenant_id, municipality_id, process_id, permit_number, form_data,
    status, signature_mode, director_requested_at,
    director_requested_by_profile_id, manual_pdf_prepared_at,
    manual_pdf_prepared_by_profile_id, created_at, updated_at
  )
  values(
    _process.tenant_id, _process.municipality_id, _process.id,
    btrim(_permit_number), _form_data,
    'draft', null, null, null, null, null,
    clock_timestamp(), clock_timestamp()
  )
  on conflict (process_id)
  do update set
    permit_number=excluded.permit_number,
    form_data=excluded.form_data,
    status='draft',
    signature_mode=null,
    director_requested_at=null,
    director_requested_by_profile_id=null,
    manual_pdf_prepared_at=null,
    manual_pdf_prepared_by_profile_id=null,
    updated_at=clock_timestamp()
  returning * into _row;

  return jsonb_build_object(
    'ok', true,
    'permit', jsonb_build_object(
      'id', _row.id,
      'process_id', _row.process_id,
      'municipality_id', _row.municipality_id,
      'permit_number', _row.permit_number,
      'form_data', _row.form_data,
      'status', _row.status,
      'signature_mode', _row.signature_mode,
      'director_requested_at', _row.director_requested_at,
      'director_requested_by_profile_id', _row.director_requested_by_profile_id,
      'manual_pdf_prepared_at', _row.manual_pdf_prepared_at,
      'created_at', _row.created_at,
      'updated_at', _row.updated_at
    )
  );
end;
$$;

create or replace function public.request_construction_permit_director_signature_v1(
  _process_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $$
declare
  _process public.processes%rowtype;
  _profile public.profiles%rowtype;
  _role text;
  _row public.process_construction_permits%rowtype;
begin
  select * into _profile
  from public.profiles
  where id=public.current_profile_id()
    and deleted_at is null
    and account_status='active';

  select * into _process
  from public.processes
  where id=_process_id;

  if _profile.id is null or _process.id is null or not public.has_process_access(_process.id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  _role := lower(coalesce(public.current_role_code(), _profile.role, ''));

  if _role not in ('master_admin','master_ops','prefeitura_admin','prefeitura_supervisor','analista','analyst') then
    raise exception 'Somente o Analista Técnico pode solicitar a assinatura da Diretoria.';
  end if;

  select * into _row
  from public.process_construction_permits
  where process_id=_process_id
  for update;

  if _row.id is null then
    raise exception 'Salve primeiro o preenchimento do Alvará.';
  end if;

  update public.process_construction_permits
  set status='awaiting_director',
      signature_mode='electronic',
      director_requested_at=clock_timestamp(),
      director_requested_by_profile_id=_profile.id,
      manual_pdf_prepared_at=null,
      manual_pdf_prepared_by_profile_id=null,
      updated_at=clock_timestamp()
  where id=_row.id
  returning * into _row;

  insert into public.process_audit_entries(
    tenant_id, municipality_id, process_id,
    actor_user_id, actor_profile_id,
    category, title, detail, visible_to_external, created_at
  )
  values(
    _process.tenant_id, _process.municipality_id, _process.id,
    _profile.user_id, _profile.id,
    'assinatura',
    'Assinatura do Alvará solicitada à Diretoria',
    concat('Alvará ', _row.permit_number, ' encaminhado para assinatura eletrônica da Diretoria.'),
    false,
    clock_timestamp()
  );

  return jsonb_build_object(
    'ok', true,
    'permit', jsonb_build_object(
      'id', _row.id,
      'process_id', _row.process_id,
      'municipality_id', _row.municipality_id,
      'permit_number', _row.permit_number,
      'form_data', _row.form_data,
      'status', _row.status,
      'signature_mode', _row.signature_mode,
      'director_requested_at', _row.director_requested_at,
      'director_requested_by_profile_id', _row.director_requested_by_profile_id,
      'manual_pdf_prepared_at', _row.manual_pdf_prepared_at,
      'created_at', _row.created_at,
      'updated_at', _row.updated_at
    )
  );
end;
$$;

create or replace function public.mark_construction_permit_manual_pdf_v1(
  _process_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $$
declare
  _process public.processes%rowtype;
  _profile public.profiles%rowtype;
  _role text;
  _row public.process_construction_permits%rowtype;
begin
  select * into _profile
  from public.profiles
  where id=public.current_profile_id()
    and deleted_at is null
    and account_status='active';

  select * into _process
  from public.processes
  where id=_process_id;

  if _profile.id is null or _process.id is null or not public.has_process_access(_process.id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  _role := lower(coalesce(public.current_role_code(), _profile.role, ''));

  if _role not in ('master_admin','master_ops','prefeitura_admin','prefeitura_supervisor','analista','analyst') then
    raise exception 'Somente o Analista Técnico pode preparar o PDF para assinatura manual.';
  end if;

  update public.process_construction_permits
  set status='manual_signature',
      signature_mode='manual',
      director_requested_at=null,
      director_requested_by_profile_id=null,
      manual_pdf_prepared_at=clock_timestamp(),
      manual_pdf_prepared_by_profile_id=_profile.id,
      updated_at=clock_timestamp()
  where process_id=_process_id
  returning * into _row;

  if _row.id is null then
    raise exception 'Salve primeiro o preenchimento do Alvará.';
  end if;

  insert into public.process_audit_entries(
    tenant_id, municipality_id, process_id,
    actor_user_id, actor_profile_id,
    category, title, detail, visible_to_external, created_at
  )
  values(
    _process.tenant_id, _process.municipality_id, _process.id,
    _profile.user_id, _profile.id,
    'assinatura',
    'Alvará preparado para assinatura manual',
    concat('PDF do Alvará ', _row.permit_number, ' preparado para assinatura à caneta pela Diretoria.'),
    false,
    clock_timestamp()
  );

  return jsonb_build_object(
    'ok', true,
    'permit', jsonb_build_object(
      'id', _row.id,
      'process_id', _row.process_id,
      'municipality_id', _row.municipality_id,
      'permit_number', _row.permit_number,
      'form_data', _row.form_data,
      'status', _row.status,
      'signature_mode', _row.signature_mode,
      'director_requested_at', _row.director_requested_at,
      'director_requested_by_profile_id', _row.director_requested_by_profile_id,
      'manual_pdf_prepared_at', _row.manual_pdf_prepared_at,
      'created_at', _row.created_at,
      'updated_at', _row.updated_at
    )
  );
end;
$$;

create or replace function private.complete_construction_permit_signature()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
set row_security to 'off'
as $
declare
  _block public.signature_blocks%rowtype;
begin
  if new.status <> 'concluido' then
    return new;
  end if;

  select * into _block
  from public.signature_blocks
  where id=new.signature_block_id;

  if _block.id is null or _block.artifact_type <> 'construction_permit' then
    return new;
  end if;

  if new.signer_slot='diretoria' then
    update public.process_construction_permits
    set status='signed',
        signature_mode='electronic',
        updated_at=clock_timestamp()
    where process_id=_block.process_id;
  end if;

  return new;
end;
$;

drop trigger if exists trg_complete_construction_permit_signature on public.signatures;
create trigger trg_complete_construction_permit_signature
after insert on public.signatures
for each row
execute function private.complete_construction_permit_signature();

revoke all on function public.get_construction_permit_v1(uuid) from public;
revoke all on function public.save_construction_permit_draft_v1(uuid,text,jsonb) from public;
revoke all on function public.request_construction_permit_director_signature_v1(uuid) from public;
revoke all on function public.mark_construction_permit_manual_pdf_v1(uuid) from public;

grant execute on function public.get_construction_permit_v1(uuid) to authenticated;
grant execute on function public.save_construction_permit_draft_v1(uuid,text,jsonb) to authenticated;
grant execute on function public.request_construction_permit_director_signature_v1(uuid) to authenticated;
grant execute on function public.mark_construction_permit_manual_pdf_v1(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
