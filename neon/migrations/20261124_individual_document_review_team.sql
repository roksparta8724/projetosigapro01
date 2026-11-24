-- Shared municipal analysis team may add supplemental opinions, without changing official acts.
BEGIN;
CREATE OR REPLACE FUNCTION public.record_individual_document_review_v1(_document_id uuid, _action text, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public' SET row_security TO 'off'
AS $function$
DECLARE
  _profile uuid := public.current_profile_id();
  _role text := lower(coalesce(public.current_role_code(),''));
  _process_id uuid;
  _doc public.process_documents%rowtype;
  _process public.processes%rowtype;
  _latest text;
  _title text;
  _audit public.process_audit_entries%rowtype;
  _note text := btrim(coalesce(_reason,''));
BEGIN
  IF _profile IS NULL OR _action IS NULL OR _action NOT IN ('reabrir','aprovar','ressalvas')
     OR length(_note) NOT BETWEEN 8 AND 2000 THEN
    RAISE EXCEPTION 'Informe uma ação válida e justificativa entre 8 e 2000 caracteres.';
  END IF;
  SELECT process_id INTO _process_id FROM public.process_documents WHERE id=_document_id;
  SELECT * INTO _process FROM public.processes WHERE id=_process_id FOR UPDATE;
  SELECT * INTO _doc FROM public.process_documents WHERE id=_document_id AND process_id=_process_id FOR UPDATE;
  IF _doc.id IS NULL OR _process.id IS NULL
     OR _doc.tenant_id IS DISTINCT FROM _process.tenant_id
     OR coalesce(_doc.municipality_id,_doc.tenant_id) IS DISTINCT FROM coalesce(_process.municipality_id,_process.tenant_id)
     OR _doc.is_valid IS DISTINCT FROM true OR _doc.invalidated_at IS NOT NULL
     OR nullif(btrim(_doc.file_path),'') IS NULL
     OR coalesce(_doc.review_status,'') NOT IN ('aprovado','rejeitado')
     OR (coalesce(_doc.source,'')='prefeitura' AND _doc.title ~* '^Ficha Técnica( de Análise assinada| - assinada)')
     OR NOT public.has_process_access(_process_id)
     OR NOT public.process_technical_release_verified_v1(_process_id)
     OR _role NOT IN ('analista','analyst','prefeitura_supervisor','master_admin','master_ops')
     OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=_profile AND p.account_status='active' AND p.deleted_at IS NULL)
     OR (NOT public.is_master() AND (
       public.profile_operational_area(_profile) IS DISTINCT FROM 'analise'
       OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=_profile
         AND p.municipality_id=coalesce(_process.municipality_id,_process.tenant_id))
     )) THEN
    RAISE EXCEPTION 'Documento indisponível para reavaliação individual por este perfil.';
  END IF;
  SELECT title INTO _latest FROM public.process_audit_entries
    WHERE process_id=_process_id AND category='documento'
      AND detail LIKE '[documento:'||_document_id::text||'] %'
      AND title IN ('Reavaliação individual aberta','Reavaliação individual aprovada','Reavaliação individual com ressalvas')
    ORDER BY created_at DESC,id DESC LIMIT 1;
  IF _action='reabrir' THEN
    IF _latest='Reavaliação individual aberta' THEN
      RAISE EXCEPTION 'Já existe uma reavaliação individual em andamento.';
    END IF;
    IF public.process_is_in_analysis_area(_process_id) AND _process.status NOT IN ('deferido','indeferido','arquivado') THEN
      RAISE EXCEPTION 'Utilize a reabertura documental da mesa de análise para esta etapa.';
    END IF;
    _title := 'Reavaliação individual aberta';
  ELSE
    IF _latest IS DISTINCT FROM 'Reavaliação individual aberta' THEN
      RAISE EXCEPTION 'Reabra este documento antes de registrar um novo parecer.';
    END IF;
    _title := CASE WHEN _action='aprovar' THEN 'Reavaliação individual aprovada' ELSE 'Reavaliação individual com ressalvas' END;
  END IF;
  INSERT INTO public.process_audit_entries(tenant_id,process_id,actor_user_id,actor_profile_id,category,title,detail,visible_to_external,created_at,municipality_id)
  VALUES(_doc.tenant_id,_process_id,public.current_legacy_user_id(),_profile,'documento',_title,
    '[documento:'||_document_id::text||'] '||coalesce(_doc.title,'Documento')||
    '. Decisão oficial preservada: '||_doc.review_status||'. Parecer/justificativa: '||_note,
    false,clock_timestamp(),_doc.municipality_id)
  RETURNING * INTO _audit;
  RETURN jsonb_build_object('audit',to_jsonb(_audit));
END;
$function$;
REVOKE ALL ON FUNCTION public.record_individual_document_review_v1(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_individual_document_review_v1(uuid,text,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
