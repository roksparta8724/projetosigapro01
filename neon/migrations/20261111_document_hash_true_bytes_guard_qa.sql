-- QA: canonical SHA-256 of actual uploaded bytes is mandatory.
-- Never synthesize a cryptographic digest from a filename, key or metadata.
-- No data updates or deletions; legacy records stay unchanged for forensic review.
-- SIGAPRO: protected process document sync. Cannot forge cross-tenant paths.
-- Admin/master read-only; external professionals only their authorized stages.
CREATE OR REPLACE FUNCTION public.sync_process_documents(_process_id uuid, _documents jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _tenant_id uuid;
  _municipality_id uuid;
  _doc jsonb;
  _existing_id uuid;
  _inserted integer := 0;
  _updated integer := 0;
  _synced integer := 0;
  _stored integer := 0;
  _file_path text;
  _file_name text;
  _label text;
  _file_size_bytes bigint;
  _provided_sha256 text;
  _role text := coalesce(public.current_role_code(),'');
  _process_status public.process_status;
  _process_creator uuid;
  _profile_municipality uuid;
  _existing_review text;
begin
  if _profile_id is null then raise exception 'Usuario nao autenticado ou sem perfil'; end if;
  if jsonb_typeof(_documents) <> 'array' then raise exception 'Lista de documentos invalida'; end if;

  select p.tenant_id,p.municipality_id,p.status,p.created_by_profile_id
    into _tenant_id,_municipality_id,_process_status,_process_creator
  from public.processes p where p.id=_process_id for update;

  if _tenant_id is null then raise exception 'Processo nao encontrado'; end if;
  if not public.has_process_access(_process_id) then raise exception 'Sem acesso ao processo'; end if;
  SELECT municipality_id INTO _profile_municipality
    FROM public.profiles WHERE id=_profile_id AND account_status='active'
      AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil inativo ou sem autorização'; END IF;
  IF _role IN ('prefeitura_admin','admin_municipality',
               'master_admin','master_ops','admin_master') THEN
    RAISE EXCEPTION 'Perfil administrativo não modifica documentos dos processos';
  END IF;
  IF _role='profissional_externo' THEN
    IF _profile_municipality IS DISTINCT FROM coalesce(_municipality_id,_tenant_id)
       OR _process_status NOT IN
         ('rascunho'::public.process_status,
          'pendencia_documental'::public.process_status,
          'exigencia'::public.process_status,
          'reapresentacao'::public.process_status)
       OR (_process_creator IS DISTINCT FROM _profile_id AND
           NOT EXISTS (SELECT 1 FROM public.process_parties pp
             WHERE pp.process_id=_process_id AND pp.profile_id=_profile_id
               AND pp.party_type='profissional_externo'))
    THEN RAISE EXCEPTION 'Somente o profissional vinculado pode anexar nesta fase';
    END IF;
  END IF;

  for _doc in select value from jsonb_array_elements(_documents)
  loop
    _file_path := nullif(btrim(coalesce(_doc->>'filePath','')), '');
    _file_name := nullif(btrim(coalesce(_doc->>'fileName','')), '');
    _label := coalesce(nullif(btrim(_doc->>'label'),''), _file_name, 'Documento');
    _file_size_bytes := greatest(coalesce(nullif(_doc->>'fileSizeBytes','')::bigint,0),0);
    _provided_sha256 := lower(nullif(btrim(coalesce(_doc->>'fileHash','')), ''));

    if _file_path is null then
      raise exception 'Documento "%" nao possui arquivo persistido no armazenamento oficial', _label;
    end if;
    IF _provided_sha256 IS NULL OR _provided_sha256 !~ '^[a-f0-9]{64} (
          '^municipalities/'||coalesce(_municipality_id,_tenant_id)::text||
          '/(protocols|habite-se|attachments|analysis|documents|comunique-se)/'||
          _profile_id::text||'/[0-9a-f-]{36}-[A-Za-z0-9._-]{1,180}$'
        )
        OR _file_size_bytes<=0 OR _file_size_bytes>2147483648
        OR length(_label)>160 OR length(coalesce(_file_name,''))>180
        OR coalesce(_doc->>'source','profissional')<>'profissional'
        OR coalesce(_doc->>'reviewStatus','pendente')<>'pendente'
        OR coalesce(_doc->'annotations','[]'::jsonb)<>'[]'::jsonb
      THEN RAISE EXCEPTION 'Arquivo fora do perfil e município autorizado';
      END IF;
    END IF;

    _existing_id := null;
    select d.id into _existing_id
    from public.process_documents d
    where d.process_id=_process_id and d.file_path=_file_path
    order by d.created_at desc limit 1;

    IF _existing_id IS NOT NULL AND _role='profissional_externo' THEN
      SELECT review_status INTO _existing_review
      FROM public.process_documents WHERE id=_existing_id;
      IF _existing_review IN ('aprovado','rejeitado') THEN
        RAISE EXCEPTION 'Documento revisado é imutável. Envie uma nova versão.';
      END IF;
    END IF;

    if _existing_id is null then
      insert into public.process_documents(
        tenant_id,municipality_id,process_id,
        uploaded_by,uploaded_by_profile_id,
        title,file_path,file_hash,version,source,
        is_required,is_valid,file_name,mime_type,size_label,file_size_bytes,
        preview_url,review_status,annotations
      )
      values(
        _tenant_id,coalesce(_municipality_id,_tenant_id),_process_id,
        _legacy_user_id,_profile_id,
        _label,_file_path,
        _provided_sha256,
        greatest(coalesce(nullif(_doc->>'version','')::integer,1),1),
        coalesce(nullif(_doc->>'source',''),'profissional'),
        coalesce(nullif(_doc->>'required','')::boolean,true),
        true,_file_name,nullif(_doc->>'mimeType',''),nullif(_doc->>'sizeLabel',''),
        nullif(_file_size_bytes,0),
        case when length(coalesce(_doc->>'previewUrl',''))>2000000 then null else nullif(_doc->>'previewUrl','') end,
        coalesce(nullif(_doc->>'reviewStatus',''),'pendente'),
        coalesce(_doc->'annotations','[]'::jsonb)
      );
      _inserted := _inserted + 1;
    else
      IF EXISTS (SELECT 1 FROM public.process_documents d WHERE d.id=_existing_id AND
          (lower(coalesce(d.file_hash,'')) IS DISTINCT FROM _provided_sha256 OR
           d.file_size_bytes IS DISTINCT FROM _file_size_bytes)) THEN
        RAISE EXCEPTION 'Arquivo já registrado possui identidade diferente; uma nova versão e chave R2 são obrigatórias';
      END IF;
      update public.process_documents
         set title=_label,
             file_name=coalesce(_file_name,file_name),
             mime_type=coalesce(nullif(_doc->>'mimeType',''),mime_type),
             size_label=coalesce(nullif(_doc->>'sizeLabel',''),size_label),
             file_size_bytes=coalesce(nullif(_file_size_bytes,0),file_size_bytes),
             source=coalesce(nullif(_doc->>'source',''),source),
             is_required=coalesce(nullif(_doc->>'required','')::boolean,is_required),
             is_valid=true,
             invalidated_at=null,
             review_status=case when review_status in ('aprovado','rejeitado') then review_status else coalesce(nullif(_doc->>'reviewStatus',''),'pendente') end,
             annotations=coalesce(_doc->'annotations',annotations)
       where id=_existing_id;
      _updated := _updated + 1;
    end if;
    _synced := _synced + 1;
  end loop;

  select count(*)::integer into _stored
  from public.process_documents d
  where d.process_id=_process_id and d.is_valid=true and d.file_path is not null
    and btrim(d.file_path) <> '' and d.file_path not like 'pending/%';

  if _synced > 0 then
    insert into public.process_audit_entries(
      tenant_id,process_id,actor_user_id,actor_profile_id,
      category,title,detail,visible_to_external,municipality_id
    )
    values(
      _tenant_id,_process_id,_legacy_user_id,_profile_id,
      'documento','Documentos sincronizados',
      _synced::text||' documento(s) confirmados no armazenamento e no processo.',
      true,coalesce(_municipality_id,_tenant_id)
    );
  end if;

  return jsonb_build_object(
    'process_id',_process_id,'synced',_synced,'inserted',_inserted,'updated',_updated,'stored',_stored
  );
