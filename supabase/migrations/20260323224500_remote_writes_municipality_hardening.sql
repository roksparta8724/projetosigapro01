create extension if not exists "pgcrypto";

create or replace function public.current_account_status()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.account_status
  from public.profiles p
  where p.user_id = auth.uid()
    and p.deleted_at is null
  order by p.updated_at desc nulls last, p.id
  limit 1
$$;

create or replace function public.ensure_active_authenticated_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _status text;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select public.current_account_status() into _status;

  if _status is not null and _status <> 'active' then
    raise exception 'Conta indisponivel para operacoes de escrita';
  end if;
end;
$$;

create or replace function public.resolve_municipality_write_scope(_scope_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _current_municipality_id uuid;
  _resolved uuid;
begin
  _current_municipality_id := public.current_municipality_id();

  if public.is_admin_master() then
    if _scope_id is not null and exists (select 1 from public.municipalities m where m.id = _scope_id) then
      return _scope_id;
    end if;

    return _current_municipality_id;
  end if;

  if _current_municipality_id is not null then
    if _scope_id is null then
      return _current_municipality_id;
    end if;

    if _scope_id = _current_municipality_id then
      return _current_municipality_id;
    end if;

    raise exception 'Escopo municipal invalido para o usuario autenticado';
  end if;

  if _scope_id is not null and exists (select 1 from public.municipalities m where m.id = _scope_id) then
    _resolved := _scope_id;
  end if;

  if _resolved is null then
    raise exception 'Prefeitura nao encontrada para a operacao';
  end if;

  return _resolved;
end;
$$;

create or replace function public.validate_document_storage_path(_municipality_id uuid, _file_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    _file_path is null
    or _file_path = ''
    or split_part(_file_path, '/', 1) = _municipality_id::text
$$;

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
  _municipality_id uuid;
  _existing_profile public.profiles%rowtype;
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

  _municipality_id := public.resolve_municipality_write_scope(_tenant_id);

  select *
    into _existing_profile
    from public.profiles
   where user_id = _user_id
     and deleted_at is null
   order by updated_at desc nulls last, id
   limit 1;

  if _existing_profile.id is not null then
    if coalesce(_existing_profile.account_status, 'active') <> 'active' then
      raise exception 'Conta indisponivel para novos vinculos';
    end if;

    if _existing_profile.municipality_id is not null
       and _existing_profile.municipality_id <> _municipality_id
       and not public.is_admin_master() then
      raise exception 'Usuario ja vinculado a outra prefeitura';
    end if;
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
    municipality_id,
    full_name,
    email,
    cpf_cnpj,
    document_masked,
    phone,
    professional_type,
    registration_number,
    company_name,
    bio,
    account_status
  )
  values (
    _user_id,
    _municipality_id,
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
    _bio,
    coalesce(_existing_profile.account_status, 'active')
  )
  on conflict (user_id) do update
    set municipality_id = coalesce(public.profiles.municipality_id, excluded.municipality_id),
        full_name = excluded.full_name,
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
    municipality_id,
    actor_user_id,
    entity_type,
    entity_id,
    action,
    details
  )
  values (
    _tenant_id,
    _municipality_id,
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
    'municipality_id', _municipality_id,
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
  _municipality_id uuid;
begin
  perform public.ensure_active_authenticated_profile();

  _municipality_id := public.resolve_municipality_write_scope(_tenant_id);

  if not public.is_admin_master()
     and not (
       public.is_tenant_member(_tenant_id, _user_id)
       or exists (
         select 1
         from public.profiles p
         where p.user_id = _user_id
           and p.deleted_at is null
           and p.municipality_id = _municipality_id
           and coalesce(p.account_status, 'active') = 'active'
       )
     ) then
    raise exception 'Usuario sem vinculo com a prefeitura';
  end if;

  insert into public.properties (
    tenant_id,
    municipality_id,
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
    _municipality_id,
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
    municipality_id,
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
    _municipality_id,
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
    municipality_id,
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
      _municipality_id,
      _user_id,
      'profissional_externo',
      coalesce(nullif(_technical_lead, ''), 'Profissional externo'),
      null,
      true
    ),
    (
      _process_id,
      _tenant_id,
      _municipality_id,
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
    municipality_id,
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
    _municipality_id,
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
    municipality_id,
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
      _municipality_id,
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
      _municipality_id,
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
    municipality_id,
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
      _municipality_id,
      _process_id,
      _user_id,
      'sistema',
      'Processo protocolado',
      'Cadastro inicial concluido com numeracao oficial.',
      true
    ),
    (
      _tenant_id,
      _municipality_id,
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
      if not public.validate_document_storage_path(_municipality_id, _doc ->> 'filePath') then
        raise exception 'Documento enviado com path fora do escopo da prefeitura';
      end if;

      insert into public.process_documents (
        tenant_id,
        municipality_id,
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
        _municipality_id,
        _process_id,
        _user_id,
        coalesce(_doc ->> 'label', _doc ->> 'fileName', 'Documento'),
        coalesce(_doc ->> 'filePath', _municipality_id::text || '/pending/' || coalesce(_doc ->> 'fileName', gen_random_uuid()::text)),
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
    'amount', 35.24,
    'municipality_id', _municipality_id
  );
end;
$$;

drop policy if exists "process documents upload authenticated" on storage.objects;
drop policy if exists "process documents update authenticated" on storage.objects;
drop policy if exists "profile assets upload authenticated" on storage.objects;
drop policy if exists "profile assets update authenticated" on storage.objects;
drop policy if exists "institutional branding upload authenticated" on storage.objects;
drop policy if exists "institutional branding update authenticated" on storage.objects;
drop policy if exists "institutional branding delete authenticated" on storage.objects;
drop policy if exists "process documents delete municipality scoped" on storage.objects;
drop policy if exists "process documents upload municipality scoped" on storage.objects;
drop policy if exists "process documents update municipality scoped" on storage.objects;
drop policy if exists "profile assets delete municipality scoped" on storage.objects;
drop policy if exists "profile assets upload municipality scoped" on storage.objects;
drop policy if exists "profile assets update municipality scoped" on storage.objects;
drop policy if exists "institutional branding upload municipality scoped" on storage.objects;
drop policy if exists "institutional branding update municipality scoped" on storage.objects;
drop policy if exists "institutional branding delete municipality scoped" on storage.objects;

create policy "process documents upload municipality scoped"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'process-documents'
  and (
    public.is_admin_master()
    or (
      public.current_municipality_id() is not null
      and split_part(name, '/', 1) = public.current_municipality_id()::text
      and (
        public.is_internal_municipality_role()
        or split_part(name, '/', 3) = auth.uid()::text
      )
    )
  )
);

create policy "process documents update municipality scoped"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'process-documents'
  and (
    public.is_admin_master()
    or (
      public.current_municipality_id() is not null
      and split_part(name, '/', 1) = public.current_municipality_id()::text
      and (
        public.is_internal_municipality_role()
        or split_part(name, '/', 3) = auth.uid()::text
      )
    )
  )
)
with check (
  bucket_id = 'process-documents'
  and (
    public.is_admin_master()
    or (
      public.current_municipality_id() is not null
      and split_part(name, '/', 1) = public.current_municipality_id()::text
      and (
        public.is_internal_municipality_role()
        or split_part(name, '/', 3) = auth.uid()::text
      )
    )
  )
);

