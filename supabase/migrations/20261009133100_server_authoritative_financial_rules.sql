-- SIGAPRO: valores e prefixos financeiros passam a ser autoridade exclusiva do banco.
create or replace function public.normalize_fee_label(_value text)
returns text
language sql
immutable
as $function$
  select trim(
    regexp_replace(
      translate(
        lower(coalesce(_value,'')),
        'áàâãäéèêëíìîïóòôõöúùûüç',
        'aaaaaeeeeiiiiooooouuuuc'
      ),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  )
$function$;

revoke all on function public.normalize_fee_label(text) from public;
revoke all on function public.normalize_fee_label(text) from authenticated;

create or replace function public.resolve_municipal_guide_amount(
  _municipality_id uuid,
  _guide_kind text,
  _area numeric default null,
  _usage text default null,
  _construction_standard text default null
)
returns numeric
language plpgsql
stable
security definer
set search_path = pg_catalog, public
set row_security = off
as $function$
declare
  _settings jsonb := '{}'::jsonb;
  _profiles jsonb;
  _profile jsonb;
  _rate numeric;
  _fallback numeric;
  _normalized_usage text := public.normalize_fee_label(_usage);
  _normalized_standard text := public.normalize_fee_label(coalesce(_construction_standard,'medio'));
  _default_iss_profiles jsonb := '[
    {"id":"residencial","label":"Residencial","aliases":["residencial","apartamento","casa","habitacional"],"rate":1.2},
    {"id":"comercial-mista","label":"Comercial e mista","aliases":["comercial","comercial e mista","mista","escritorio","escritório"],"rate":1.43},
    {"id":"industrial","label":"Industrial","aliases":["industrial","galpao","galpão","fabrica","fábrica"],"rate":1.71},
    {"id":"loteamentos","label":"Loteamentos","aliases":["loteamento","loteamentos","desdobro","desmembramento","remembramento"],"rate":0.4}
  ]'::jsonb;
  _default_approval_profiles jsonb := '[
    {"usage":"Residencial","standard":"luxo","rate":547.2},
    {"usage":"Residencial","standard":"primeira","rate":444.6},
    {"usage":"Residencial","standard":"medio","rate":342},
    {"usage":"Residencial","standard":"economico","rate":239.4},
    {"usage":"Apartamento","standard":"luxo","rate":444.6},
    {"usage":"Apartamento","standard":"primeira","rate":376.2},
    {"usage":"Apartamento","standard":"medio","rate":307.8},
    {"usage":"Escritório","standard":"luxo","rate":410.4},
    {"usage":"Escritório","standard":"primeira","rate":342},
    {"usage":"Escritório","standard":"medio","rate":307.8},
    {"usage":"Comercial","standard":"luxo","rate":342},
    {"usage":"Comercial","standard":"primeira","rate":307.8},
    {"usage":"Comercial","standard":"medio","rate":307.8},
    {"usage":"Comercial","standard":"economico","rate":273.6},
    {"usage":"Industrial","standard":"luxo","rate":342},
    {"usage":"Industrial","standard":"primeira","rate":307.8},
    {"usage":"Industrial","standard":"medio","rate":273.6},
    {"usage":"Industrial","standard":"economico","rate":239.4}
  ]'::jsonb;
