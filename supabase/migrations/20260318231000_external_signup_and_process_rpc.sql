create or replace function public.register_external_account(
  _tenant_id uuid,
  _full_name text,
  _email text,
  _cpf_cnpj text,
  _phone text default null,
  _professional_type text default null,
  _registration_number text default null,
  _company_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _role_id uuid;
begin
  select id into _role_id
  from public.roles
  where code = 'profissional_externo';

  if auth.uid() is null then
    raise exception 'Usuario autenticado nao encontrado.';
  end if;

  if _role_id is null then
    raise exception 'Role profissional_externo nao configurada.';
  end if;

  insert into public.profiles (user_id, full_name, email, cpf_cnpj)
  values (auth.uid(), _full_name, _email, _cpf_cnpj)
  on conflict (user_id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email,
    cpf_cnpj = excluded.cpf_cnpj,
    updated_at = now();

  insert into public.tenant_memberships (tenant_id, user_id, role_id, department, queue_name, level_name, is_active)
  values (_tenant_id, auth.uid(), _role_id, coalesce(_company_name, 'Profissional externo'), 'Portal externo', coalesce(_professional_type, 'Profissional externo'), true)
  on conflict (tenant_id, user_id, role_id) do update
  set
    department = excluded.department,
    queue_name = excluded.queue_name,
    level_name = excluded.level_name,
    is_active = true,
    deleted_at = null;

  insert into public.audit_logs (tenant_id, actor_user_id, entity_type, action, details)
  values (
    _tenant_id,
    auth.uid(),
    'external_account',
    'register',
    jsonb_build_object(
      'full_name', _full_name,
      'email', _email,
      'phone', _phone,
      'professional_type', _professional_type,
      'registration_number', _registration_number,
      'company_name', _company_name
    )
  );
end;
$$;

create or replace function public.create_external_process(
  _tenant_id uuid,
  _title text,
  _process_type text,
  _address text,
  _owner_name text,
  _owner_document text,
  _technical_lead text,
  _registration text,
  _iptu text,
  _lot text,
  _block text,
  _area numeric,
  _usage text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _property_id uuid;
  _process_id uuid;
  _protocol text;
begin
  if auth.uid() is null then
    raise exception 'Usuario autenticado nao encontrado.';
  end if;

  if not public.is_tenant_member(_tenant_id, auth.uid()) then
    raise exception 'Usuario sem vinculo com a prefeitura.';
  end if;

  insert into public.properties (tenant_id, iptu_code, registry_code, address, lot, block, usage_type, area_m2)
  values (_tenant_id, _iptu, _registration, _address, _lot, _block, _usage, _area)
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
    auth.uid(),
    '',
    null,
    _title,
    _process_type,
    'pagamento_pendente',
    'Setor de protocolo',
    'Triagem inicial',
    _process_type,
    'recebido',
    'Setor de protocolo',
    'Aguardando conferencia inicial e pagamento.',
    'Triagem inicial',
    now() + interval '2 days',
    48,
    false
  )
  returning id, protocol_number into _process_id, _protocol;

  insert into public.process_parties (process_id, tenant_id, user_id, party_type, display_name, document_masked, is_primary)
  values
    (_process_id, _tenant_id, auth.uid(), 'profissional_externo', _technical_lead, null, false),
    (_process_id, _tenant_id, null, 'proprietario', _owner_name, _owner_document, true);

  insert into public.payment_guides (tenant_id, process_id, property_id, guide_number, municipal_registration, amount, due_date, status)
  values (_tenant_id, _process_id, _property_id, 'DAM-' || to_char(now(), 'YYYY') || '-' || right(replace(_process_id::text, '-', ''), 6), _iptu, 35.24, current_date + 2, 'pendente');

  insert into public.process_movements (tenant_id, process_id, actor_user_id, movement_type, to_status, description, visible_to_external)
  values
    (_tenant_id, _process_id, auth.uid(), 'protocol', 'pagamento_pendente', 'Processo protocolado pelo portal externo.', true),
    (_tenant_id, _process_id, auth.uid(), 'financial', 'pagamento_pendente', 'Guia emitida automaticamente no protocolo.', true);

  insert into public.process_audit_entries (tenant_id, process_id, actor_user_id, category, title, detail, visible_to_external)
  values
    (_tenant_id, _process_id, auth.uid(), 'sistema', 'Processo protocolado', 'Cadastro inicial concluido com numeracao oficial.', true),
    (_tenant_id, _process_id, auth.uid(), 'financeiro', 'Guia emitida', 'Guia DAM gerada automaticamente no protocolo.', true);

  return _process_id;
end;
$$;
