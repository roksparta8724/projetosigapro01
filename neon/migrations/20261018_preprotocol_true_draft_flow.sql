-- SIGAPRO: pré-protocolo realmente separado do processo municipal.
-- A sequência oficial só é consumida após a compensação da guia inicial.
-- O pré-protocolo permanece editável enquanto não houver pagamento.

alter table public.processes
  add column if not exists preprotocol_payload jsonb;

create or replace function public.next_tenant_preprotocol_number(
  _tenant_id uuid,
  _prefix text,
  _year integer default extract(year from current_date)::integer
)
returns text
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _normalized_prefix text :=
    upper(regexp_replace(coalesce(nullif(btrim(_prefix),''),'PM'),'[^A-Za-z0-9]','','g'));
  _token text;
begin
  if _tenant_id is null then
    raise exception 'Prefeitura invalida para gerar pre-protocolo';
  end if;

  if _year < 2000 or _year > 9999 then
    raise exception 'Ano invalido para gerar pre-protocolo';
  end if;

  loop
    _token :=
      'PRE-' || _normalized_prefix || '-' ||
      to_char(clock_timestamp(),'YYYYMMDD') || '-' ||
      upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));

    exit when not exists (
      select 1
      from public.processes p
      where p.tenant_id=_tenant_id
        and (p.pre_protocol_number=_token or p.protocol_number=_token)
    );
  end loop;

  return _token;
end;
$function$;

create or replace function public.officialize_preprotocol_v1(
  _process_id uuid,
  _payment_guide_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _process public.processes%rowtype;
  _guide public.payment_guides%rowtype;
  _official_protocol text;
  _municipality uuid;
  _prefix text := 'PM';
begin
  select * into _process
  from public.processes
  where id=_process_id
  for update;

  if _process.id is null then
    raise exception 'Pre-protocolo nao encontrado';
  end if;

  if _process.officialized_at is not null then
    return jsonb_build_object(
      'process_id',_process.id,
      'protocol_number',_process.protocol_number,
      'pre_protocol_number',_process.pre_protocol_number,
      'officialized_at',_process.officialized_at,
      'existing',true
    );
  end if;

  select g.* into _guide
  from public.payment_guides g
  where g.process_id=_process_id
    and g.guide_kind='protocolo'
    and (_payment_guide_id is null or g.id=_payment_guide_id)
  order by g.created_at desc
  limit 1
  for update;

  if _guide.id is null then
    raise exception 'Guia inicial nao encontrada para o pre-protocolo';
  end if;

  if not (
    coalesce(_guide.paid,false)=true
    or lower(coalesce(_guide.status,'')) in ('compensada','confirmed','paid','pago','confirmado')
  ) then
    raise exception 'O processo municipal so pode ser criado depois da confirmacao do pagamento';
  end if;

  _municipality := coalesce(_process.municipality_id,_process.tenant_id);
  perform public.assert_municipality_entitlement_v1(_municipality,'processes',1);

  select
    upper(regexp_replace(coalesce(nullif(ms.protocol_prefix,''),'PM'),'[^A-Za-z0-9]','','g'))
    into _prefix
  from public.municipality_settings ms
  where ms.municipality_id=_municipality
  limit 1;

  _prefix := coalesce(nullif(_prefix,''),'PM');

  -- A numeração oficial nasce somente agora, depois do pagamento.
  _official_protocol := public.next_tenant_protocol_number(
    _municipality,
    _prefix,
    extract(year from current_date)::integer
  );

  if exists (
    select 1
    from public.processes p
    where p.tenant_id=_process.tenant_id
      and p.protocol_number=_official_protocol
      and p.id<>_process.id
  ) then
    raise exception 'O numero oficial % ja esta em uso. Revise a sequencia antes de oficializar.',_official_protocol;
  end if;

  update public.processes
  set protocol_number=_official_protocol,
      external_protocol_number=_official_protocol,
      officialized_at=clock_timestamp(),
      officialized_by_payment_guide_id=_guide.id,
      status='triagem',
      current_department='Setor de Protocolo',
      current_queue='Triagem de Protocolo',
      triage_status='recebido',
      triage_assigned_to=null,
      triage_notes='Pagamento confirmado. Processo aberto para conferencia documental do Setor de Protocolo.',
      sla_stage='Triagem documental apos pagamento',
      sla_due_at=clock_timestamp()+interval '2 days',
      sla_hours_remaining=48,
      sla_breached=false,
      updated_at=clock_timestamp()
  where id=_process.id
  returning * into _process;

  insert into public.process_movements(
    tenant_id,process_id,actor_user_id,actor_profile_id,movement_type,
    from_status,to_status,description,visible_to_external,municipality_id
  )
  values(
    _process.tenant_id,_process.id,public.current_legacy_user_id(),public.current_profile_id(),
    'processo_oficializado','pagamento_pendente','triagem',
    'Pagamento confirmado. O processo municipal '||_official_protocol||
      ' foi criado neste momento, sem reservar numeracao antes da compensacao.',
    true,_municipality
  );

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,actor_profile_id,category,title,detail,
    visible_to_external,created_at,municipality_id
  )
  values(
    _process.tenant_id,_process.id,public.current_legacy_user_id(),public.current_profile_id(),
    'protocolo','Processo municipal criado apos pagamento',
    'O pre-protocolo '||coalesce(_process.pre_protocol_number,'nao informado')||
      ' recebeu o numero oficial '||_official_protocol||
      ' somente depois da compensacao da guia inicial.',
    true,clock_timestamp(),_municipality
  );

  return jsonb_build_object(
    'process_id',_process.id,
    'protocol_number',_official_protocol,
    'pre_protocol_number',_process.pre_protocol_number,
    'officialized_at',_process.officialized_at,
    'payment_guide_id',_guide.id,
    'existing',false,
    'reserved_sequence',false
  );
