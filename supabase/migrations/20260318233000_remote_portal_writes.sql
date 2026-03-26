alter table public.profiles
  add column if not exists phone text,
  add column if not exists professional_type text,
  add column if not exists registration_number text,
  add column if not exists company_name text,
  add column if not exists avatar_url text,
  add column if not exists bio text;

alter table public.process_documents
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists size_label text,
  add column if not exists preview_url text,
  add column if not exists review_status text not null default 'pendente',
  add column if not exists reviewed_by text,
  add column if not exists annotations jsonb not null default '[]'::jsonb;

drop policy if exists "tenant members read tenant" on public.tenants;
create policy "tenant members read tenant"
on public.tenants
for select
to authenticated
using (public.is_master_user(auth.uid()) or public.is_tenant_member(id));

drop policy if exists "tenant members read branding" on public.tenant_branding;
create policy "tenant members read branding"
on public.tenant_branding
for select
to authenticated
using (public.is_master_user(auth.uid()) or public.is_tenant_member(tenant_id));

drop policy if exists "users read own memberships" on public.tenant_memberships;
create policy "users read own memberships"
on public.tenant_memberships
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_master_user(auth.uid())
  or exists (
    select 1
    from public.tenant_memberships tm
    join public.roles r on r.id = tm.role_id
    where tm.user_id = auth.uid()
      and tm.tenant_id = tenant_memberships.tenant_id
      and tm.deleted_at is null
      and r.code in ('prefeitura_admin', 'prefeitura_supervisor')
  )
);

