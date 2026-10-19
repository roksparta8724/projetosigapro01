-- SIGAPRO: cadastro cadastral completo e tipologia da edificação.
alter table public.properties
  add column if not exists building_type text;

alter table public.process_party_private_data
  add column if not exists identity_document_number text,
  add column if not exists identity_document_type text;

create or replace function public.list_visible_process_party_private_data_v1()
returns table(
  id uuid,
  process_id uuid,
  party_id uuid,
  tenant_id uuid,
  municipality_id uuid,
  document_number text,
  identity_document_number text,
  identity_document_type text,
  registration_number text,
  professional_type text,
  email text,
  phone text,
  company_name text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
  select
    d.id,d.process_id,d.party_id,d.tenant_id,d.municipality_id,
    d.document_number,d.identity_document_number,d.identity_document_type,
    d.registration_number,d.professional_type,d.email,d.phone,d.company_name,
    d.created_at,d.updated_at
  from public.process_party_private_data d
  where public.has_process_access(d.process_id)
$function$;

grant execute on function public.list_visible_process_party_private_data_v1() to authenticated;

CREATE OR REPLACE FUNCTION public.create_external_process_v2(_tenant_id uuid, _payload jsonb, _protocol_prefix text DEFAULT 'PM'::text, _requested_protocol_number text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _property_id uuid;
  _process_id uuid;
  _protocol text;
  _guide_number text;
  _guide_id uuid;
  _due_date date := current_date + 2;
  _amount numeric;
  _doc jsonb;
  _existing_tenant uuid;
  _professional_party_id uuid;
  _owner_party_id uuid;
  _prefix text := 'PM';
  _guide_prefix text := 'DAM';
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if not public.has_tenant_access(_tenant_id) then
    raise exception 'Usuario sem vinculo com a prefeitura';
  end if;

  select
    upper(regexp_replace(coalesce(nullif(ms.protocol_prefix,''),'PM'),'[^A-Za-z0-9]','','g')),
    upper(regexp_replace(coalesce(nullif(ms.guide_prefix,''),'DAM'),'[^A-Za-z0-9]','','g'))
    into _prefix,_guide_prefix
  from public.municipality_settings ms
  where ms.municipality_id=_tenant_id
  limit 1;

  _prefix := coalesce(nullif(_prefix,''),'PM');
  _guide_prefix := coalesce(nullif(_guide_prefix,''),'DAM');
  _amount := public.resolve_municipal_guide_amount(
    _tenant_id,'protocolo',null,null,null
  );

  if _requested_protocol_number is not null and btrim(_requested_protocol_number) <> '' then
    select p.id, p.tenant_id, p.property_id, p.protocol_number
      into _process_id, _existing_tenant, _property_id, _protocol
    from public.processes p
    where p.tenant_id = _tenant_id
      and p.protocol_number = btrim(_requested_protocol_number)
    limit 1;

    if _process_id is not null then
      if _existing_tenant <> _tenant_id then
        raise exception 'Numero de protocolo ja pertence a outra prefeitura';
      end if;

      select g.id, g.guide_number, g.amount, g.due_date
        into _guide_id, _guide_number, _amount, _due_date
      from public.payment_guides g
      where g.process_id = _process_id
      order by case when g.guide_kind = 'protocolo' then 0 else 1 end, g.created_at
      limit 1;

      if _guide_id is null then
        _guide_number := _guide_prefix || '-' || regexp_replace(_protocol, '^[^-]+-', '');

        insert into public.payment_guides(
          tenant_id, municipality_id, process_id, property_id,
          guide_number, municipal_registration, amount, due_date,
          status, paid, guide_kind
        )
        values(
          _tenant_id, _tenant_id, _process_id, _property_id,
          _guide_number, nullif(_payload->>'iptu',''), _amount, _due_date,
          'pendente', false, 'protocolo'
        )
        returning id into _guide_id;
      end if;

      return jsonb_build_object(
        'process_id', _process_id,
        'protocol_number', _protocol,
        'guide_number', _guide_number,
        'due_date', _due_date,
        'amount', _amount,
        'reconciled', true,
        'existing', true
      );
    end if;
  end if;

  insert into public.properties(
    tenant_id, municipality_id, iptu_code, registry_code, address,
    lot, block, usage_type, building_type, work_type, construction_standard, area_m2
  )
  values(
    _tenant_id,
    _tenant_id,
    coalesce(nullif(_payload->>'iptu',''), 'NAO-INFORMADO'),
    nullif(_payload->>'registration',''),
    coalesce(nullif(_payload->>'address',''), 'Endereco nao informado'),
    nullif(_payload->>'lot',''),
    nullif(_payload->>'block',''),
    nullif(_payload->>'usage',''),
    nullif(_payload->>'buildingType',''),
    nullif(_payload->>'workType',''),
    nullif(_payload->>'constructionStandard',''),
    nullif(_payload->>'area','')::numeric
  )
  returning id into _property_id;

  if _requested_protocol_number is not null and btrim(_requested_protocol_number) <> '' then
    _protocol := btrim(_requested_protocol_number);
  else
    _protocol := public.next_tenant_protocol_number(
      _tenant_id,
      _prefix,
      extract(year from current_date)::integer
    );
  end if;

  insert into public.processes(
    tenant_id, municipality_id, property_id, created_by, created_by_profile_id,
    protocol_number, external_protocol_number, title, process_type, status,
    current_queue, current_department, checklist_type, triage_status,
    triage_assigned_to, triage_notes, sla_stage, sla_due_at,
    sla_hours_remaining, sla_breached
  )
  values(
    _tenant_id, _tenant_id, _property_id, _legacy_user_id, _profile_id,
    _protocol, _protocol,
    coalesce(nullif(_payload->>'title',''),'Projeto sem titulo'),
    coalesce(nullif(_payload->>'type',''),'licenciamento'),
    'triagem',
    'Triagem de Protocolo','Setor de Protocolo',
    coalesce(nullif(_payload->>'type',''),'licenciamento'),
    'recebido',
    'Setor de protocolo',
    'Aguardando conferencia inicial e validacao da guia.',
    'Triagem de Protocolo',
    now() + interval '2 days',
    48,
    false
  )
  returning id into _process_id;

  insert into public.process_parties(
    process_id, tenant_id, municipality_id, user_id, profile_id, party_type,
    display_name, document_masked, is_primary
  )
  values (
    _process_id, _tenant_id, _tenant_id, _legacy_user_id, _profile_id, 'profissional_externo',
    coalesce(nullif(_payload->>'technicalLead',''),'Profissional externo'),
    case
      when length(regexp_replace(coalesce(_payload->>'professionalDocument',''), '\D','','g')) < 4 then null
      else '***' || right(regexp_replace(_payload->>'professionalDocument','\D','','g'),4)
    end,
    true
  )
  returning id into _professional_party_id;

  insert into public.process_party_private_data(
    process_id, party_id, tenant_id, municipality_id,
    document_number, registration_number, professional_type,
    email, phone, company_name
  )
  values(
    _process_id, _professional_party_id, _tenant_id, _tenant_id,
    nullif(_payload->>'professionalDocument',''),
    nullif(_payload->>'professionalRegistration',''),
    nullif(_payload->>'professionalType',''),
    nullif(_payload->>'professionalEmail',''),
    nullif(_payload->>'professionalPhone',''),
    nullif(_payload->>'professionalCompany','')
  )
  on conflict (party_id) do update set
    document_number=excluded.document_number,
    registration_number=excluded.registration_number,
    professional_type=excluded.professional_type,
    email=excluded.email,
    phone=excluded.phone,
    company_name=excluded.company_name,
    updated_at=clock_timestamp();

  insert into public.process_parties(
    process_id, tenant_id, municipality_id, user_id, profile_id, party_type,
    display_name, document_masked, is_primary
  )
  values (
    _process_id, _tenant_id, _tenant_id, null, null, 'proprietario',
    coalesce(nullif(_payload->>'ownerName',''),'Proprietario nao informado'),
    case
      when length(regexp_replace(coalesce(_payload->>'ownerDocument',''), '\D','','g')) < 4 then null
      else '***' || right(regexp_replace(_payload->>'ownerDocument','\D','','g'),4)
    end,
    false
  )
  returning id into _owner_party_id;

  insert into public.process_party_private_data(
    process_id, party_id, tenant_id, municipality_id,
    document_number, identity_document_number, identity_document_type,
    email, phone
  )
  values(
    _process_id, _owner_party_id, _tenant_id, _tenant_id,
    nullif(_payload->>'ownerDocument',''),
    nullif(_payload->>'ownerIdentityDocument',''),
    case
      when nullif(_payload->>'ownerIdentityDocument','') is null then null
      else 'RG/RNE/IDENTIDADE'
    end,
    nullif(_payload->>'ownerEmail',''),
    nullif(_payload->>'ownerPhone','')
  )
  on conflict (party_id) do update set
    document_number=excluded.document_number,
    identity_document_number=excluded.identity_document_number,
    identity_document_type=excluded.identity_document_type,
    email=excluded.email,
    phone=excluded.phone,
    updated_at=clock_timestamp();

  _guide_number := _guide_prefix || '-' || regexp_replace(_protocol, '^[^-]+-', '');

  insert into public.payment_guides(
    tenant_id, municipality_id, process_id, property_id,
    guide_number, municipal_registration, amount, due_date,
    status, paid, guide_kind
  )
  values(
    _tenant_id, _tenant_id, _process_id, _property_id,
    _guide_number, nullif(_payload->>'iptu',''),
    _amount, _due_date, 'pendente', false, 'protocolo'
  )
  returning id into _guide_id;

  insert into public.process_movements(
    tenant_id, process_id, actor_user_id, actor_profile_id,
    movement_type, from_status, to_status, description, visible_to_external
  )
  values
    (
      _tenant_id, _process_id, _legacy_user_id, _profile_id,
      'protocolo', null, 'triagem',
      'Protocolo criado pelo portal externo e enviado ao Setor de Protocolo.', true
    ),
    (
      _tenant_id, _process_id, _legacy_user_id, _profile_id,
      'guia_emitida', 'triagem', 'triagem',
      'Guia DAM emitida automaticamente; a baixa ocorre após a triagem do Protocolo.', true
    );

  insert into public.process_audit_entries(
    tenant_id, process_id, actor_user_id, actor_profile_id,
    category, title, detail, visible_to_external
  )
  values
    (
      _tenant_id, _process_id, _legacy_user_id, _profile_id,
      'sistema', 'Processo protocolado',
      'Cadastro inicial concluido com numeracao oficial.', true
    ),
    (
      _tenant_id, _process_id, _legacy_user_id, _profile_id,
      'financeiro', 'Guia inicial emitida',
      'Guia municipal criada automaticamente no protocolo.', true
    );

  if jsonb_typeof(_payload->'documents') = 'array' then
    for _doc in select value from jsonb_array_elements(_payload->'documents')
    loop
      insert into public.process_documents(
        tenant_id, process_id, uploaded_by, uploaded_by_profile_id,
        title, file_path, file_hash, version, source, is_required, is_valid,
        file_name, mime_type, size_label, preview_url, review_status, annotations
      )
      values(
        _tenant_id, _process_id, _legacy_user_id, _profile_id,
        coalesce(_doc->>'label',_doc->>'fileName','Documento'),
        coalesce(_doc->>'filePath','pending/'||coalesce(_doc->>'fileName',gen_random_uuid()::text)),
        encode(extensions.digest(coalesce(_doc->>'fileName',gen_random_uuid()::text),'sha256'),'hex'),
        coalesce(nullif(_doc->>'version','')::integer,1),
        coalesce(nullif(_doc->>'source',''),'profissional'),
        coalesce(nullif(_doc->>'required','')::boolean,true),
        true,
        _doc->>'fileName',
        _doc->>'mimeType',
        _doc->>'sizeLabel',
        case when length(coalesce(_doc->>'previewUrl','')) > 2000000 then null else _doc->>'previewUrl' end,
        coalesce(nullif(_doc->>'reviewStatus',''),'pendente'),
        coalesce(_doc->'annotations','[]'::jsonb)
      );
    end loop;
  end if;

  return jsonb_build_object(
    'process_id', _process_id,
    'protocol_number', _protocol,
    'guide_number', _guide_number,
    'due_date', _due_date,
    'amount', _amount,
    'reconciled', (_requested_protocol_number is not null),
    'existing', false
  );
end;
$function$
;

grant execute on function public.create_external_process_v2(uuid,jsonb,text,text) to authenticated;
notify pgrst, 'reload schema';