end;
$function$

 OR
       _file_size_bytes <= 0 OR _file_size_bytes > 2147483648 THEN
      RAISE EXCEPTION 'Hash SHA-256 real ou tamanho em bytes ausente: envie novamente o arquivo pelo R2';
    END IF;
    IF _role='profissional_externo' THEN
      IF _file_path !~ (
          '^municipalities/'||coalesce(_municipality_id,_tenant_id)::text||
          '/(protocols|habite-se|attachments|analysis|documents|comunique-se)/'||
          _profile_id::text||'/[0-9a-f-]{36}-[A-Za-z0-9._-]{1,180}$'
        )
        OR _file_size_bytes<=0 OR _file_size_bytes>2147483648
        OR length(_label)>160 OR length(coalesce(_file_name,''))>180
        OR coalesce(_doc->>'source','profissional')<>'profissional'
        OR coalesce(_doc->>'reviewStatus','pendente')<>'pendente'
        OR coalesce(_doc->'annotations','[]'::jsonb)<>'[]'::jsonb
      THEN RAISE EXCEPTION 'Arquivo fora do perfil e município autorizado';
      END IF;
    END IF;

    _existing_id := null;
    select d.id into _existing_id
    from public.process_documents d
    where d.process_id=_process_id and d.file_path=_file_path
    order by d.created_at desc limit 1;

    IF _existing_id IS NOT NULL AND _role='profissional_externo' THEN
      SELECT review_status INTO _existing_review
      FROM public.process_documents WHERE id=_existing_id;
      IF _existing_review IN ('aprovado','rejeitado') THEN
        RAISE EXCEPTION 'Documento revisado é imutável. Envie uma nova versão.';
      END IF;
    END IF;

    if _existing_id is null then
      insert into public.process_documents(
        tenant_id,municipality_id,process_id,
        uploaded_by,uploaded_by_profile_id,
        title,file_path,file_hash,version,source,
        is_required,is_valid,file_name,mime_type,size_label,file_size_bytes,
        preview_url,review_status,annotations
      )
      values(
        _tenant_id,coalesce(_municipality_id,_tenant_id),_process_id,
        _legacy_user_id,_profile_id,
        _label,_file_path,
        coalesce(nullif(_doc->>'fileHash',''),encode(extensions.digest(_file_path || '|' || coalesce(_file_name,''),'sha256'),'hex')),
        greatest(coalesce(nullif(_doc->>'version','')::integer,1),1),
        coalesce(nullif(_doc->>'source',''),'profissional'),
        coalesce(nullif(_doc->>'required','')::boolean,true),
        true,_file_name,nullif(_doc->>'mimeType',''),nullif(_doc->>'sizeLabel',''),
        nullif(_file_size_bytes,0),
        case when length(coalesce(_doc->>'previewUrl',''))>2000000 then null else nullif(_doc->>'previewUrl','') end,
        coalesce(nullif(_doc->>'reviewStatus',''),'pendente'),
        coalesce(_doc->'annotations','[]'::jsonb)
      );
      _inserted := _inserted + 1;
    else
      update public.process_documents
         set title=_label,
             file_name=coalesce(_file_name,file_name),
             mime_type=coalesce(nullif(_doc->>'mimeType',''),mime_type),
             size_label=coalesce(nullif(_doc->>'sizeLabel',''),size_label),
             file_size_bytes=coalesce(nullif(_file_size_bytes,0),file_size_bytes),
             source=coalesce(nullif(_doc->>'source',''),source),
             is_required=coalesce(nullif(_doc->>'required','')::boolean,is_required),
             is_valid=true,
             invalidated_at=null,
             review_status=case when review_status in ('aprovado','rejeitado') then review_status else coalesce(nullif(_doc->>'reviewStatus',''),'pendente') end,
             annotations=coalesce(_doc->'annotations',annotations)
       where id=_existing_id;
      _updated := _updated + 1;
    end if;
    _synced := _synced + 1;
  end loop;

  select count(*)::integer into _stored
  from public.process_documents d
  where d.process_id=_process_id and d.is_valid=true and d.file_path is not null
    and btrim(d.file_path) <> '' and d.file_path not like 'pending/%';

  if _synced > 0 then
    insert into public.process_audit_entries(
      tenant_id,process_id,actor_user_id,actor_profile_id,
      category,title,detail,visible_to_external,municipality_id
    )
    values(
      _tenant_id,_process_id,_legacy_user_id,_profile_id,
      'documento','Documentos sincronizados',
      _synced::text||' documento(s) confirmados no armazenamento e no processo.',
      true,coalesce(_municipality_id,_tenant_id)
    );
  end if;

  return jsonb_build_object(
    'process_id',_process_id,'synced',_synced,'inserted',_inserted,'updated',_updated,'stored',_stored
  );
end;
$function$


REVOKE ALL ON FUNCTION public.sync_process_documents(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_process_documents(uuid,jsonb) TO authenticated;
