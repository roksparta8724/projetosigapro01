-- SIGAPRO: sincronizacao idempotente de documentos do processo.
-- Um protocolo só pode considerar um arquivo como enviado quando existe file_path persistido.

create or replace function public.sync_process_documents(
  _process_id uuid,
  _documents jsonb
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
  _doc jsonb;
  _existing_id uuid;
  _inserted integer := 0;
  _updated integer := 0;
  _synced integer := 0;
  _stored integer := 0;
  _file_path text;
  _file_name text;
  _label text;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if jsonb_typeof(_documents) <> 'array' then
    raise exception 'Lista de documentos invalida';
  end if;

  select p.tenant_id,p.municipality_id
    into _tenant_id,_municipality_id
  from public.processes p
  where p.id=_process_id
  for update;

  if _tenant_id is null then
    raise exception 'Processo nao encontrado';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  for _doc in select value from jsonb_array_elements(_documents)
  loop
    _file_path := nullif(btrim(coalesce(_doc->>'filePath','')), '');
    _file_name := nullif(btrim(coalesce(_doc->>'fileName','')), '');
    _label := coalesce(nullif(btrim(_doc->>'label'),''), _file_name, 'Documento');

    if _file_path is null then
      raise exception 'Documento "%" nao possui arquivo persistido no armazenamento oficial', _label;
    end if;

    _existing_id := null;

    select d.id
      into _existing_id
    from public.process_documents d
    where d.process_id=_process_id
      and d.file_path=_file_path
    order by d.created_at desc
    limit 1;

    if _existing_id is null then
      insert into public.process_documents(
        tenant_id,municipality_id,process_id,
        uploaded_by,uploaded_by_profile_id,
        title,file_path,file_hash,version,source,
        is_required,is_valid,file_name,mime_type,size_label,
        preview_url,review_status,annotations
      )
      values(
        _tenant_id,coalesce(_municipality_id,_tenant_id),_process_id,
        _legacy_user_id,_profile_id,
        _label,
        _file_path,
        coalesce(
          nullif(_doc->>'fileHash',''),
          encode(extensions.digest(_file_path || '|' || coalesce(_file_name,''),'sha256'),'hex')
        ),
        greatest(coalesce(nullif(_doc->>'version','')::integer,1),1),
        coalesce(nullif(_doc->>'source',''),'profissional'),
        coalesce(nullif(_doc->>'required','')::boolean,true),
        true,
        _file_name,
        nullif(_doc->>'mimeType',''),
        nullif(_doc->>'sizeLabel',''),
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
             source=coalesce(nullif(_doc->>'source',''),source),
             is_required=coalesce(nullif(_doc->>'required','')::boolean,is_required),
             is_valid=true,
             invalidated_at=null,
             review_status=case
               when review_status in ('aprovado','rejeitado') then review_status
               else coalesce(nullif(_doc->>'reviewStatus',''),'pendente')
             end,
             annotations=coalesce(_doc->'annotations',annotations)
       where id=_existing_id;
      _updated := _updated + 1;
    end if;

    _synced := _synced + 1;
  end loop;

  select count(*)::integer
    into _stored
  from public.process_documents d
  where d.process_id=_process_id
    and d.is_valid=true
    and d.file_path is not null
    and btrim(d.file_path) <> ''
    and d.file_path not like 'pending/%';

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
    'process_id',_process_id,
    'synced',_synced,
    'inserted',_inserted,
    'updated',_updated,
    'stored',_stored
  );
end;
$function$;

revoke all on function public.sync_process_documents(uuid,jsonb) from public;
grant execute on function public.sync_process_documents(uuid,jsonb) to authenticated;

-- Compatibilidade: o fluxo antigo de anexos passa a usar a sincronizacao segura.
create or replace function public.append_process_documents(
  _process_id uuid,
  _documents jsonb
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
set row_security = off
as $function$
  select public.sync_process_documents(_process_id,_documents);
$function$;

revoke all on function public.append_process_documents(uuid,jsonb) from public;
grant execute on function public.append_process_documents(uuid,jsonb) to authenticated;
