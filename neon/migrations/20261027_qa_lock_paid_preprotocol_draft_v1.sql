-- QA ONLY. A single CREATE OR REPLACE statement, preserving original body.
-- No payment guide, process or production record is rewritten.
-- Rehearse on a verified production clone before any official migration.
CREATE OR REPLACE FUNCTION public.update_external_preprotocol_draft_v1(_process_id uuid, _payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _profile_id uuid := public.current_profile_id();
  _process public.processes%rowtype;
  _property_id uuid;
  _professional_party_id uuid;
  _owner_party_id uuid;
  _doc jsonb;
  _existing_doc_id uuid;
  _existing_payload jsonb;
  _merged_payload jsonb;
  _merged_draft_form jsonb;
  _incoming_payload jsonb := '{}'::jsonb;
  _incoming_draft_form jsonb := '{}'::jsonb;
  _documents_snapshot jsonb := '[]'::jsonb;
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

  if exists (
    select 1 from public.payment_guides guide
    where guide.process_id=_process.id
      and guide.guide_kind='protocolo'
      and (
        coalesce(guide.paid,false)
        or lower(btrim(coalesce(guide.status,''))) in
           ('compensada','paid','pago','confirmed','confirmado')
      )
  ) then
    raise exception 'Guia inicial com pagamento confirmado; edicao do pre-protocolo bloqueada';
  end if;

  if not public.has_process_access(_process.id) then
    raise exception 'Sem acesso ao pre-protocolo';
  end if;

  if _process.created_by_profile_id is distinct from _profile_id and not public.is_master() then
    raise exception 'Somente o profissional que abriu este pre-protocolo pode altera-lo antes do pagamento';
  end if;

  _existing_payload := coalesce(_process.preprotocol_payload,'{}'::jsonb);

  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb)
    into _incoming_payload
  from jsonb_each(coalesce(_payload,'{}'::jsonb))
  where value <> 'null'::jsonb
    and value <> '""'::jsonb
    and key <> 'draftForm';

  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb)
    into _incoming_draft_form
  from jsonb_each(coalesce(_payload->'draftForm','{}'::jsonb))
  where value <> 'null'::jsonb
    and value <> '""'::jsonb;

  _merged_draft_form :=
    coalesce(_existing_payload->'draftForm','{}'::jsonb) ||
    _incoming_draft_form;
  _merged_payload := _existing_payload || _incoming_payload;
  _merged_payload := jsonb_set(
    _merged_payload,
    '{draftForm}',
    _merged_draft_form,
    true
  );

  _property_id := _process.property_id;

  update public.properties
  set iptu_code=coalesce(nullif(_merged_payload->>'iptu',''),iptu_code),
      registry_code=coalesce(nullif(_merged_payload->>'registration',''),registry_code),
      address=coalesce(nullif(_merged_payload->>'address',''),address),
      lot=coalesce(nullif(_merged_payload->>'lot',''),lot),
      block=coalesce(nullif(_merged_payload->>'block',''),block),
      usage_type=coalesce(nullif(_merged_payload->>'usage',''),usage_type),
      building_type=coalesce(nullif(_merged_payload->>'buildingType',''),building_type),
      work_type=coalesce(nullif(_merged_payload->>'workType',''),work_type),
      construction_standard=coalesce(nullif(_merged_payload->>'constructionStandard',''),construction_standard),
      area_m2=coalesce(nullif(_merged_payload->>'area','')::numeric,area_m2)
  where id=_property_id;

  update public.processes
  set title=coalesce(nullif(_merged_payload->>'title',''),title),
      process_type=coalesce(nullif(_merged_payload->>'type',''),process_type),
      checklist_type=coalesce(nullif(_merged_payload->>'type',''),checklist_type),
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
    set display_name=coalesce(nullif(_merged_payload->>'technicalLead',''),display_name),
        document_masked=case
          when nullif(_merged_payload->>'professionalDocument','') is null then document_masked
          when length(regexp_replace(_merged_payload->>'professionalDocument','\D','','g')) < 4 then document_masked
          else '***'||right(regexp_replace(_merged_payload->>'professionalDocument','\D','','g'),4)
        end
    where id=_professional_party_id;

    insert into public.process_party_private_data(
      process_id,party_id,tenant_id,municipality_id,
      document_number,registration_number,professional_type,email,phone,company_name
    )
    values(
      _process.id,_professional_party_id,_process.tenant_id,coalesce(_process.municipality_id,_process.tenant_id),
      nullif(_merged_payload->>'professionalDocument',''),
      nullif(_merged_payload->>'professionalRegistration',''),
      nullif(_merged_payload->>'professionalType',''),
      nullif(_merged_payload->>'professionalEmail',''),
      nullif(_merged_payload->>'professionalPhone',''),
      nullif(_merged_payload->>'professionalCompany','')
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
    set display_name=coalesce(nullif(_merged_payload->>'ownerName',''),display_name),
        document_masked=case
          when nullif(_merged_payload->>'ownerDocument','') is null then document_masked
          when length(regexp_replace(_merged_payload->>'ownerDocument','\D','','g')) < 4 then document_masked
          else '***'||right(regexp_replace(_merged_payload->>'ownerDocument','\D','','g'),4)
        end
    where id=_owner_party_id;

    insert into public.process_party_private_data(
      process_id,party_id,tenant_id,municipality_id,
      document_number,identity_document_number,identity_document_type,email,phone
    )
    values(
      _process.id,_owner_party_id,_process.tenant_id,coalesce(_process.municipality_id,_process.tenant_id),
      nullif(_merged_payload->>'ownerDocument',''),
      nullif(_merged_payload->>'ownerIdentityDocument',''),
      case when nullif(_merged_payload->>'ownerIdentityDocument','') is null then null else 'RG/RNE/IDENTIDADE' end,
      nullif(_merged_payload->>'ownerEmail',''),
      nullif(_merged_payload->>'ownerPhone','')
    )
    on conflict (party_id) do update set
      document_number=coalesce(excluded.document_number,public.process_party_private_data.document_number),
      identity_document_number=coalesce(excluded.identity_document_number,public.process_party_private_data.identity_document_number),
      identity_document_type=coalesce(excluded.identity_document_type,public.process_party_private_data.identity_document_type),
      email=coalesce(excluded.email,public.process_party_private_data.email),
      phone=coalesce(excluded.phone,public.process_party_private_data.phone),
      updated_at=clock_timestamp();
  end if;

  if _payload ? 'documents' and jsonb_typeof(_payload->'documents')='array' then
    for _doc in select value from jsonb_array_elements(_payload->'documents')
    loop
      _existing_doc_id := null;

      select d.id into _existing_doc_id
      from public.process_documents d
      where d.process_id=_process.id
        and d.source='profissional'
        and d.file_path=coalesce(_doc->>'filePath','')
      order by d.created_at
      limit 1;

      if _existing_doc_id is not null then
        update public.process_documents
        set title=coalesce(nullif(_doc->>'label',''),title),
            is_required=is_required,
            version=greatest(version,coalesce(nullif(_doc->>'version','')::integer,version)),
            file_name=coalesce(nullif(_doc->>'fileName',''),file_name),
            mime_type=coalesce(nullif(_doc->>'mimeType',''),mime_type),
            size_label=coalesce(nullif(_doc->>'sizeLabel',''),size_label),
            file_size_bytes=coalesce(nullif(_doc->>'fileSizeBytes','')::bigint,file_size_bytes),
            preview_url=case
              when length(coalesce(_doc->>'previewUrl','')) > 2000000 then preview_url
              else coalesce(nullif(_doc->>'previewUrl',''),preview_url)
            end,
            review_status=review_status,
            annotations=annotations,
            is_valid=is_valid,
            invalidated_at=invalidated_at
        where id=_existing_doc_id;

      else
        -- A client may only link a newly uploaded document from its own
        -- municipality and profile; reject foreign city and pending paths.
        -- Signed storage upload/read continue to enforce byte-level access.
        if nullif(btrim(coalesce(_doc->>'filePath','')),'') is null
           or not (
             (_doc->>'filePath') like
               'municipalities/'||coalesce(_process.municipality_id,_process.tenant_id)::text
                 ||'/protocols/'||_profile_id::text||'/%'
             or (_doc->>'filePath') like
               'municipalities/'||coalesce(_process.municipality_id,_process.tenant_id)::text
                 ||'/habite-se/'||_profile_id::text||'/%'
           )
           or split_part(_doc->>'filePath','/',5) = ''
           or (_doc->>'filePath') like '%..%'
           or nullif(btrim(coalesce(_doc->>'fileName','')),'') is null
           or coalesce(nullif(_doc->>'fileSizeBytes','')::bigint,0) <= 0
        then
          raise exception 'Arquivo do rascunho sem vinculo municipal e de usuario valido';
        end if;
        insert into public.process_documents(

          tenant_id,municipality_id,process_id,uploaded_by,uploaded_by_profile_id,
          title,file_path,file_hash,version,source,is_required,is_valid,
          file_name,mime_type,size_label,file_size_bytes,preview_url,review_status,annotations
        )
        values(
          _process.tenant_id,coalesce(_process.municipality_id,_process.tenant_id),
          _process.id,public.current_legacy_user_id(),_profile_id,
          coalesce(_doc->>'label',_doc->>'fileName','Documento'),
          coalesce(_doc->>'filePath','pending/'||coalesce(_doc->>'fileName',gen_random_uuid()::text)),
          encode(extensions.digest(coalesce(_doc->>'fileName',gen_random_uuid()::text),'sha256'),'hex'),
          coalesce(nullif(_doc->>'version','')::integer,1),
          'profissional',
          coalesce(nullif(_doc->>'required','')::boolean,true),
          true,
          _doc->>'fileName',
          _doc->>'mimeType',
          _doc->>'sizeLabel',
          nullif(_doc->>'fileSizeBytes','')::bigint,
          case when length(coalesce(_doc->>'previewUrl','')) > 2000000 then null else _doc->>'previewUrl' end,
          'pendente',
          '[]'::jsonb
        );
      end if;
    end loop;

    delete from public.process_documents d
    where d.process_id=_process.id
      and d.source='profissional'
      and coalesce(d.is_required,false)=false
      and not exists (
        select 1
        from jsonb_array_elements(_payload->'documents') incoming
        where coalesce(incoming->>'filePath','')=d.file_path
      );
  end if;

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
        'fileSizeBytes',d.file_size_bytes,
        'reviewStatus',coalesce(d.review_status,'pendente'),
        'annotations',coalesce(d.annotations,'[]'::jsonb)
      )
      order by d.created_at,d.id
    ),
    '[]'::jsonb
  )
  into _documents_snapshot
  from public.process_documents d
  where d.process_id=_process.id
    and d.source='profissional'
    and coalesce(d.is_valid,true)=true;

  _merged_payload := jsonb_set(
    _merged_payload,
    '{documents}',
    _documents_snapshot,
    true
  );

  update public.processes
  set preprotocol_payload=_merged_payload,
      updated_at=clock_timestamp()
  where id=_process.id;

  perform public.save_process_private_identity_v1(_process.id,_merged_payload);

  return jsonb_build_object(
    'ok',true,
    'process_id',_process.id,
    'pre_protocol_number',_process.pre_protocol_number,
    'document_count',jsonb_array_length(_documents_snapshot),
    'updated_at',clock_timestamp()
  );
end;
$function$;
