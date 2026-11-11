-- QA only: real SHA-256 supplied from confirmed R2 upload, never filename.
CREATE OR REPLACE FUNCTION public.upgrade_qa04_architectural_plan_v2(_process_id uuid, _file_path text, _file_name text, _file_size_bytes bigint, _file_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  _actor uuid := public.current_profile_id();
  _old public.process_documents%ROWTYPE;
  _process public.processes%ROWTYPE;
  _new_document_id uuid;
  _canonical_name CONSTANT text := 'SIGAPRO-QA04-PLANTA-IMPLANTACAO-V2.pdf';
BEGIN
  IF _actor IS NULL OR NOT (
      public.is_master() OR lower(coalesce(public.current_role_code(),''))='prefeitura_admin'
  ) THEN
    RAISE EXCEPTION 'Somente administrador autorizado do QA pode atualizar a planta ficticia.';
  END IF;
  SELECT * INTO _process FROM public.processes
    WHERE id=_process_id FOR UPDATE;
  IF _process.id IS NULL
    OR _process.id <> '915e1c63-ebda-4cdd-8e95-34316d9e0089'::uuid
    OR _process.protocol_number <> 'PM-2026-00004'
    OR _process.title <> 'QA-URBAN-E2E-20261024 PROCESSO A FICTÍCIO'
    OR _process.status <> 'triagem'::public.process_status
    OR NOT public.has_process_access(_process_id)
  THEN RAISE EXCEPTION 'Operacao nao permitida fora do processo ficticio QA04 em triagem.'; END IF;

  IF _file_name IS DISTINCT FROM _canonical_name OR
    nullif(btrim(coalesce(_file_path,'')),'') IS NULL OR
    _file_path NOT LIKE ('municipalities/'||_process.tenant_id::text||'/qa-arquitetura/%') OR
    _file_path NOT LIKE ('%'||_canonical_name) OR
    _file_size_bytes IS NULL OR _file_size_bytes < 2000 OR _file_size_bytes > 2000000 OR
    _file_hash IS NULL OR lower(_file_hash) !~ '^[a-f0-9]{64}$'
  THEN RAISE EXCEPTION 'Arquivo V2 de ensaio invalido ou fora do armazenamento QA autorizado.'; END IF;

  SELECT d.id INTO _new_document_id FROM public.process_documents d
    WHERE d.process_id=_process_id AND d.is_valid IS TRUE
      AND d.title='Projeto Arquitetônico' AND d.file_name=_canonical_name LIMIT 1;
  IF _new_document_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok',true,'already_upgraded',true,
      'document_id',_new_document_id,'version',2);
  END IF;

  SELECT * INTO _old FROM public.process_documents d
    WHERE d.process_id=_process_id AND d.is_valid IS TRUE
      AND d.title='Projeto Arquitetônico'
      AND d.file_name='SIGAPRO-QA04-PLANTA-FICTICIA.pdf'
    ORDER BY d.created_at DESC LIMIT 1 FOR UPDATE;
  IF _old.id IS NULL THEN
    RAISE EXCEPTION 'Planta original do QA04 nao encontrada. Use a importacao inicial do kit.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.process_documents d
     WHERE d.process_id=_process_id AND d.file_path=_file_path) THEN
    RAISE EXCEPTION 'Esta referencia R2 ja foi vinculada ao processo.';
  END IF;

  UPDATE public.process_documents
    SET is_valid=false,invalidated_at=clock_timestamp()
    WHERE id=_old.id;

  INSERT INTO public.process_documents(
    tenant_id,municipality_id,process_id,uploaded_by,uploaded_by_profile_id,
    title,file_path,file_hash,version,source,is_required,is_valid,
    file_name,mime_type,file_size_bytes,review_status,annotations
  ) VALUES(
    _process.tenant_id,coalesce(_process.municipality_id,_process.tenant_id),
    _process_id,public.current_legacy_user_id(),_actor,
    'Projeto Arquitetônico',_file_path,
    lower(_file_hash),
    2,'prefeitura',true,true,_file_name,'application/pdf',_file_size_bytes,
    'pendente','[]'::jsonb
  ) RETURNING id INTO _new_document_id;

  INSERT INTO public.process_audit_entries(
    tenant_id,municipality_id,process_id,actor_profile_id,actor_user_id,
    category,title,detail,visible_to_external
  ) VALUES (
    _process.tenant_id,coalesce(_process.municipality_id,_process.tenant_id),
    _process_id,_actor,public.current_legacy_user_id(),
    'documento','QA04: planta de implantacao V2 com recuos anexada',
    'Versao original preservada como historica/inativa. Nova prancha de ensaio com recuos ilustrativos (frontal 5m, laterais 1m, fundos 12m) pendente de conferencia; nao prova atendimento legal.',
    false
  );
  RETURN jsonb_build_object('ok',true,'already_upgraded',false,
    'document_id',_new_document_id,'archived_document_id',_old.id,'version',2);
END;
$function$;
REVOKE ALL ON FUNCTION public.upgrade_qa04_architectural_plan_v2(uuid,text,text,bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upgrade_qa04_architectural_plan_v2(uuid,text,text,bigint,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upgrade_qa04_architectural_plan_v2(uuid,text,text,bigint,text) TO authenticated;
