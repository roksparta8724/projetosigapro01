-- SIGAPRO: recuperação segura de pré-protocolos editáveis, inclusive legados.

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
  _property public.properties%rowtype;
  _guide public.payment_guides%rowtype;
  _professional record;
  _owner record;
  _documents jsonb := '[]'::jsonb;
  _payload jsonb;
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

  select * into _property
  from public.properties
  where id=_process.property_id;

  select
    pp.display_name,
    pp.document_masked,
    pd.document_number,
    pd.registration_number,
    pd.professional_type,
    pd.email,
    pd.phone,
    pd.company_name
  into _professional
  from public.process_parties pp
  left join public.process_party_private_data pd on pd.party_id=pp.id
  where pp.process_id=_process.id
    and pp.party_type='profissional_externo'
  order by pp.is_primary desc,pp.id
  limit 1;

  select
    pp.display_name,
    pp.document_masked,
    pd.document_number,
    pd.identity_document_number,
    pd.email,
    pd.phone
  into _owner
  from public.process_parties pp
  left join public.process_party_private_data pd on pd.party_id=pp.id
  where pp.process_id=_process.id
    and pp.party_type='proprietario'
  order by pp.is_primary desc,pp.id
  limit 1;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',d.id,
        'label',d.title,
        'required',d.is_required,
        'signed',false,
        'version',d.version,
        'source',d.source,
        'fileName',d.file_name,
        'filePath',d.file_path,
        'mimeType',d.mime_type,
        'sizeLabel',d.size_label,
        'reviewStatus',coalesce(d.review_status,'pendente'),
        'annotations',coalesce(d.annotations,'[]'::jsonb)
      )
      order by d.created_at,d.id
    ),
    '[]'::jsonb
  )
  into _documents
  from public.process_documents d
  where d.process_id=_process.id
    and d.source='profissional';

  _payload := coalesce(_process.preprotocol_payload,'{}'::jsonb);

  -- Pré-protocolos antigos não possuíam snapshot integral. Reconstruímos tudo
  -- que é oficialmente recuperável sem inventar dados pessoais.
  _payload := jsonb_build_object(
      'title',coalesce(nullif(_payload->>'title',''),_process.title),
      'type',coalesce(nullif(_payload->>'type',''),_process.process_type),
      'address',coalesce(nullif(_payload->>'address',''),_property.address,''),
      'iptu',coalesce(nullif(_payload->>'iptu',''),_property.iptu_code,''),
      'registration',coalesce(nullif(_payload->>'registration',''),_property.registry_code,''),
      'lot',coalesce(nullif(_payload->>'lot',''),_property.lot,''),
      'block',coalesce(nullif(_payload->>'block',''),_property.block,''),
      'area',coalesce(nullif(_payload->>'area',''),_property.area_m2::text,''),
      'usage',coalesce(nullif(_payload->>'usage',''),_property.usage_type,''),
      'buildingType',coalesce(nullif(_payload->>'buildingType',''),_property.building_type,''),
      'workType',coalesce(nullif(_payload->>'workType',''),_property.work_type,''),
      'constructionStandard',coalesce(nullif(_payload->>'constructionStandard',''),_property.construction_standard,''),
      'ownerName',coalesce(nullif(_payload->>'ownerName',''),_owner.display_name,''),
      'ownerDocument',coalesce(nullif(_payload->>'ownerDocument',''),_owner.document_number,''),
      'ownerIdentityDocument',coalesce(nullif(_payload->>'ownerIdentityDocument',''),_owner.identity_document_number,''),
      'ownerPhone',coalesce(nullif(_payload->>'ownerPhone',''),_owner.phone,''),
      'ownerEmail',coalesce(nullif(_payload->>'ownerEmail',''),_owner.email,''),
      'technicalLead',coalesce(nullif(_payload->>'technicalLead',''),_professional.display_name,''),
      'professionalDocument',coalesce(nullif(_payload->>'professionalDocument',''),_professional.document_number,''),
      'professionalRegistration',coalesce(nullif(_payload->>'professionalRegistration',''),_professional.registration_number,''),
      'professionalType',coalesce(nullif(_payload->>'professionalType',''),_professional.professional_type,''),
      'professionalPhone',coalesce(nullif(_payload->>'professionalPhone',''),_professional.phone,''),
      'professionalEmail',coalesce(nullif(_payload->>'professionalEmail',''),_professional.email,''),
      'professionalCompany',coalesce(nullif(_payload->>'professionalCompany',''),_professional.company_name,''),
      'draftForm',coalesce(_payload->'draftForm','{}'::jsonb),
      'documents',case
        when jsonb_typeof(_payload->'documents')='array' and jsonb_array_length(_payload->'documents')>0
          then _payload->'documents'
        else _documents
      end
    ) || (_payload - 'documents' - 'draftForm')
      || jsonb_build_object(
           'draftForm',coalesce(_payload->'draftForm','{}'::jsonb),
           'documents',case
             when jsonb_typeof(_payload->'documents')='array' and jsonb_array_length(_payload->'documents')>0
               then _payload->'documents'
             else _documents
           end
         );

  select * into _guide
  from public.payment_guides g
  where g.process_id=_process.id
    and g.guide_kind='protocolo'
  order by g.created_at desc
  limit 1;

  return jsonb_build_object(
    'process_id',_process.id,
    'pre_protocol_number',_process.pre_protocol_number,
    'payload',_payload,
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
  set iptu_code=coalesce(nullif(_payload->>'iptu',''),iptu_code),
      registry_code=coalesce(nullif(_payload->>'registration',''),registry_code),
      address=coalesce(nullif(_payload->>'address',''),address),
      lot=coalesce(nullif(_payload->>'lot',''),lot),
      block=coalesce(nullif(_payload->>'block',''),block),
      usage_type=coalesce(nullif(_payload->>'usage',''),usage_type),
      building_type=coalesce(nullif(_payload->>'buildingType',''),building_type),
      work_type=coalesce(nullif(_payload->>'workType',''),work_type),
      construction_standard=coalesce(nullif(_payload->>'constructionStandard',''),construction_standard),
      area_m2=coalesce(nullif(_payload->>'area','')::numeric,area_m2),
      updated_at=clock_timestamp()
  where id=_property_id;

  update public.processes
  set title=coalesce(nullif(_payload->>'title',''),title),
      process_type=coalesce(nullif(_payload->>'type',''),process_type),
      checklist_type=coalesce(nullif(_payload->>'type',''),checklist_type),
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
    set display_name=coalesce(nullif(_payload->>'technicalLead',''),display_name),
        document_masked=case
          when nullif(_payload->>'professionalDocument','') is null then document_masked
          when length(regexp_replace(_payload->>'professionalDocument','\D','','g')) < 4 then document_masked
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
      document_number=coalesce(excluded.document_number,public.process_party_private_data.document_number),
      registration_number=coalesce(excluded.registration_number,public.process_party_private_data.registration_number),
      professional_type=coalesce(excluded.professional_type,public.process_party_private_data.professional_type),
      email=coalesce(excluded.email,public.process_party_private_data.email),
      phone=coalesce(excluded.phone,public.process_party_private_data.phone),
      company_name=coalesce(excluded.company_name,public.process_party_private_data.company_name),
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
    set display_name=coalesce(nullif(_payload->>'ownerName',''),display_name),
        document_masked=case
          when nullif(_payload->>'ownerDocument','') is null then document_masked
          when length(regexp_replace(_payload->>'ownerDocument','\D','','g')) < 4 then document_masked
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
      document_number=coalesce(excluded.document_number,public.process_party_private_data.document_number),
      identity_document_number=coalesce(excluded.identity_document_number,public.process_party_private_data.identity_document_number),
      identity_document_type=coalesce(excluded.identity_document_type,public.process_party_private_data.identity_document_type),
      email=coalesce(excluded.email,public.process_party_private_data.email),
      phone=coalesce(excluded.phone,public.process_party_private_data.phone),
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

grant execute on function public.get_external_preprotocol_draft_v1(text) to authenticated;
grant execute on function public.update_external_preprotocol_draft_v1(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