begin
  if _municipality_id is null then
    raise exception 'Prefeitura invalida para calcular guia';
  end if;

  select coalesce(ms.general_settings,'{}'::jsonb)
    into _settings
  from public.municipality_settings ms
  where ms.municipality_id=_municipality_id
  limit 1;

  _settings := coalesce(_settings,'{}'::jsonb);

  if _guide_kind='protocolo' then
    return round(
      coalesce(
        nullif(_settings->>'taxa_protocolo','')::numeric,
        nullif(_settings->>'fee_protocol','')::numeric,
        35.24
      ),
      2
    );
  end if;

  if _guide_kind='iss_obra' then
    _profiles := case
      when jsonb_typeof(_settings->'iss_rate_profiles')='array'
        and jsonb_array_length(_settings->'iss_rate_profiles')>0
      then _settings->'iss_rate_profiles'
      else _default_iss_profiles
    end;

    select (p.value->>'rate')::numeric
      into _rate
    from jsonb_array_elements(_profiles) with ordinality p(value,ord)
    where public.normalize_fee_label(p.value->>'label')=_normalized_usage
       or exists(
         select 1
         from jsonb_array_elements_text(coalesce(p.value->'aliases','[]'::jsonb)) a(alias)
         where public.normalize_fee_label(a.alias)=_normalized_usage
            or (
              public.normalize_fee_label(a.alias)<>''
              and _normalized_usage like '%'||public.normalize_fee_label(a.alias)||'%'
            )
       )
    order by p.ord
    limit 1;

    if _rate is null then
      select (p.value->>'rate')::numeric
        into _rate
      from jsonb_array_elements(_profiles) with ordinality p(value,ord)
      order by p.ord
      limit 1;
    end if;

    _fallback := coalesce(
      nullif(_settings->>'taxa_iss_por_metro_quadrado','')::numeric,
      nullif(_settings->>'fee_iss_m2','')::numeric,
      0
    );

    return round(coalesce(_area,0) * coalesce(_rate,_fallback,0),2);
  end if;

  if _guide_kind='aprovacao_final' then
    _profiles := case
      when jsonb_typeof(_settings->'approval_rate_profiles')='array'
        and jsonb_array_length(_settings->'approval_rate_profiles')>0
      then _settings->'approval_rate_profiles'
      else _default_approval_profiles
    end;

    select (p.value->>'rate')::numeric
      into _rate
    from jsonb_array_elements(_profiles) with ordinality p(value,ord)
    where public.normalize_fee_label(p.value->>'usage')=_normalized_usage
      and public.normalize_fee_label(p.value->>'standard')=_normalized_standard
    order by p.ord
    limit 1;

    if _rate is null then
      select (p.value->>'rate')::numeric
        into _rate
      from jsonb_array_elements(_profiles) with ordinality p(value,ord)
      where public.normalize_fee_label(p.value->>'usage')=_normalized_usage
      order by p.ord
      limit 1;
    end if;

    if _rate is not null then
      return round(coalesce(_area,0) * _rate,2);
    end if;

    return round(
      coalesce(
        nullif(_settings->>'taxa_aprovacao_final','')::numeric,
        nullif(_settings->>'fee_final_approval','')::numeric,
        0
      ),
      2
    );
  end if;

  raise exception 'Tipo de guia invalido para calculo oficial';
end;
$function$;

revoke all on function public.resolve_municipal_guide_amount(uuid,text,numeric,text,text) from public;
revoke all on function public.resolve_municipal_guide_amount(uuid,text,numeric,text,text) from authenticated;


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
  _amount numeric;
  _doc jsonb;
  _existing_tenant uuid;
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
    lot, block, usage_type, construction_standard, area_m2
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

