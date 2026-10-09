-- SIGAPRO: criação oficial e reconciliação idempotente de protocolos externos.
-- Mantém prefixo municipal, preserva protocolos locais antigos e garante guia financeira no Neon.

create or replace function public.create_external_process_v2(
  _tenant_id uuid,
  _payload jsonb,
  _protocol_prefix text default 'PM',
  _requested_protocol_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _property_id uuid;
  _process_id uuid;
  _protocol text;
  _guide_number text;
  _guide_id uuid;
  _due_date date := current_date + 2;
  _amount numeric := coalesce(nullif(_payload->>'amount','')::numeric, 35.24);
  _doc jsonb;
  _existing_tenant uuid;
  _prefix text := upper(regexp_replace(coalesce(nullif(_protocol_prefix,''),'PM'), '[^A-Za-z0-9]', '', 'g'));
  _guide_prefix text := upper(regexp_replace(coalesce(nullif(_payload->>'guidePrefix',''),'DAM'), '[^A-Za-z0-9]', '', 'g'));
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if not public.has_tenant_access(_tenant_id) then
    raise exception 'Usuario sem vinculo com a prefeitura';
  end if;

  if _requested_protocol_number is not null and btrim(_requested_protocol_number) <> '' then
    select p.id, p.tenant_id, p.property_id, p.protocol_number
      into _process_id, _existing_tenant, _property_id, _protocol
    from public.processes p
    where p.protocol_number = btrim(_requested_protocol_number)
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
        _guide_number := coalesce(
          nullif(_payload->>'guideNumber',''),
          _guide_prefix || '-' || regexp_replace(_protocol, '^[^-]+-', '')
        );

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
    lot, block, usage_type, area_m2
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
    nullif(_payload->>'area','')::numeric
  )
  returning id into _property_id;

  if _requested_protocol_number is not null and btrim(_requested_protocol_number) <> '' then
    _protocol := btrim(_requested_protocol_number);
  else
    _protocol := _prefix || '-' || to_char(current_date,'YYYY') || '-' ||
                 lpad(nextval('public.process_protocol_seq')::text, 5, '0');
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
    'pagamento_pendente',
    'Setor de protocolo','Protocolo',
    coalesce(nullif(_payload->>'type',''),'licenciamento'),
    'recebido',
    'Setor de protocolo',
    'Aguardando conferencia inicial e validacao da guia.',
    'Triagem inicial',
    now() + interval '2 days',
    48,
    false
  )
  returning id into _process_id;

  insert into public.process_parties(
    process_id, tenant_id, user_id, profile_id, party_type,
    display_name, document_masked, is_primary
  )
  values
    (
      _process_id, _tenant_id, _legacy_user_id, _profile_id, 'profissional_externo',
      coalesce(nullif(_payload->>'technicalLead',''),'Profissional externo'), null, true
    ),
    (
      _process_id, _tenant_id, null, null, 'proprietario',
      coalesce(nullif(_payload->>'ownerName',''),'Proprietario nao informado'),
      case
        when length(regexp_replace(coalesce(_payload->>'ownerDocument',''), '\D','','g')) < 4 then null
        else '***' || right(regexp_replace(_payload->>'ownerDocument','\D','','g'),4)
      end,
      false
    );

  _guide_number := coalesce(
    nullif(_payload->>'guideNumber',''),
    _guide_prefix || '-' || regexp_replace(_protocol, '^[^-]+-', '')
  );

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
      'protocolo', null, 'pagamento_pendente',
      'Protocolo criado pelo portal externo.', true
    ),
    (
      _tenant_id, _process_id, _legacy_user_id, _profile_id,
      'guia_emitida', 'pagamento_pendente', 'pagamento_pendente',
      'Guia DAM emitida automaticamente para o processo.', true
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
        encode(digest(coalesce(_doc->>'fileName',gen_random_uuid()::text),'sha256'),'hex'),
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
$function$;

revoke all on function public.create_external_process_v2(uuid,jsonb,text,text) from public;
grant execute on function public.create_external_process_v2(uuid,jsonb,text,text) to authenticated;