end;
$function$;

create or replace function public.update_external_preprotocol_draft_v1(
  _process_id uuid,
  _payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _profile_id uuid := public.current_profile_id();
  _process public.processes%rowtype;
  _property_id uuid;
  _professional_party_id uuid;
  _owner_party_id uuid;
  _doc jsonb;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  select * into _process
  from public.processes p
  where p.id=_process_id
  for update;

  if _process.id is null then
    raise exception 'Pre-protocolo nao encontrado';
  end if;

  if _process.officialized_at is not null then
    raise exception 'O processo ja foi oficializado e nao pode mais ser alterado como rascunho';
  end if;

  if not public.has_process_access(_process.id) then
    raise exception 'Sem acesso ao pre-protocolo';
  end if;

  if _process.created_by_profile_id is distinct from _profile_id and not public.is_master() then
    raise exception 'Somente o profissional que abriu este pre-protocolo pode altera-lo antes do pagamento';
  end if;

  _property_id := _process.property_id;

  update public.properties
  set iptu_code=coalesce(nullif(_payload->>'iptu',''),'NAO-INFORMADO'),
      registry_code=nullif(_payload->>'registration',''),
      address=coalesce(nullif(_payload->>'address',''),'Endereco nao informado'),
      lot=nullif(_payload->>'lot',''),
      block=nullif(_payload->>'block',''),
      usage_type=nullif(_payload->>'usage',''),
      building_type=nullif(_payload->>'buildingType',''),
      work_type=nullif(_payload->>'workType',''),
      construction_standard=nullif(_payload->>'constructionStandard',''),
      area_m2=nullif(_payload->>'area','')::numeric,
      updated_at=clock_timestamp()
  where id=_property_id;

  update public.processes
  set title=coalesce(nullif(_payload->>'title',''),'Projeto sem titulo'),
      process_type=coalesce(nullif(_payload->>'type',''),'licenciamento'),
      checklist_type=coalesce(nullif(_payload->>'type',''),'licenciamento'),
      preprotocol_payload=_payload,
      updated_at=clock_timestamp()
  where id=_process.id;

  select pp.id into _professional_party_id
  from public.process_parties pp
  where pp.process_id=_process.id
    and pp.party_type='profissional_externo'
  order by pp.is_primary desc,pp.id
  limit 1;

  if _professional_party_id is not null then
    update public.process_parties
    set display_name=coalesce(nullif(_payload->>'technicalLead',''),'Profissional externo'),
        document_masked=case
          when length(regexp_replace(coalesce(_payload->>'professionalDocument',''),'\D','','g')) < 4 then null
          else '***'||right(regexp_replace(_payload->>'professionalDocument','\D','','g'),4)
        end
    where id=_professional_party_id;

    insert into public.process_party_private_data(
      process_id,party_id,tenant_id,municipality_id,
      document_number,registration_number,professional_type,email,phone,company_name
    )
    values(
      _process.id,_professional_party_id,_process.tenant_id,coalesce(_process.municipality_id,_process.tenant_id),
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
  end if;

  select pp.id into _owner_party_id
  from public.process_parties pp
  where pp.process_id=_process.id
    and pp.party_type='proprietario'
  order by pp.is_primary desc,pp.id
  limit 1;

  if _owner_party_id is not null then
    update public.process_parties
    set display_name=coalesce(nullif(_payload->>'ownerName',''),'Proprietario nao informado'),
        document_masked=case
          when length(regexp_replace(coalesce(_payload->>'ownerDocument',''),'\D','','g')) < 4 then null
          else '***'||right(regexp_replace(_payload->>'ownerDocument','\D','','g'),4)
        end
    where id=_owner_party_id;

    insert into public.process_party_private_data(
      process_id,party_id,tenant_id,municipality_id,
      document_number,identity_document_number,identity_document_type,email,phone
    )
    values(
      _process.id,_owner_party_id,_process.tenant_id,coalesce(_process.municipality_id,_process.tenant_id),
      nullif(_payload->>'ownerDocument',''),
      nullif(_payload->>'ownerIdentityDocument',''),
      case when nullif(_payload->>'ownerIdentityDocument','') is null then null else 'RG/RNE/IDENTIDADE' end,
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
  end if;

  delete from public.process_documents
  where process_id=_process.id
    and source='profissional';

  if jsonb_typeof(_payload->'documents')='array' then
    for _doc in select value from jsonb_array_elements(_payload->'documents')
    loop
      insert into public.process_documents(
        tenant_id,process_id,uploaded_by,uploaded_by_profile_id,
        title,file_path,file_hash,version,source,is_required,is_valid,
        file_name,mime_type,size_label,preview_url,review_status,annotations
      )
      values(
        _process.tenant_id,_process.id,public.current_legacy_user_id(),_profile_id,
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

  perform public.save_process_private_identity_v1(_process.id,_payload);

  return jsonb_build_object(
    'ok',true,
    'process_id',_process.id,
    'pre_protocol_number',_process.pre_protocol_number,
    'updated_at',clock_timestamp()
  );
end;
$function$;

create or replace function public.create_external_process_v4(
  _tenant_id uuid,
  _payload jsonb,
  _protocol_prefix text default 'PM',
  _requested_protocol_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _existing public.processes%rowtype;
  _guide public.payment_guides%rowtype;
  _result jsonb;
begin
  if _requested_protocol_number is not null and btrim(_requested_protocol_number)<>'' then
    select * into _existing
    from public.processes p
    where p.tenant_id=_tenant_id
      and (
        p.pre_protocol_number=btrim(_requested_protocol_number)
        or p.protocol_number=btrim(_requested_protocol_number)
      )
    limit 1
    for update;

    if _existing.id is not null then
      if _existing.officialized_at is not null then
        raise exception 'O processo ja foi oficializado; alteracoes devem seguir o fluxo oficial';
      end if;

      perform public.update_external_preprotocol_draft_v1(_existing.id,_payload);

      select * into _guide
      from public.payment_guides g
      where g.process_id=_existing.id
        and g.guide_kind='protocolo'
      order by g.created_at desc
      limit 1;

      return jsonb_build_object(
        'process_id',_existing.id,
        'protocol_number',_existing.protocol_number,
        'pre_protocol_number',_existing.pre_protocol_number,
        'guide_number',_guide.guide_number,
        'due_date',_guide.due_date,
        'amount',_guide.amount,
        'reconciled',true,
        'existing',true,
        'is_official',false,
        'draft_updated',true
      );
    end if;
  end if;

  _result := public.create_external_process_v3(
    _tenant_id,_payload,_protocol_prefix,null
  );

  update public.processes
  set preprotocol_payload=_payload
  where id=nullif(_result->>'process_id','')::uuid
    and officialized_at is null;

  return _result || jsonb_build_object('draft_updated',false);
end;
$function$;

create or replace function public.get_external_preprotocol_draft_v1(
  _pre_protocol_number text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _profile_id uuid := public.current_profile_id();
  _process public.processes%rowtype;
  _guide public.payment_guides%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  select * into _process
  from public.processes p
  where p.pre_protocol_number=btrim(_pre_protocol_number)
     or (p.officialized_at is null and p.protocol_number=btrim(_pre_protocol_number))
  limit 1;

  if _process.id is null then
    raise exception 'Pre-protocolo nao encontrado';
  end if;

  if not public.has_process_access(_process.id) then
    raise exception 'Sem acesso ao pre-protocolo';
  end if;

  if _process.officialized_at is not null then
    raise exception 'Este pre-protocolo ja foi convertido em processo municipal';
  end if;

  select * into _guide
  from public.payment_guides g
  where g.process_id=_process.id
    and g.guide_kind='protocolo'
  order by g.created_at desc
  limit 1;

  return jsonb_build_object(
    'process_id',_process.id,
    'pre_protocol_number',_process.pre_protocol_number,
    'payload',coalesce(_process.preprotocol_payload,'{}'::jsonb),
    'guide',jsonb_build_object(
      'id',_guide.id,
      'number',_guide.guide_number,
      'amount',_guide.amount,
      'due_date',_guide.due_date,
      'status',_guide.status,
      'paid',_guide.paid
    )
  );
end;
$function$;

grant execute on function public.create_external_process_v4(uuid,jsonb,text,text) to authenticated;
grant execute on function public.get_external_preprotocol_draft_v1(text) to authenticated;
grant execute on function public.update_external_preprotocol_draft_v1(uuid,jsonb) to authenticated;

-- Migra apenas pré-protocolos ainda não pagos que consumiram indevidamente a
-- sequência oficial antiga. Nenhum processo oficial é renumerado.
do $block$
declare
  _row record;
  _new_ref text;
  _guide_prefix text;
begin
  for _row in
    select p.id,p.tenant_id,p.municipality_id,p.protocol_number,p.pre_protocol_number,p.created_at
    from public.processes p
    where p.officialized_at is null
      and p.pre_protocol_number ~ '^PRE-[A-Z0-9]+-[0-9]{4}-[0-9]+$'
  loop
    _new_ref := public.next_tenant_preprotocol_number(
      coalesce(_row.municipality_id,_row.tenant_id),
      regexp_replace(_row.pre_protocol_number,'^PRE-([A-Z0-9]+)-.*$','\1'),
      extract(year from _row.created_at)::integer
    );

    update public.processes
    set protocol_number=_new_ref,
        external_protocol_number=_new_ref,
        pre_protocol_number=_new_ref,
        updated_at=clock_timestamp()
    where id=_row.id;

    select upper(regexp_replace(coalesce(nullif(ms.guide_prefix,''),'DAM'),'[^A-Za-z0-9]','','g'))
      into _guide_prefix
    from public.municipality_settings ms
    where ms.municipality_id=coalesce(_row.municipality_id,_row.tenant_id)
    limit 1;

    _guide_prefix := coalesce(nullif(_guide_prefix,''),'DAM');

    update public.payment_guides
    set guide_number=_guide_prefix||'-PRE-'||regexp_replace(_new_ref,'^PRE-[^-]+-','')
    where process_id=_row.id
      and guide_kind='protocolo'
      and not coalesce(paid,false);
  end loop;
end;
$block$;

-- Libera do contador oficial somente reservas que nunca viraram processo.
update public.tenant_protocol_counters c
set last_value=coalesce((
      select max((regexp_match(p.protocol_number,'^[A-Z0-9]+-[0-9]{4}-([0-9]+)$'))[1]::bigint)
      from public.processes p
      where p.tenant_id=c.tenant_id
        and p.officialized_at is not null
        and p.protocol_number like c.prefix||'-'||c.protocol_year::text||'-%'
    ),0),
    updated_at=clock_timestamp()
where c.last_value > coalesce((
      select max((regexp_match(p.protocol_number,'^[A-Z0-9]+-[0-9]{4}-([0-9]+)$'))[1]::bigint)
      from public.processes p
      where p.tenant_id=c.tenant_id
        and p.officialized_at is not null
        and p.protocol_number like c.prefix||'-'||c.protocol_year::text||'-%'
    ),0);

notify pgrst,'reload schema';