create or replace function public.issue_process_payment_guide(
  _process_id uuid,
  _guide_kind text,
  _amount numeric,
  _guide_prefix text default 'DAM',
  _due_date date default null
)
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
  _property_id uuid;
  _protocol_number text;
  _guide public.payment_guides%rowtype;
  _due date := coalesce(_due_date, current_date + 2);
  _prefix text := 'DAM';
  _kind_code text;
  _guide_number text;
  _financial_settings jsonb := '{}'::jsonb;
  _official_amount numeric;
  _property_area numeric;
  _property_usage text;
  _property_standard text;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if _guide_kind not in ('iss_obra','aprovacao_final') then
    raise exception 'Tipo de guia invalido para emissao por etapa';
  end if;

  if _amount is null or _amount < 0 then
    raise exception 'Valor da guia invalido';
  end if;

  select p.tenant_id,p.municipality_id,p.property_id,p.protocol_number
    into _tenant_id,_municipality_id,_property_id,_protocol_number
  from public.processes p
  where p.id=_process_id;

  if _tenant_id is null then
    raise exception 'Processo nao encontrado';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  if not (public.is_master() or public.is_internal_municipality_role()) then
    raise exception 'Sem permissao para emitir guia';
  end if;

  select
    coalesce(ms.general_settings, '{}'::jsonb),
    upper(regexp_replace(coalesce(nullif(ms.guide_prefix,''),'DAM'),'[^A-Za-z0-9]','','g'))
    into _financial_settings,_prefix
  from public.municipality_settings ms
  where ms.municipality_id = coalesce(_municipality_id,_tenant_id)
  limit 1;

  _prefix := coalesce(nullif(_prefix,''),'DAM');

  select pr.area_m2,pr.usage_type,pr.construction_standard
    into _property_area,_property_usage,_property_standard
  from public.properties pr
  where pr.id=_property_id;

  _official_amount := public.resolve_municipal_guide_amount(
    coalesce(_municipality_id,_tenant_id),
    _guide_kind,
    _property_area,
    _property_usage,
    _property_standard
  );

  if _guide_kind='iss_obra'
     and coalesce((_financial_settings->>'iss_stage_enabled')::boolean,true)=false then
    raise exception 'A etapa de ISSQN esta desativada para esta Prefeitura';
  end if;

  if _guide_kind='aprovacao_final'
     and coalesce((_financial_settings->>'final_approval_fee_enabled')::boolean,true)=false then
    raise exception 'A taxa final de aprovacao esta desativada para esta Prefeitura';
  end if;

  select pg.*
    into _guide
  from public.payment_guides pg
  where pg.process_id=_process_id
    and pg.guide_kind=_guide_kind
  limit 1;

  if _guide.id is not null then
    return jsonb_build_object(
      'process_id',_process_id,
      'guide',to_jsonb(_guide),
      'existing',true
    );
  end if;

  _kind_code := case _guide_kind when 'iss_obra' then 'ISS' else 'APR' end;
  _guide_number := _prefix || '-' || _kind_code || '-' ||
                   regexp_replace(_protocol_number, '^[^-]+-', '');

  insert into public.payment_guides(
    tenant_id,municipality_id,process_id,property_id,
    guide_number,amount,due_date,status,paid,paid_at,guide_kind
  )
  values(
    _tenant_id,coalesce(_municipality_id,_tenant_id),_process_id,_property_id,
    _guide_number,_official_amount,_due,'pendente',false,null,_guide_kind
  )
  returning * into _guide;

  update public.processes
     set status='pagamento_pendente',
         current_department=case
           when _guide_kind='iss_obra' then 'Setor de IPTU / Fiscal'
           else 'Financeiro'
         end,
         current_queue=case
           when _guide_kind='iss_obra' then 'Setor de IPTU / Fiscal'
           else 'Financeiro'
         end,
         sla_stage=case
           when _guide_kind='iss_obra' then 'ISSQN aguardando pagamento'
           else 'Taxa final aguardando pagamento'
         end,
         updated_at=now()
   where id=_process_id;

  insert into public.process_movements(
    tenant_id,process_id,actor_user_id,actor_profile_id,movement_type,
    from_status,to_status,description,visible_to_external,municipality_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,_profile_id,'guia_emitida',
    null,'pagamento_pendente',
    case
      when _guide_kind='iss_obra' then 'Guia de ISSQN da obra emitida.'
      else 'Guia final de aprovacao emitida.'
    end,
    true,coalesce(_municipality_id,_tenant_id)
  );

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,actor_profile_id,category,
    title,detail,visible_to_external,municipality_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,_profile_id,'financeiro',
    case
      when _guide_kind='iss_obra' then 'Guia ISSQN emitida'
      else 'Guia final de aprovacao emitida'
    end,
    'Guia '||_guide_number||' emitida no valor de R$ '||to_char(_official_amount,'FM999999990D00')||'.',
    true,coalesce(_municipality_id,_tenant_id)
  );

  return jsonb_build_object(
    'process_id',_process_id,
    'guide',to_jsonb(_guide),
    'existing',false
  );
end;
$function$;

revoke all on function public.issue_process_payment_guide(uuid,text,numeric,text,date) from public;
grant execute on function public.issue_process_payment_guide(uuid,text,numeric,text,date) to authenticated;