create policy "process documents delete municipality scoped"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'process-documents'
  and (
    public.is_admin_master()
    or (
      public.current_municipality_id() is not null
      and split_part(name, '/', 1) = public.current_municipality_id()::text
      and (
        public.is_internal_municipality_role()
        or split_part(name, '/', 3) = auth.uid()::text
      )
    )
  )
);

create policy "profile assets upload municipality scoped"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-assets'
  and split_part(name, '/', 3) = auth.uid()::text
  and (
    public.is_admin_master()
    or public.current_municipality_id() is null
    or split_part(name, '/', 1) = public.current_municipality_id()::text
  )
);

create policy "profile assets update municipality scoped"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-assets'
  and split_part(name, '/', 3) = auth.uid()::text
  and (
    public.is_admin_master()
    or public.current_municipality_id() is null
    or split_part(name, '/', 1) = public.current_municipality_id()::text
  )
)
with check (
  bucket_id = 'profile-assets'
  and split_part(name, '/', 3) = auth.uid()::text
  and (
    public.is_admin_master()
    or public.current_municipality_id() is null
    or split_part(name, '/', 1) = public.current_municipality_id()::text
  )
);

create policy "profile assets delete municipality scoped"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-assets'
  and split_part(name, '/', 3) = auth.uid()::text
  and (
    public.is_admin_master()
    or public.current_municipality_id() is null
    or split_part(name, '/', 1) = public.current_municipality_id()::text
  )
);

create policy "institutional branding upload municipality scoped"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'institutional-branding'
  and (
    public.is_admin_master()
    or (
      public.is_municipality_admin()
      and public.current_municipality_id() is not null
      and split_part(name, '/', 1) = public.current_municipality_id()::text
    )
  )
);

create policy "institutional branding update municipality scoped"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'institutional-branding'
  and (
    public.is_admin_master()
    or (
      public.is_municipality_admin()
      and public.current_municipality_id() is not null
      and split_part(name, '/', 1) = public.current_municipality_id()::text
    )
  )
)
with check (
  bucket_id = 'institutional-branding'
  and (
    public.is_admin_master()
    or (
      public.is_municipality_admin()
      and public.current_municipality_id() is not null
      and split_part(name, '/', 1) = public.current_municipality_id()::text
    )
  )
);

create policy "institutional branding delete municipality scoped"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'institutional-branding'
  and (
    public.is_admin_master()
    or (
      public.is_municipality_admin()
      and public.current_municipality_id() is not null
      and split_part(name, '/', 1) = public.current_municipality_id()::text
    )
  )
);