create or replace function public.register_external_account(
  _tenant_id uuid,
  _full_name text,
  _email text,
  _cpf_cnpj text default null,
  _phone text default null,
  _professional_type text default null,
  _registration_number text default null,
  _company_name text default null,
  _title text default null,
  _bio text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _user_id uuid := auth.uid();
  _tenant public.tenants%rowtype;
  _role_id uuid;
begin
  if _user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select *
    into _tenant
    from public.tenants
   where id = _tenant_id
   limit 1;

  if _tenant.id is null then
    raise exception 'Prefeitura nao encontrada';
  end if;

  if _tenant.status in ('suspenso', 'encerrado') then
    raise exception 'Prefeitura indisponivel para novos cadastros';
  end if;

  select id
    into _role_id
    from public.roles
   where code = 'profissional_externo'
   limit 1;

  if _role_id is null then
    raise exception 'Papel profissional_externo nao encontrado';
  end if;

  insert into public.profiles (
    user_id,
    full_name,
    email,
    cpf_cnpj,
    document_masked,
    phone,
    professional_type,
    registration_number,
    company_name,
    bio
  )
  values (
    _user_id,
    _full_name,
    _email,
    _cpf_cnpj,
    case
      when _cpf_cnpj is null or length(regexp_replace(_cpf_cnpj, '\D', '', 'g')) < 4 then null
      else '***' || right(regexp_replace(_cpf_cnpj, '\D', '', 'g'), 4)
    end,
    _phone,
    _professional_type,
    _registration_number,
    _company_name,
    _bio
  )
  on conflict (user_id) do update
    set full_name = excluded.full_name,
        email = excluded.email,
        cpf_cnpj = excluded.cpf_cnpj,
        document_masked = excluded.document_masked,
        phone = excluded.phone,
        professional_type = excluded.professional_type,
        registration_number = excluded.registration_number,
        company_name = excluded.company_name,
        bio = excluded.bio,
        updated_at = now(),
        deleted_at = null;

  insert into public.tenant_memberships (
    tenant_id,
    user_id,
    role_id,
    department,
    queue_name,
    level_name,
    is_active,
    deleted_at
  )
  values (
    _tenant_id,
    _user_id,
    _role_id,
    coalesce(_title, _professional_type, 'Profissional externo'),
    'Portal externo',
    'Nivel 1',
    true,
    null
  )
  on conflict (tenant_id, user_id, role_id) do update
    set department = excluded.department,
        queue_name = excluded.queue_name,
        level_name = excluded.level_name,
        is_active = true,
        deleted_at = null;

  insert into public.audit_logs (
    tenant_id,
    actor_user_id,
    entity_type,
    entity_id,
    action,
    details
  )
  values (
    _tenant_id,
    _user_id,
    'registration',
    _tenant_id,
    'external_account_registered',
    jsonb_build_object(
      'full_name', _full_name,
      'email', _email,
      'professional_type', _professional_type
    )
  );

  return jsonb_build_object(
    'user_id', _user_id,
    'tenant_id', _tenant_id,
    'role', 'profissional_externo'
  );
end;
$$;

create or replace function public.create_external_process(
  _tenant_id uuid,
  _title text,
  _process_type text,
  _address text,
  _iptu_code text,
  _registry_code text,
  _lot text default null,
  _block text default null,
  _area_m2 numeric default null,
  _usage_type text default null,
  _owner_name text default null,
  _owner_document text default null,
  _technical_lead text default null,
  _notes text default null,
  _documents jsonb default '[]'::jsonb,
  _guide_prefix text default 'DAM'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _user_id uuid := auth.uid();
  _property_id uuid;
  _process_id uuid;
  _protocol text;
  _guide_number text;
  _due_date date := (current_date + interval '2 days')::date;
  _doc jsonb;
begin
  if _user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if not public.is_tenant_member(_tenant_id, _user_id) then
    raise exception 'Usuario sem vinculo com a prefeitura';
  end if;

  insert into public.properties (
    tenant_id,
    iptu_code,
    registry_code,
    address,
    lot,
    block,
    usage_type,
    area_m2
  )
  values (
    _tenant_id,
    _iptu_code,
    nullif(_registry_code, ''),
    _address,
    nullif(_lot, ''),
    nullif(_block, ''),
    nullif(_usage_type, ''),
    _area_m2
  )
  returning id into _property_id;

  insert into public.processes (
    tenant_id,
    property_id,
    created_by,
    protocol_number,
    external_protocol_number,
    title,
    process_type,
    status,
    current_queue,
    current_department,
    checklist_type,
    triage_status,
    triage_assigned_to,
    triage_notes,
    sla_stage,
    sla_due_at,
    sla_hours_remaining,
    sla_breached
  )
  values (
    _tenant_id,
    _property_id,
    _user_id,
    null,
    null,
    _title,
    _process_type,
    'pagamento_pendente',
    'Setor de protocolo',
    'Protocolo',
    _process_type,
    'recebido',
    'Setor de protocolo',
    'Aguardando conferencia inicial e validacao da guia.',
    'Triagem inicial',
    now() + interval '2 days',
    48,
    false
  )
  returning id, protocol_number into _process_id, _protocol;

  _guide_number := coalesce(nullif(_guide_prefix, ''), 'DAM') || '-' || split_part(_protocol, '-', 2) || '-' || split_part(_protocol, '-', 3);

  insert into public.process_parties (
    process_id,
    tenant_id,
    user_id,
    party_type,
    display_name,
    document_masked,
    is_primary
  )
  values
    (
      _process_id,
      _tenant_id,
      _user_id,
      'profissional_externo',
      coalesce(nullif(_technical_lead, ''), 'Profissional externo'),
      null,
      true
    ),
    (
      _process_id,
      _tenant_id,
      null,
      'proprietario',
      coalesce(nullif(_owner_name, ''), 'Proprietario nao informado'),
      case
        when _owner_document is null or length(regexp_replace(_owner_document, '\D', '', 'g')) < 4 then null
        else '***' || right(regexp_replace(_owner_document, '\D', '', 'g'), 4)
      end,
      false
    );

  insert into public.payment_guides (
    tenant_id,
    process_id,
    property_id,
    guide_number,
    municipal_registration,
    amount,
    due_date,
    status
  )
  values (
    _tenant_id,
    _process_id,
    _property_id,
    _guide_number,
    _iptu_code,
    35.24,
    _due_date,
    'pendente'
  );

  insert into public.process_movements (
    tenant_id,
    process_id,
    actor_user_id,
    movement_type,
    from_status,
    to_status,
    description,
    visible_to_external
  )
  values
    (
      _tenant_id,
      _process_id,
      _user_id,
      'protocolo',
      null,
      'pagamento_pendente',
      'Protocolo criado pelo portal externo.',
      true
    ),
    (
      _tenant_id,
      _process_id,
      _user_id,
      'guia_emitida',
      'pagamento_pendente',
      'pagamento_pendente',
      'Guia DAM emitida automaticamente para o processo.',
      true
    );

  insert into public.process_audit_entries (
    tenant_id,
    process_id,
    actor_user_id,
    category,
    title,
    detail,
    visible_to_external
  )
  values
    (
      _tenant_id,
      _process_id,
      _user_id,
      'sistema',
      'Processo protocolado',
      'Cadastro inicial concluido com numeracao oficial.',
      true
    ),
    (
      _tenant_id,
      _process_id,
      _user_id,
      'financeiro',
      'Guia inicial emitida',
      'Guia DAM criada automaticamente no protocolo.',
      true
    );

  if jsonb_typeof(_documents) = 'array' then
    for _doc in
      select value
      from jsonb_array_elements(_documents)
    loop
      insert into public.process_documents (
        tenant_id,
        process_id,
        uploaded_by,
        title,
        file_path,
        file_hash,
        version,
        source,
        is_required,
        is_valid,
        file_name,
        mime_type,
        size_label,
        preview_url,
        review_status,
        annotations
      )
      values (
        _tenant_id,
        _process_id,
        _user_id,
        coalesce(_doc ->> 'label', _doc ->> 'fileName', 'Documento'),
        coalesce(_doc ->> 'filePath', 'pending/' || coalesce(_doc ->> 'fileName', gen_random_uuid()::text)),
        coalesce(_doc ->> 'fileHash', encode(digest(coalesce(_doc ->> 'fileName', gen_random_uuid()::text), 'sha256'), 'hex')),
        coalesce((_doc ->> 'version')::integer, 1),
        coalesce(_doc ->> 'source', 'profissional'),
        coalesce((_doc ->> 'required')::boolean, true),
        true,
        _doc ->> 'fileName',
        _doc ->> 'mimeType',
        _doc ->> 'sizeLabel',
        case
          when length(coalesce(_doc ->> 'previewUrl', '')) > 2000000 then null
          else _doc ->> 'previewUrl'
        end,
        coalesce(_doc ->> 'reviewStatus', 'pendente'),
        coalesce(_doc -> 'annotations', '[]'::jsonb)
      );
    end loop;
  end if;

  return jsonb_build_object(
    'process_id', _process_id,
    'protocol_number', _protocol,
    'guide_number', _guide_number,
    'due_date', _due_date,
    'amount', 35.24
  );
end;
$$;

grant execute on function public.register_external_account(uuid, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.create_external_process(uuid, text, text, text, text, text, text, text, numeric, text, text, text, text, text, jsonb, text) to authenticated;
