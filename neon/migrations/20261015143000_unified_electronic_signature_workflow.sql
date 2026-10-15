-- Unified electronic signature workflow.
-- Staging-first. No password is stored. Every signature is bound to a real SHA-256 digest.

alter table public.electronic_signatures
  drop constraint if exists electronic_signatures_entity_type_check;

alter table public.electronic_signatures
  add constraint electronic_signatures_entity_type_check
  check (entity_type in (
    'professional_document_submission',
    'process_document_review',
    'payment_guide_issue',
    'process_dispatch',
    'analysis_conclusion',
    'technical_conclusion',
    'required_process_document',
    'superior_approval_decision',
    'official_document'
  ));

create unique index if not exists electronic_signatures_active_identity_key
  on public.electronic_signatures(
    entity_type,
    entity_id,
    signer_profile_id,
    coalesce(document_version,-1),
    content_sha256
  )
  where revoked_at is null;

create or replace function public.create_electronic_signature_v1(
  _process_id uuid,
  _entity_type text,
  _entity_id text,
  _content_sha256 text,
  _document_version integer default null,
  _statement text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','extensions'
set row_security to 'off'
as $$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _auth_iat timestamptz;
  _tenant_id uuid;
  _municipality_id uuid;
  _profile public.profiles%rowtype;
  _department public.departments%rowtype;
  _membership jsonb := '{}'::jsonb;
  _signed_at timestamptz := now();
  _signature_code text;
  _fingerprint text;
  _record public.electronic_signatures%rowtype;
  _existing public.electronic_signatures%rowtype;
  _entity_exists boolean := false;
  _is_internal boolean := false;
  _role_code text := '';
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if _entity_type not in (
    'professional_document_submission',
    'process_document_review',
    'payment_guide_issue',
    'process_dispatch',
    'analysis_conclusion',
    'technical_conclusion',
    'required_process_document',
    'superior_approval_decision',
    'official_document'
  ) then
    raise exception 'Tipo de assinatura nao suportado';
  end if;

  if coalesce(lower(_content_sha256),'') !~ '^[0-9a-f]{64}$' then
    raise exception 'Hash SHA-256 invalido para assinatura';
  end if;

  select p.tenant_id,coalesce(p.municipality_id,p.tenant_id)
    into _tenant_id,_municipality_id
  from public.processes p
  where p.id=_process_id;

  if _tenant_id is null then
    raise exception 'Processo nao encontrado';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  select * into _profile
  from public.profiles
  where id=_profile_id;

  if _profile.id is null or _profile.account_status<>'active' then
    raise exception 'Perfil do assinante inativo ou nao encontrado';
  end if;

  _role_code := coalesce(public.current_role_code(),_profile.role::text,'');
  _is_internal := public.is_master() or public.is_internal_municipality_role();

  if _entity_type='professional_document_submission' then
    if _role_code not in ('profissional_externo','professional_external','professional','profissional') then
      raise exception 'Somente o profissional responsavel pode assinar documento apresentado pelo portal externo';
    end if;

    select exists(
      select 1
      from public.process_documents d
      join public.processes p on p.id=d.process_id
      where d.id::text=_entity_id
        and d.process_id=_process_id
        and coalesce(d.is_valid,true)=true
        and d.source in ('profissional','professional')
        and lower(coalesce(d.file_hash,''))=lower(_content_sha256)
        and (_document_version is null or d.version=_document_version)
        and (
          d.uploaded_by_profile_id=_profile_id
          or p.created_by_profile_id=_profile_id
          or exists(
            select 1 from public.process_parties pp
            where pp.process_id=_process_id
              and pp.party_type='profissional_externo'
              and pp.profile_id=_profile_id
          )
        )
    ) into _entity_exists;
  else
    if not _is_internal then
      raise exception 'Somente perfil municipal autorizado pode assinar este ato';
    end if;

    if _entity_type='process_document_review' then
      select exists(
        select 1 from public.process_documents d
        where d.id::text=_entity_id
          and d.process_id=_process_id
          and coalesce(d.is_valid,true)=true
          and lower(coalesce(d.file_hash,''))=lower(_content_sha256)
          and (_document_version is null or d.version=_document_version)
      ) into _entity_exists;
    elsif _entity_type='payment_guide_issue' then
      select exists(
        select 1 from public.payment_guides g
        where g.id::text=_entity_id
          and g.process_id=_process_id
          and encode(extensions.digest(to_jsonb(g)::text,'sha256'),'hex')=lower(_content_sha256)
      ) into _entity_exists;
    elsif _entity_type='process_dispatch' then
      select exists(
        select 1 from public.interdepartmental_dispatches d
        where d.id::text=_entity_id
          and d.process_id=_process_id
          and encode(extensions.digest(to_jsonb(d)::text,'sha256'),'hex')=lower(_content_sha256)
      ) into _entity_exists;
    elsif _entity_type='technical_conclusion' then
      select exists(
        select 1
        from public.signature_blocks b
        join public.signatures s on s.signature_block_id=b.id
        where b.process_id=_process_id
          and b.subject_type='technical_conclusion'
          and b.subject_id::text=_entity_id
          and b.status::text='concluido'
          and s.status::text='concluido'
          and s.signer_profile_id=_profile_id
          and lower(coalesce(b.payload_hash,''))=lower(_content_sha256)
          and s.document_hash=b.payload_hash
      ) into _entity_exists;
    elsif _entity_type='required_process_document' then
      select exists(
        select 1
        from public.process_document_signature_requirements r
        join public.signature_blocks b on b.id=r.signature_block_id
        join public.signatures s on s.signature_block_id=b.id
        where r.process_id=_process_id
          and r.id::text=_entity_id
          and r.status='signed'
          and b.subject_type='process_document'
          and b.status::text='concluido'
          and s.status::text='concluido'
          and s.signer_profile_id=_profile_id
          and lower(coalesce(b.payload_hash,''))=lower(_content_sha256)
          and s.document_hash=b.payload_hash
      ) into _entity_exists;
    elsif _entity_type='superior_approval_decision' then
      select exists(
        select 1
        from public.process_approval_decisions d
        join public.signature_blocks b
          on b.subject_type='superior_approval_decision'
         and b.subject_id=d.id
        join public.signatures s on s.signature_block_id=b.id
        where d.process_id=_process_id
          and d.id::text=_entity_id
          and d.actor_profile_id=_profile_id
          and b.status::text='concluido'
          and s.status::text='concluido'
          and s.signer_profile_id=_profile_id
          and lower(coalesce(b.payload_hash,''))=lower(_content_sha256)
          and s.document_hash=b.payload_hash
      ) into _entity_exists;
    elsif _entity_type='analysis_conclusion' then
      _entity_exists := (_entity_id=_process_id::text);
    else
      _entity_exists := false;
    end if;
  end if;

  if not _entity_exists then
    raise exception 'Objeto da assinatura nao pertence ao processo, nao existe ou nao corresponde ao hash oficial';
  end if;

  _auth_iat := public.require_recent_password_auth_v1(180);

  select * into _existing
  from public.electronic_signatures s
  where s.entity_type=_entity_type
    and s.entity_id=_entity_id
    and s.signer_profile_id=_profile_id
    and coalesce(s.document_version,-1)=coalesce(_document_version,-1)
    and s.content_sha256=lower(_content_sha256)
    and s.revoked_at is null
  order by s.signed_at desc
  limit 1;

  if _existing.id is not null then
    return jsonb_build_object(
      'id',_existing.id,
      'processId',_existing.process_id,
      'entityType',_existing.entity_type,
      'entityId',_existing.entity_id,
      'documentVersion',_existing.document_version,
      'signerProfileId',_existing.signer_profile_id,
      'signerName',_existing.signer_name,
      'signerRole',_existing.signer_role,
      'signerProfileLabel',_existing.signer_profile_label,
      'signerTitle',_existing.signer_title,
      'departmentId',_existing.department_id,
      'departmentCode',_existing.department_code,
      'departmentName',_existing.department_name,
      'authMethod',_existing.auth_method,
      'assuranceLevel',_existing.assurance_level,
      'contentSha256',_existing.content_sha256,
      'signatureCode',_existing.signature_code,
      'signatureFingerprint',_existing.signature_fingerprint,
      'statement',_existing.statement,
      'signedAt',_existing.signed_at,
      'replayed',true
    );
  end if;

  if _profile.department_id is not null then
    select * into _department
    from public.departments
    where id=_profile.department_id;
  end if;

  select to_jsonb(tm) into _membership
  from public.tenant_memberships tm
  where tm.profile_id=_profile_id
    and tm.tenant_id=_tenant_id
    and tm.is_active=true
    and tm.deleted_at is null
  order by tm.updated_at desc nulls last,tm.created_at desc nulls last
  limit 1;

  _signature_code :=
    'SIG-'||to_char(_signed_at,'YYYYMMDD')||'-'||
    upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));

  _fingerprint := encode(
    extensions.digest(
      concat_ws('|',
        _signature_code,
        lower(_content_sha256),
        _process_id::text,
        _entity_type,
        _entity_id,
        _profile_id::text,
        _signed_at::text
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.electronic_signatures(
    tenant_id,municipality_id,process_id,entity_type,entity_id,document_version,
    signer_profile_id,signer_user_id,signer_name,signer_role,signer_profile_label,
    signer_title,department_id,department_code,department_name,auth_method,
    assurance_level,content_sha256,signature_code,signature_fingerprint,statement,
    auth_iat,signed_at
  )
  values(
    _tenant_id,_municipality_id,_process_id,_entity_type,_entity_id,_document_version,
    _profile_id,_legacy_user_id,coalesce(nullif(btrim(_profile.full_name),''),'Usuario'),
    _role_code,
    nullif(btrim(_membership->>'profile_label'),''),
    coalesce(
      nullif(btrim(_membership->>'position_title'),''),
      nullif(btrim(_profile.professional_type),''),
      nullif(btrim(_profile.role::text),'')
    ),
    _department.id,nullif(btrim(_department.code),''),nullif(btrim(_department.name),''),
    'password','simple_password',lower(_content_sha256),_signature_code,_fingerprint,
    nullif(btrim(_statement),''),_auth_iat,_signed_at
  )
  returning * into _record;

  insert into public.process_audit_entries(
    tenant_id,municipality_id,process_id,actor_user_id,actor_profile_id,
    category,title,detail,visible_to_external,created_at
  )
  values(
    _tenant_id,_municipality_id,_process_id,_legacy_user_id,_profile_id,
    'assinatura','Assinatura eletronica registrada',
    'Ato '||_entity_type||' assinado eletronicamente. Codigo de verificacao '||_signature_code||'.',
    true,_signed_at
  );

  return jsonb_build_object(
    'id',_record.id,
    'processId',_record.process_id,
    'entityType',_record.entity_type,
    'entityId',_record.entity_id,
    'documentVersion',_record.document_version,
    'signerProfileId',_record.signer_profile_id,
    'signerName',_record.signer_name,
    'signerRole',_record.signer_role,
    'signerProfileLabel',_record.signer_profile_label,
    'signerTitle',_record.signer_title,
    'departmentId',_record.department_id,
    'departmentCode',_record.department_code,
    'departmentName',_record.department_name,
    'authMethod',_record.auth_method,
    'assuranceLevel',_record.assurance_level,
    'contentSha256',_record.content_sha256,
    'signatureCode',_record.signature_code,
    'signatureFingerprint',_record.signature_fingerprint,
    'statement',_record.statement,
    'signedAt',_record.signed_at,
    'replayed',false
  );
end;
$$;

create or replace function public.append_process_documents_v2(
  _process_id uuid,
  _documents jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _tenant_id uuid;
  _municipality_id uuid;
  _created_by_profile_id uuid;
  _role_code text := '';
  _doc jsonb;
  _file_path text;
  _file_hash text;
  _version integer;
  _existing public.process_documents%rowtype;
  _document public.process_documents%rowtype;
  _results jsonb := '[]'::jsonb;
  _inserted integer := 0;
  _reused integer := 0;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if jsonb_typeof(_documents)<>'array' then
    raise exception 'Lista de documentos invalida';
  end if;

  select p.tenant_id,coalesce(p.municipality_id,p.tenant_id),p.created_by_profile_id
    into _tenant_id,_municipality_id,_created_by_profile_id
  from public.processes p
  where p.id=_process_id;

  if _tenant_id is null then
    raise exception 'Processo nao encontrado';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  _role_code := coalesce(public.current_role_code(),'');

  if not (public.is_master() or public.is_internal_municipality_role()) then
    if _role_code not in ('profissional_externo','professional_external','professional','profissional') then
      raise exception 'Somente o profissional responsavel pode anexar documentos neste processo';
    end if;
    if not (
      _created_by_profile_id=_profile_id
      or exists(
        select 1 from public.process_parties pp
        where pp.process_id=_process_id
          and pp.party_type='profissional_externo'
          and pp.profile_id=_profile_id
      )
    ) then
      raise exception 'Profissional sem vinculo com este processo';
    end if;
  end if;

  for _doc in select value from jsonb_array_elements(_documents)
  loop
    _file_path := nullif(btrim(_doc->>'filePath'),'');
    _file_hash := lower(nullif(btrim(_doc->>'fileHash'),''));
    _version := greatest(1,coalesce(nullif(_doc->>'version','')::integer,1));

    if _file_path is null then
      raise exception 'Documento sem referencia permanente no armazenamento';
    end if;
    if coalesce(_file_hash,'') !~ '^[0-9a-f]{64}$' then
      raise exception 'Documento sem SHA-256 real do conteudo';
    end if;

    select * into _existing
    from public.process_documents d
    where d.process_id=_process_id
      and d.file_path=_file_path
      and d.version=_version
      and coalesce(d.is_valid,true)=true
    order by d.created_at desc
    limit 1;

    if _existing.id is not null then
      if lower(coalesce(_existing.file_hash,''))<>_file_hash then
        raise exception 'Arquivo ja registrado com hash diferente';
      end if;
      _document := _existing;
      _reused := _reused + 1;
    else
      insert into public.process_documents(
        tenant_id,municipality_id,process_id,
        uploaded_by,uploaded_by_profile_id,
        title,file_path,file_hash,version,source,
        is_required,is_valid,file_name,mime_type,size_label,
        preview_url,review_status,annotations
      )
      values(
        _tenant_id,_municipality_id,_process_id,
        _legacy_user_id,_profile_id,
        coalesce(nullif(_doc->>'label',''),nullif(_doc->>'fileName',''),'Documento'),
        _file_path,_file_hash,_version,
        coalesce(nullif(_doc->>'source',''),'profissional'),
        coalesce(nullif(_doc->>'required','')::boolean,true),
        true,
        nullif(_doc->>'fileName',''),
        nullif(_doc->>'mimeType',''),
        nullif(_doc->>'sizeLabel',''),
        null,
        coalesce(nullif(_doc->>'reviewStatus',''),'pendente'),
        coalesce(_doc->'annotations','[]'::jsonb)
      )
      returning * into _document;
      _inserted := _inserted + 1;
    end if;

    _results := _results || jsonb_build_array(jsonb_build_object(
      'id',_document.id,
      'label',_document.title,
      'filePath',_document.file_path,
      'fileHash',_document.file_hash,
      'version',_document.version,
      'inserted',_existing.id is null
    ));
    _existing := null;
  end loop;

  if jsonb_array_length(_documents)>0 then
    insert into public.process_audit_entries(
      tenant_id,municipality_id,process_id,actor_user_id,actor_profile_id,
      category,title,detail,visible_to_external,created_at
    )
    values(
      _tenant_id,_municipality_id,_process_id,_legacy_user_id,_profile_id,
      'documento','Documentos sincronizados com integridade SHA-256',
      (_inserted+_reused)::text||' documento(s) validados; '||
      _inserted::text||' novo(s); '||_reused::text||' reutilizado(s).',
      true,now()
    );
  end if;

  return jsonb_build_object(
    'process_id',_process_id,
    'synced',_inserted+_reused,
    'inserted',_inserted,
    'updated',0,
    'stored',_inserted+_reused,
    'reused',_reused,
    'documents',_results
  );
end;
$$;

create or replace function public.sign_professional_process_document_v1(
  _document_id uuid,
  _statement text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $$
declare
  _process_id uuid;
  _version integer;
  _file_hash text;
begin
  perform public.require_recent_password_auth_v1(180);

  select d.process_id,d.version,lower(d.file_hash)
    into _process_id,_version,_file_hash
  from public.process_documents d
  where d.id=_document_id
    and coalesce(d.is_valid,true)=true;

  if _process_id is null then
    raise exception 'Documento nao encontrado';
  end if;
  if coalesce(_file_hash,'') !~ '^[0-9a-f]{64}$' then
    raise exception 'Documento sem SHA-256 oficial para assinatura';
  end if;

  return public.create_electronic_signature_v1(
    _process_id,
    'professional_document_submission',
    _document_id::text,
    _file_hash,
    _version,
    coalesce(_statement,'Declaro a autoria e a integridade do documento apresentado ao processo')
  );
end;
$$;

create or replace function public.sign_and_finalize_process_technical_conclusion_electronic_v1(
  _process_id uuid,
  _statement text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $$
declare
  _result jsonb;
  _conclusion_id uuid;
  _payload_hash text;
  _electronic jsonb;
begin
  perform public.require_recent_password_auth_v1(180);

  if to_regprocedure('public.sign_and_finalize_process_technical_conclusion(uuid)') is null then
    raise exception 'Workflow de conclusao tecnica assinada ainda nao instalado';
  end if;

  _result := public.sign_and_finalize_process_technical_conclusion(_process_id);
  _conclusion_id := nullif(_result->>'id','')::uuid;

  if _conclusion_id is null then
    select c.id into _conclusion_id
    from public.process_technical_conclusions c
    where c.process_id=_process_id
    limit 1;
  end if;

  select b.payload_hash into _payload_hash
  from public.signature_blocks b
  join public.signatures s on s.signature_block_id=b.id
  where b.process_id=_process_id
    and b.subject_type='technical_conclusion'
    and b.subject_id=_conclusion_id
    and s.signer_profile_id=public.current_profile_id()
    and b.status::text='concluido'
    and s.status::text='concluido'
  order by s.signed_at desc
  limit 1;

  if coalesce(_payload_hash,'') !~ '^[0-9a-f]{64}$' then
    raise exception 'Conclusao tecnica sem prova criptografica oficial';
  end if;

  _electronic := public.create_electronic_signature_v1(
    _process_id,'technical_conclusion',_conclusion_id::text,_payload_hash,null,
    coalesce(_statement,'Assinatura da conclusao tecnica')
  );

  return _result || jsonb_build_object('electronic_signature',_electronic);
end;
$$;

create or replace function public.sign_required_process_document_electronic_v1(
  _process_id uuid,
  _requirement_id uuid,
  _statement text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $$
declare
  _result jsonb;
  _block_id uuid;
  _payload_hash text;
  _electronic jsonb;
begin
  perform public.require_recent_password_auth_v1(180);

  if to_regprocedure('public.sign_required_process_document(uuid,uuid)') is null then
    raise exception 'Workflow de assinatura obrigatoria de documento ainda nao instalado';
  end if;

  _result := public.sign_required_process_document(_process_id,_requirement_id);
  _block_id := nullif(_result->>'signature_block_id','')::uuid;

  select b.payload_hash into _payload_hash
  from public.signature_blocks b
  join public.signatures s on s.signature_block_id=b.id
  where b.id=_block_id
    and b.process_id=_process_id
    and b.subject_type='process_document'
    and b.subject_id=_requirement_id
    and s.signer_profile_id=public.current_profile_id()
    and b.status::text='concluido'
    and s.status::text='concluido'
  limit 1;

  if coalesce(_payload_hash,'') !~ '^[0-9a-f]{64}$' then
    raise exception 'Documento obrigatorio sem prova criptografica oficial';
  end if;

  _electronic := public.create_electronic_signature_v1(
    _process_id,'required_process_document',_requirement_id::text,_payload_hash,null,
    coalesce(_statement,'Assinatura obrigatoria de documento administrativo')
  );

  return _result || jsonb_build_object('electronic_signature',_electronic);
end;
$$;

create or replace function public.execute_signed_superior_approval_action_electronic_v1(
  _process_id uuid,
  _transition_id uuid,
  _decision_note text,
  _idempotency_key text,
  _statement text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $$
declare
  _result jsonb;
  _decision_id uuid;
  _payload_hash text;
  _electronic jsonb;
begin
  perform public.require_recent_password_auth_v1(180);

  if to_regprocedure('public.execute_signed_superior_approval_action(uuid,uuid,text,text)') is null then
    raise exception 'Workflow de decisao superior assinada ainda nao instalado';
  end if;

  _result := public.execute_signed_superior_approval_action(
    _process_id,_transition_id,_decision_note,_idempotency_key
  );
  _decision_id := nullif(_result->>'decision_id','')::uuid;

  if _decision_id is null then
    raise exception 'Decisao superior sem identificador persistido';
  end if;

  select b.payload_hash into _payload_hash
  from public.signature_blocks b
  join public.signatures s on s.signature_block_id=b.id
  where b.process_id=_process_id
    and b.subject_type='superior_approval_decision'
    and b.subject_id=_decision_id
    and s.signer_profile_id=public.current_profile_id()
    and b.status::text='concluido'
    and s.status::text='concluido'
  order by s.signed_at desc
  limit 1;

  if coalesce(_payload_hash,'') !~ '^[0-9a-f]{64}$' then
    raise exception 'Decisao superior sem prova criptografica oficial';
  end if;

  _electronic := public.create_electronic_signature_v1(
    _process_id,'superior_approval_decision',_decision_id::text,_payload_hash,null,
    coalesce(_statement,'Decisao administrativa superior assinada eletronicamente')
  );

  return _result || jsonb_build_object('electronic_signature',_electronic);
end;
$$;

create or replace function public.verify_electronic_signature_v1(
  _signature_code text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $$
declare
  _record public.electronic_signatures%rowtype;
  _protocol text;
  _municipality_name text;
begin
  select * into _record
  from public.electronic_signatures s
  where upper(s.signature_code)=upper(btrim(_signature_code))
  limit 1;

  if _record.id is null then
    return jsonb_build_object(
      'valid',false,
      'status','not_found',
      'signatureCode',upper(btrim(coalesce(_signature_code,'')))
    );
  end if;

  select p.protocol_number into _protocol
  from public.processes p
  where p.id=_record.process_id;

  select m.name into _municipality_name
  from public.municipalities m
  where m.id=_record.municipality_id;

  return jsonb_build_object(
    'valid',_record.revoked_at is null,
    'status',case when _record.revoked_at is null then 'valid' else 'revoked' end,
    'signatureCode',_record.signature_code,
    'signatureFingerprint',_record.signature_fingerprint,
    'contentSha256',_record.content_sha256,
    'entityType',_record.entity_type,
    'documentVersion',_record.document_version,
    'signerName',_record.signer_name,
    'signerRole',_record.signer_role,
    'signerProfileLabel',_record.signer_profile_label,
    'signerTitle',_record.signer_title,
    'departmentCode',_record.department_code,
    'departmentName',_record.department_name,
    'assuranceLevel',_record.assurance_level,
    'signedAt',_record.signed_at,
    'revokedAt',_record.revoked_at,
    'revocationReason',_record.revocation_reason,
    'protocolNumber',_protocol,
    'municipalityName',_municipality_name
  );
end;
$$;

grant execute on function public.append_process_documents_v2(uuid,jsonb) to authenticated;
grant execute on function public.sign_professional_process_document_v1(uuid,text) to authenticated;
grant execute on function public.sign_and_finalize_process_technical_conclusion_electronic_v1(uuid,text) to authenticated;
grant execute on function public.sign_required_process_document_electronic_v1(uuid,uuid,text) to authenticated;
grant execute on function public.execute_signed_superior_approval_action_electronic_v1(uuid,uuid,text,text,text) to authenticated;
grant execute on function public.verify_electronic_signature_v1(text) to public;
