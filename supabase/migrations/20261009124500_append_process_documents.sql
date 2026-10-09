-- SIGAPRO: anexos complementares passam a ser persistidos no banco oficial.

create or replace function public.append_process_documents(
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
  _inserted_count integer := 0;
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
  where p.id=_process_id;

  if _tenant_id is null then
    raise exception 'Processo nao encontrado';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  for _doc in select value from jsonb_array_elements(_documents)
  loop
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
      coalesce(nullif(_doc->>'label',''),nullif(_doc->>'fileName',''),'Documento'),
      coalesce(nullif(_doc->>'filePath',''),'pending/'||coalesce(nullif(_doc->>'fileName',''),gen_random_uuid()::text)),
      coalesce(
        nullif(_doc->>'fileHash',''),
        encode(digest(coalesce(nullif(_doc->>'fileName',''),gen_random_uuid()::text),'sha256'),'hex')
      ),
      coalesce(nullif(_doc->>'version','')::integer,1),
      coalesce(nullif(_doc->>'source',''),'profissional'),
      coalesce(nullif(_doc->>'required','')::boolean,true),
      true,
      nullif(_doc->>'fileName',''),
      nullif(_doc->>'mimeType',''),
      nullif(_doc->>'sizeLabel',''),
      case
        when length(coalesce(_doc->>'previewUrl',''))>2000000 then null
        else nullif(_doc->>'previewUrl','')
      end,
      coalesce(nullif(_doc->>'reviewStatus',''),'pendente'),
      coalesce(_doc->'annotations','[]'::jsonb)
    );

    _inserted_count := _inserted_count + 1;
  end loop;

  insert into public.process_movements(
    tenant_id,process_id,actor_user_id,actor_profile_id,
    movement_type,from_status,to_status,description,
    visible_to_external,municipality_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,_profile_id,
    'documentos_anexados',null,null,
    _inserted_count::text||' documento(s) anexado(s) ao processo.',
    true,coalesce(_municipality_id,_tenant_id)
  );

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,actor_profile_id,
    category,title,detail,visible_to_external,municipality_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,_profile_id,
    'documento','Documentos anexados',
    _inserted_count::text||' documento(s) adicionados ao processo.',
    true,coalesce(_municipality_id,_tenant_id)
  );

  return jsonb_build_object(
    'process_id',_process_id,
    'inserted',_inserted_count
  );
end;
$function$;

revoke all on function public.append_process_documents(uuid,jsonb) from public;
grant execute on function public.append_process_documents(uuid,jsonb) to authenticated;
