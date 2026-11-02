CREATE OR REPLACE FUNCTION public.request_supplementary_document_v1(
 _process_id uuid,_document_name text,_reason text,_due_at timestamptz DEFAULT NULL,_target_name text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public SET row_security TO off
AS $$
DECLARE _actor uuid:=public.current_profile_id(); _role text:=public.current_role_code();
 _p public.processes%rowtype; _req public.process_requirements%rowtype;
 _name text:=btrim(coalesce(_document_name,''));_why text:=btrim(coalesce(_reason,''));
BEGIN
 IF _actor IS NULL OR _role <> 'analista' THEN RAISE EXCEPTION 'Somente o analista responsável pode solicitar documento complementar'; END IF;
 IF length(_name) NOT BETWEEN 3 AND 160 OR length(_why) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION 'Nome e justificativa inválidos'; END IF;
 IF _due_at IS NOT NULL AND _due_at < now() THEN RAISE EXCEPTION 'Prazo já expirou'; END IF;
 SELECT * INTO _p FROM public.processes WHERE id=_process_id FOR UPDATE;
 IF _p.id IS NULL OR NOT public.has_process_access(_process_id) THEN RAISE EXCEPTION 'Processo não encontrado ou sem acesso'; END IF;
 IF _p.officialized_at IS NULL OR NOT public.process_technical_release_verified_v1(_process_id)
    OR NOT public.process_is_in_analysis_area(_process_id)
    OR _p.analysis_assigned_to_profile_id IS DISTINCT FROM _actor THEN
    RAISE EXCEPTION 'O processo deve estar oficializado, liberado e atribuído a este analista';
 END IF;
 IF _p.status::text IN ('deferido','indeferido','arquivado','cancelado') THEN RAISE EXCEPTION 'Processo encerrado'; END IF;
 INSERT INTO public.process_requirements (
    tenant_id,process_id,title,description,status,visibility,target_name,
    created_by,created_at,due_at,municipality_id,created_by_profile_id
 ) VALUES(
    _p.tenant_id,_p.id,'Documento complementar: '||_name,_why,'aberta','misto',
    nullif(btrim(coalesce(_target_name,'')),''),public.current_legacy_user_id(),now(),
    _due_at,coalesce(_p.municipality_id,_p.tenant_id),_actor
 ) RETURNING * INTO _req;
 UPDATE public.processes SET status='exigencia'::public.process_status,updated_at=now() WHERE id=_p.id;
 INSERT INTO public.process_audit_entries(
    tenant_id,process_id,actor_user_id,actor_profile_id,category,title,detail,
    visible_to_external,created_at,municipality_id
 ) VALUES(
    _p.tenant_id,_p.id,public.current_legacy_user_id(),_actor,'documento',
    'Documento complementar solicitado', 'Solicitação '||_req.id::text||' — '||_name||'. Motivo: '||_why,
    true,now(),coalesce(_p.municipality_id,_p.tenant_id)
 );
 RETURN jsonb_build_object('ok',true,'request_id',_req.id);
END;
$$;
REVOKE ALL ON FUNCTION public.request_supplementary_document_v1(uuid,text,text,timestamptz,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_supplementary_document_v1(uuid,text,text,timestamptz,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.audit_supplementary_response_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public
AS $$
DECLARE _p public.processes%rowtype;
BEGIN
 IF NEW.title NOT LIKE 'Documento complementar: %' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
 SELECT * INTO _p FROM public.processes WHERE id=NEW.process_id;
 INSERT INTO public.process_audit_entries(
   tenant_id,process_id,actor_user_id,actor_profile_id,category,title,detail,
   visible_to_external,created_at,municipality_id
 ) VALUES(
   _p.tenant_id,NEW.process_id,public.current_legacy_user_id(),public.current_profile_id(),
   'documento','Documento complementar atualizado',
   'Solicitação '||NEW.id::text||': '||OLD.status||' -> '||NEW.status||
   CASE WHEN NEW.status='respondida' THEN '. Resposta: '||left(coalesce(NEW.response,''),1000) ELSE '' END,
   true,now(),coalesce(_p.municipality_id,_p.tenant_id)
 );
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_supplementary_response_v1() FROM PUBLIC;
DROP TRIGGER IF EXISTS audit_supplementary_response_v1 ON public.process_requirements;
CREATE TRIGGER audit_supplementary_response_v1 AFTER UPDATE OF status ON public.process_requirements
FOR EACH ROW EXECUTE FUNCTION public.audit_supplementary_response_v1();
