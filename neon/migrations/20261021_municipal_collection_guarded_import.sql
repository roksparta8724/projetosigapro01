-- Recebimento controlado de PDF de arrecadação municipal (somente guia externa).
-- Esta migração depende de 20261021_municipal_collection_configuration.sql.
-- Homologar exclusivamente em branch Neon isolada; não executar em produção.
begin;

create or replace function public.append_municipal_collection_guide_document_v1(
  _municipality_id uuid, _process_id uuid, _reference text, _guide_kind text, _document jsonb
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public
set row_security=off
as $$
declare
  _mode public.municipal_collection_configurations;
  _process public.processes;
  _role text := coalesce(public.current_role_code(),'');
  _profile_id uuid := public.current_profile_id();
  _user_id uuid := public.current_legacy_user_id();
  _path text := nullif(btrim(_document->>'filePath'),'');
  _title text := nullif(btrim(_document->>'label'),'');
  _hash text := nullif(btrim(_document->>'fileHash'),'');
  _file_name text := nullif(btrim(_document->>'fileName'),'');
  _bytes bigint := coalesce(nullif(_document->>'fileSizeBytes','')::bigint,0);
  _ref text := upper(btrim(_reference));
  _existing uuid;
begin
  if _profile_id is null or not (public.is_master() or public.is_internal_municipality_role()) then
    raise exception 'Somente servidores municipais autenticados podem importar guias';
  end if;
  if not public.is_master() and _role in ('prefeitura_admin','admin_municipality','admin_prefeitura') then
    raise exception 'Administrador da Prefeitura configura arrecadacao, mas nao opera guias';
  end if;
  if _guide_kind not in ('protocolo','iss_obra','aprovacao_final','habite_se') then
    raise exception 'Tipo de guia invalido';
  end if;
  if not public.is_master() and (
    (_guide_kind='protocolo' and _role not in ('counter_service','expedient','setor_intersetorial','prefeitura_supervisor')) or
    (_guide_kind<>'protocolo' and _role not in ('financial','financeiro','prefeitura_supervisor','setor_intersetorial'))
  ) then
    raise exception 'Guia deve ser importada pelo departamento responsavel';
  end if;
  if _ref !~ '^[A-Z0-9][A-Z0-9./_-]{2,79}$' then raise exception 'Numero da guia invalido'; end if;
  if _hash !~ '^[a-f0-9]{64}$' then raise exception 'SHA-256 da guia obrigatorio'; end if;
  if _file_name is null or lower(right(_file_name,4)) <> '.pdf' then raise exception 'Somente PDF oficial'; end if;
  if _bytes < 16 or _bytes > 3145728 then raise exception 'PDF fora do limite permitido'; end if;
  if coalesce(_document->>'mimeType','') <> 'application/pdf' then raise exception 'Tipo MIME de guia invalido'; end if;
  if coalesce(_document->>'source','') <> 'integracao' then raise exception 'Origem da guia invalida'; end if;
  if _title is null or _title not like '% - '||_ref||' | %' or
     _title !~ '^Guia (GOVBR/AR|municipal oficial) - ' then
    raise exception 'Identificacao da guia importada invalida';
  end if;
  if _path is null or _path not like 'municipalities/'||_municipality_id::text||'/govbr-ar/%' or
     _path like '%..%' or _path not like '%.pdf' then
    raise exception 'Arquivo fora do escopo privado de arrecadacao desta Prefeitura';
  end if;
  select * into _process from public.processes where id=_process_id;
  if _process.id is null or coalesce(_process.municipality_id,_process.tenant_id)<>_municipality_id then
    raise exception 'Processo nao pertence a esta Prefeitura';
  end if;
  if not public.has_tenant_access(_municipality_id) and not public.is_master() then
    raise exception 'Sem acesso a Prefeitura';
  end if;
  select * into _mode from public.municipal_collection_configurations
    where municipality_id=_municipality_id and status='active'
    order by version desc limit 1;
  if _mode.id is null or _mode.mode <> 'municipal_system' or _mode.integration_type <> 'controlled_import' then
    raise exception 'Importacao de guia municipal nao esta ativa nesta Prefeitura';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('guide-import:'||_process_id::text,0));
  select id into _existing from public.process_documents
    where process_id=_process_id and (
      file_hash=_hash or title=_title or file_path=_path
    ) limit 1;
  if _existing is not null then raise exception 'Guia ja importada neste processo; abra o PDF original'; end if;

  insert into public.process_documents(
    tenant_id,municipality_id,process_id,uploaded_by,uploaded_by_profile_id,
    title,file_path,file_hash,version,source,is_required,is_valid,
    file_name,mime_type,size_label,file_size_bytes,review_status,annotations
  ) values(
    _process.tenant_id,_municipality_id,_process_id,_user_id,_profile_id,
    _title,_path,_hash,1,'integracao',false,true,_file_name,'application/pdf',
    (_bytes/1024)::text||' KB',_bytes,'pendente','[]'::jsonb
  );
  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,actor_profile_id,
    category,title,detail,visible_to_external,municipality_id
  ) values (
    _process.tenant_id,_process_id,_user_id,_profile_id,
    'documento','Guia municipal oficial recebida',
    'Guia externa '||_ref||' recebida pela Prefeitura (PDF original, sem cobranca SIGAPRO e sem baixa automatica).',
    true,_municipality_id
  );
  return jsonb_build_object('process_id',_process_id,'synced',1,'inserted',1,'stored',1);
end $$;

revoke all on function public.append_municipal_collection_guide_document_v1(uuid,uuid,text,text,jsonb) from public;
grant execute on function public.append_municipal_collection_guide_document_v1(uuid,uuid,text,text,jsonb) to authenticated;
commit;
notify pgrst,'reload schema';
