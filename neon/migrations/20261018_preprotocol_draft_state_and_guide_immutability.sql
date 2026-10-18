-- SIGAPRO — preservação integral do rascunho remoto e imutabilidade da guia inicial.
-- 1) editar pré-protocolo nunca apaga dados/documentos já salvos;
-- 2) process_documents é a fonte autoritativa dos anexos ao reabrir;
-- 3) a guia inicial mantém número, emissão, valor e vencimento originais;
-- 4) somente guia vencida pode gerar uma nova guia, preservando a anterior no histórico.

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
  _draft_form jsonb;
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

  -- Sempre reconstrói anexos a partir da tabela oficial.
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
  into _documents
  from public.process_documents d
  where d.process_id=_process.id
    and d.source='profissional'
    and coalesce(d.is_valid,true)=true;

  _payload := coalesce(_process.preprotocol_payload,'{}'::jsonb);
  _draft_form := coalesce(_payload->'draftForm','{}'::jsonb);

  -- Campos antigos são recuperados do cadastro oficial sem apagar os extras
  -- já existentes em draftForm.
  _draft_form :=
    jsonb_build_object(
      'titulo',coalesce(nullif(_draft_form->>'titulo',''),nullif(_payload->>'title',''),_process.title,''),
      'tipo',coalesce(nullif(_draft_form->>'tipo',''),nullif(_payload->>'type',''),_process.process_type,''),
      'endereco',coalesce(nullif(_draft_form->>'endereco',''),nullif(_payload->>'address',''),_property.address,''),
      'iptu',coalesce(nullif(_draft_form->>'iptu',''),nullif(_payload->>'iptu',''),_property.iptu_code,''),
      'matricula',coalesce(nullif(_draft_form->>'matricula',''),nullif(_payload->>'registration',''),_property.registry_code,''),
      'proprietario',coalesce(nullif(_draft_form->>'proprietario',''),nullif(_payload->>'ownerName',''),_owner.display_name,''),
      'documento',coalesce(nullif(_draft_form->>'documento',''),nullif(_payload->>'ownerDocument',''),_owner.document_number,''),
      'proprietarioRg',coalesce(nullif(_draft_form->>'proprietarioRg',''),nullif(_payload->>'ownerIdentityDocument',''),_owner.identity_document_number,''),
      'proprietarioTelefone',coalesce(nullif(_draft_form->>'proprietarioTelefone',''),nullif(_payload->>'ownerPhone',''),_owner.phone,''),
      'proprietarioEmail',coalesce(nullif(_draft_form->>'proprietarioEmail',''),nullif(_payload->>'ownerEmail',''),_owner.email,''),
      'lote',coalesce(nullif(_draft_form->>'lote',''),nullif(_payload->>'lot',''),_property.lot,''),
      'quadra',coalesce(nullif(_draft_form->>'quadra',''),nullif(_payload->>'block',''),_property.block,''),
      'area',coalesce(nullif(_draft_form->>'area',''),nullif(_payload->>'area',''),_property.area_m2::text,''),
      'uso',coalesce(nullif(_draft_form->>'uso',''),nullif(_payload->>'usage',''),_property.usage_type,''),
      'tipoEdificacao',coalesce(nullif(_draft_form->>'tipoEdificacao',''),nullif(_payload->>'buildingType',''),_property.building_type,''),
      'tipoObra',coalesce(nullif(_draft_form->>'tipoObra',''),nullif(_payload->>'workType',''),_property.work_type,''),
      'padraoConstrutivo',coalesce(nullif(_draft_form->>'padraoConstrutivo',''),nullif(_payload->>'constructionStandard',''),_property.construction_standard,''),
      'profissional',coalesce(nullif(_draft_form->>'profissional',''),nullif(_payload->>'technicalLead',''),_professional.display_name,''),
      'profissionalDocumento',coalesce(nullif(_draft_form->>'profissionalDocumento',''),nullif(_payload->>'professionalDocument',''),_professional.document_number,''),
      'tipoProfissional',coalesce(nullif(_draft_form->>'tipoProfissional',''),nullif(_payload->>'professionalType',''),_professional.professional_type,''),
      'empresaProfissional',coalesce(nullif(_draft_form->>'empresaProfissional',''),nullif(_payload->>'professionalCompany',''),_professional.company_name,''),
      'registro',coalesce(nullif(_draft_form->>'registro',''),nullif(_payload->>'professionalRegistration',''),_professional.registration_number,''),
      'telefone',coalesce(nullif(_draft_form->>'telefone',''),nullif(_payload->>'professionalPhone',''),_professional.phone,''),
      'email',coalesce(nullif(_draft_form->>'email',''),nullif(_payload->>'professionalEmail',''),_professional.email,'')
    ) || _draft_form;

  _payload :=
    _payload ||
    jsonb_build_object(
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
      'draftForm',_draft_form,
      'documents',_documents
    );

  select * into _guide
  from public.payment_guides g
  where g.process_id=_process.id
    and g.guide_kind='protocolo'
    and not coalesce(g.paid,false)
  order by
    case when lower(coalesce(g.status,''))='pendente' then 0 else 1 end,
    g.created_at desc
  limit 1;

  if _guide.id is null then
    select * into _guide
    from public.payment_guides g
    where g.process_id=_process.id
      and g.guide_kind='protocolo'
    order by g.created_at desc
    limit 1;
  end if;

  return jsonb_build_object(
    'process_id',_process.id,
    'pre_protocol_number',_process.pre_protocol_number,
    'payload',_payload,
    'guide',jsonb_build_object(
      'id',_guide.id,
      'number',_guide.guide_number,
      'amount',_guide.amount,
      'due_date',_guide.due_date,
      'issued_at',_guide.created_at,
      'status',_guide.status,
      'paid',_guide.paid,
      'original_due_date',_guide.original_due_date,
      'reissue_count',coalesce(_guide.reissue_count,0),
      'last_reissued_at',_guide.last_reissued_at
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
  _existing_doc_id uuid;
  _existing_payload jsonb;
  _merged_payload jsonb;
  _merged_draft_form jsonb;
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

  if not public.has_process_access(_process.id) then
    raise exception 'Sem acesso ao pre-protocolo';
  end if;

  if _process.created_by_profile_id is distinct from _profile_id and not public.is_master() then
    raise exception 'Somente o profissional que abriu este pre-protocolo pode altera-lo antes do pagamento';
  end if;

  _existing_payload := coalesce(_process.preprotocol_payload,'{}'::jsonb);
  _merged_draft_form :=
    coalesce(_existing_payload->'draftForm','{}'::jsonb) ||
    coalesce(_payload->'draftForm','{}'::jsonb);
  _merged_payload := _existing_payload || coalesce(_payload,'{}'::jsonb);
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
      area_m2=coalesce(nullif(_merged_payload->>'area','')::numeric,area_m2),
      updated_at=clock_timestamp()
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

  -- Só toca nos documentos quando o cliente enviou explicitamente o snapshot.
  -- Arquivos iguais mantêm o mesmo id/created_at; novos entram; removidos saem.
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
            is_required=coalesce(nullif(_doc->>'required','')::boolean,is_required),
            version=greatest(version,coalesce(nullif(_doc->>'version','')::integer,version)),
            file_name=coalesce(nullif(_doc->>'fileName',''),file_name),
            mime_type=coalesce(nullif(_doc->>'mimeType',''),mime_type),
            size_label=coalesce(nullif(_doc->>'sizeLabel',''),size_label),
            file_size_bytes=coalesce(nullif(_doc->>'fileSizeBytes','')::bigint,file_size_bytes),
            preview_url=case
              when length(coalesce(_doc->>'previewUrl','')) > 2000000 then preview_url
              else coalesce(nullif(_doc->>'previewUrl',''),preview_url)
            end,
            review_status=coalesce(nullif(_doc->>'reviewStatus',''),review_status),
            annotations=coalesce(_doc->'annotations',annotations),
            is_valid=true,
            invalidated_at=null
        where id=_existing_doc_id;
      else
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
          coalesce(nullif(_doc->>'source',''),'profissional'),
          coalesce(nullif(_doc->>'required','')::boolean,true),
          true,
          _doc->>'fileName',
          _doc->>'mimeType',
          _doc->>'sizeLabel',
          nullif(_doc->>'fileSizeBytes','')::bigint,
          case when length(coalesce(_doc->>'previewUrl','')) > 2000000 then null else _doc->>'previewUrl' end,
          coalesce(nullif(_doc->>'reviewStatus',''),'pendente'),
          coalesce(_doc->'annotations','[]'::jsonb)
        );
      end if;
    end loop;

    delete from public.process_documents d
    where d.process_id=_process.id
      and d.source='profissional'
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

-- Completa o retorno da criação/edição com a emissão original da guia.
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
        and not coalesce(g.paid,false)
      order by
        case when lower(coalesce(g.status,''))='pendente' then 0 else 1 end,
        g.created_at desc
      limit 1;

      if _guide.id is null then
        select * into _guide
        from public.payment_guides g
        where g.process_id=_existing.id
          and g.guide_kind='protocolo'
        order by g.created_at desc
        limit 1;
      end if;

      return jsonb_build_object(
        'process_id',_existing.id,
        'protocol_number',_existing.protocol_number,
        'pre_protocol_number',_existing.pre_protocol_number,
        'guide_number',_guide.guide_number,
        'guide_id',_guide.id,
        'guide_created_at',_guide.created_at,
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

  select * into _guide
  from public.payment_guides g
  where g.process_id=nullif(_result->>'process_id','')::uuid
    and g.guide_kind='protocolo'
  order by g.created_at desc
  limit 1;

  return _result || jsonb_build_object(
    'draft_updated',false,
    'guide_id',_guide.id,
    'guide_created_at',_guide.created_at
  );
end;
$function$;

-- Guia de protocolo: identidade/documento emitido é imutável.
create or replace function public.protect_protocol_guide_identity_v1()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $function$
begin
  if old.guide_kind='protocolo' then
    if new.guide_number is distinct from old.guide_number
       or new.amount is distinct from old.amount
       or new.due_date is distinct from old.due_date
       or new.created_at is distinct from old.created_at
       or new.process_id is distinct from old.process_id
       or new.tenant_id is distinct from old.tenant_id
       or new.municipality_id is distinct from old.municipality_id
       or new.property_id is distinct from old.property_id then
      raise exception 'A guia de protocolo emitida e imutavel. Para vencimento, gere uma nova guia preservando a anterior.';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_protect_protocol_guide_identity_v1 on public.payment_guides;
create trigger trg_protect_protocol_guide_identity_v1
before update on public.payment_guides
for each row execute function public.protect_protocol_guide_identity_v1();

-- Reemissão de protocolo cria outra guia somente depois do vencimento.
create or replace function public.reissue_process_payment_guide(
  _process_id uuid,
  _guide_kind text,
  _due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _tenant_id uuid;
  _municipality_id uuid;
  _property_id uuid;
  _guide public.payment_guides%rowtype;
  _new_guide public.payment_guides%rowtype;
  _due date := coalesce(_due_date,current_date + 2);
  _next_revision integer;
  _new_number text;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if _guide_kind not in ('protocolo','iss_obra','aprovacao_final') then
    raise exception 'Tipo de guia invalido';
  end if;

  if _due < current_date then
    raise exception 'O novo vencimento nao pode estar no passado';
  end if;

  select p.tenant_id,p.municipality_id,p.property_id
    into _tenant_id,_municipality_id,_property_id
  from public.processes p
  where p.id=_process_id;

  if _tenant_id is null then
    raise exception 'Processo nao encontrado';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  if not (public.is_master() or public.is_internal_municipality_role()) then
    raise exception 'Sem permissao para reemitir guia';
  end if;

  select pg.*
    into _guide
  from public.payment_guides pg
  where pg.process_id=_process_id
    and pg.guide_kind=_guide_kind
    and not coalesce(pg.paid,false)
  order by pg.created_at desc
  limit 1
  for update;

  if _guide.id is null then
    raise exception 'Guia nao encontrada para reemissao';
  end if;

  if coalesce(_guide.paid,false)=true
     or lower(coalesce(_guide.status,'')) in ('compensada','confirmed','paid','pago','confirmado') then
    raise exception 'Guia ja compensada nao pode ser reemitida';
  end if;

  if _guide_kind='protocolo' then
    if _guide.due_date is null or _guide.due_date::date >= current_date then
      raise exception 'A guia atual ainda esta valida e deve ser mantida. Nova guia so pode ser gerada apos o vencimento.';
    end if;

    _next_revision := coalesce(_guide.reissue_count,0)+1;
    _new_number := coalesce(_guide.guide_number,'GUIA')||'-R'||_next_revision::text;

    -- O original continua intacto; muda apenas o estado operacional para vencida.
    update public.payment_guides
    set status='vencida'
    where id=_guide.id;

    insert into public.payment_guides(
      tenant_id,municipality_id,process_id,property_id,
      guide_number,municipal_registration,amount,due_date,
      status,paid,guide_kind,original_due_date,reissue_count,last_reissued_at
    )
    values(
      _tenant_id,coalesce(_municipality_id,_tenant_id),_process_id,_property_id,
      _new_number,_guide.municipal_registration,_guide.amount,_due,
      'pendente',false,'protocolo',
      coalesce(_guide.original_due_date,_guide.due_date::date),
      _next_revision,clock_timestamp()
    )
    returning * into _new_guide;

    update public.processes
    set status='pagamento_pendente',
        updated_at=clock_timestamp()
    where id=_process_id;

    insert into public.process_audit_entries(
      tenant_id,process_id,actor_user_id,actor_profile_id,category,
      title,detail,visible_to_external,municipality_id
    )
    values(
      _tenant_id,_process_id,_legacy_user_id,_profile_id,'financeiro',
      'Nova guia emitida apos vencimento',
      'A guia original '||coalesce(_guide.guide_number,'')||
        ' foi preservada. Nova guia '||coalesce(_new_guide.guide_number,'')||
        ' emitida em '||to_char(_new_guide.created_at,'DD/MM/YYYY HH24:MI:SS')||
        ' com vencimento em '||to_char(_due,'DD/MM/YYYY')||'.',
      true,coalesce(_municipality_id,_tenant_id)
    );

    return jsonb_build_object(
      'process_id',_process_id,
      'guide',to_jsonb(_new_guide),
      'previous_guide',to_jsonb(_guide),
      'new_guide',true
    );
  end if;

  -- Demais guias mantêm o comportamento existente para não alterar fluxos
  -- financeiros que possuem revisão própria.
  update public.payment_guides
  set original_due_date=coalesce(original_due_date,due_date),
      due_date=_due,
      status='pendente',
      reissue_count=coalesce(reissue_count,0)+1,
      last_reissued_at=clock_timestamp()
  where id=_guide.id
  returning * into _new_guide;

  update public.processes
  set status='pagamento_pendente',
      updated_at=clock_timestamp()
  where id=_process_id;

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,actor_profile_id,category,
    title,detail,visible_to_external,municipality_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,_profile_id,'financeiro',
    'Guia reemitida',
    'Segunda via #'||_new_guide.reissue_count::text||
      ' da guia '||coalesce(_new_guide.guide_number,'')||
      ' emitida com vencimento em '||to_char(_due,'DD/MM/YYYY')||'.',
    true,coalesce(_municipality_id,_tenant_id)
  );

  return jsonb_build_object(
    'process_id',_process_id,
    'guide',to_jsonb(_new_guide),
    'new_guide',false
  );
end;
$function$;

-- Recuperação de pré-protocolos legados: cria snapshot do que já existe sem
-- alterar documentos, guia, datas ou numeração.
update public.processes p
set preprotocol_payload =
  jsonb_build_object(
    'title',p.title,
    'type',p.process_type,
    'address',coalesce(prop.address,''),
    'iptu',coalesce(prop.iptu_code,''),
    'registration',coalesce(prop.registry_code,''),
    'lot',coalesce(prop.lot,''),
    'block',coalesce(prop.block,''),
    'area',coalesce(prop.area_m2::text,''),
    'usage',coalesce(prop.usage_type,''),
    'buildingType',coalesce(prop.building_type,''),
    'workType',coalesce(prop.work_type,''),
    'constructionStandard',coalesce(prop.construction_standard,''),
    'draftForm',jsonb_build_object(
      'titulo',p.title,
      'tipo',p.process_type,
      'endereco',coalesce(prop.address,''),
      'iptu',coalesce(prop.iptu_code,''),
      'matricula',coalesce(prop.registry_code,''),
      'lote',coalesce(prop.lot,''),
      'quadra',coalesce(prop.block,''),
      'area',coalesce(prop.area_m2::text,''),
      'uso',coalesce(prop.usage_type,''),
      'tipoEdificacao',coalesce(prop.building_type,''),
      'tipoObra',coalesce(prop.work_type,''),
      'padraoConstrutivo',coalesce(prop.construction_standard,''),
      'modalidadeHabiteSe',case when lower(p.process_type) like '%parcial%' then 'parcial' else 'integral' end
    ),
    'documents',coalesce((
      select jsonb_agg(
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
      )
      from public.process_documents d
      where d.process_id=p.id
        and d.source='profissional'
        and coalesce(d.is_valid,true)=true
    ),'[]'::jsonb)
  )
from public.properties prop
where p.property_id=prop.id
  and p.officialized_at is null
  and p.pre_protocol_number is not null
  and p.preprotocol_payload is null;

grant execute on function public.get_external_preprotocol_draft_v1(text) to authenticated;
grant execute on function public.update_external_preprotocol_draft_v1(uuid,jsonb) to authenticated;
grant execute on function public.create_external_process_v4(uuid,jsonb,text,text) to authenticated;
grant execute on function public.reissue_process_payment_guide(uuid,text,date) to authenticated;

notify pgrst,'reload schema';
