-- Operational RPCs and trigger guards previously present only in isolated QA.
-- Never migrate QA-only Mercado Pago receipts or test process data.
-- Source: verified public function definitions from QA branch; secure grants + conditional triggers.
BEGIN;
CREATE OR REPLACE FUNCTION public.audit_supplementary_response_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.authorize_payment_guide_original_upload_v1(_guide_id uuid, _municipality_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ declare g public.payment_guides; begin
  select * into strict g from public.payment_guides where id = _guide_id and municipality_id = _municipality_id;
  perform public.assert_dam_writer_v1(g);
  return not coalesce(g.paid,false) and lower(coalesce(g.status,'')) not in ('compensada','paid','pago','confirmed','confirmado') and g.document_snapshot is not null and g.original_pdf_key is null;
end $function$;

CREATE OR REPLACE FUNCTION public.complete_supplementary_document_v1(_requirement_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
 _actor uuid:=public.current_profile_id();
 _role text:=public.current_role_code();
 _req public.process_requirements%rowtype;
 _p public.processes%rowtype;
BEGIN
 IF _actor IS NULL OR _role <> 'analista' THEN
   RAISE EXCEPTION 'Somente o analista designado pode concluir a solicitação documental';
 END IF;
 SELECT * INTO _req FROM public.process_requirements WHERE id=_requirement_id FOR UPDATE;
 IF _req.id IS NULL OR _req.title NOT LIKE 'Documento complementar: %' OR _req.status<>'respondida' THEN
   RAISE EXCEPTION 'Solicitação complementar não encontrada ou sem resposta para conferir';
 END IF;
 SELECT * INTO _p FROM public.processes WHERE id=_req.process_id FOR UPDATE;
 IF _p.id IS NULL OR NOT public.has_process_access(_req.process_id)
    OR _p.analysis_assigned_to_profile_id IS DISTINCT FROM _actor
    OR NOT public.process_is_in_analysis_area(_req.process_id) THEN
   RAISE EXCEPTION 'Somente o analista responsável por este processo pode concluir a conferência';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.process_documents d
   WHERE d.process_id=_req.process_id AND d.title=_req.title
     AND coalesce(d.is_valid,true)=true AND d.source='profissional'
     AND nullif(btrim(coalesce(d.file_path,'')),'') IS NOT NULL
 ) THEN
   RAISE EXCEPTION 'Documento complementar ainda não foi efetivamente anexado pelo profissional';
 END IF;
 UPDATE public.process_requirements SET status='atendida' WHERE id=_req.id;
 IF NOT EXISTS (
   SELECT 1 FROM public.process_requirements r
   WHERE r.process_id=_req.process_id AND r.status IN ('aberta','respondida')
 ) THEN
   UPDATE public.processes SET status='analise_tecnica'::public.process_status,updated_at=now()
   WHERE id=_req.process_id AND status='exigencia'::public.process_status;
 END IF;
 RETURN jsonb_build_object('ok',true,'requirement_id',_req.id,'process_id',_req.process_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.correct_my_paid_protocol_v1(_process_id uuid, _address text DEFAULT NULL::text, _area_m2 numeric DEFAULT NULL::numeric, _owner_name text DEFAULT NULL::text, _technical_lead text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
 _p public.processes%rowtype; _actor uuid:=public.current_profile_id();
 _address_clean text:=nullif(btrim(_address),'');
 _owner_clean text:=nullif(btrim(_owner_name),'');
 _tech_clean text:=nullif(btrim(_technical_lead),'');
 _property_id uuid; _changes text[]:=ARRAY[]::text[];
 _result jsonb;
BEGIN
 SELECT * INTO _p FROM public.processes WHERE id=_process_id FOR UPDATE;
 IF _actor IS NULL OR public.current_role_code()<>'profissional_externo' OR _p.id IS NULL
    OR _p.officialized_at IS NULL OR _p.status<>'pendencia_documental'::public.process_status
    OR (_p.created_by_profile_id IS DISTINCT FROM _actor AND NOT EXISTS(
      SELECT 1 FROM public.process_parties x WHERE x.process_id=_p.id
        AND x.profile_id=_actor AND x.party_type='profissional_externo'))
    OR NOT public.has_process_access(_p.id) THEN
   RAISE EXCEPTION 'Somente o profissional vinculado pode corrigir a solicitação devolvida';
 END IF;
 IF _area_m2 IS NOT NULL AND (_area_m2<=0 OR _area_m2>100000000) THEN RAISE EXCEPTION 'Área informada inválida'; END IF;
 IF _address_clean IS NOT NULL AND length(_address_clean)<8 THEN RAISE EXCEPTION 'Informe o endereço completo'; END IF;
 IF _owner_clean IS NOT NULL AND length(_owner_clean)<3 THEN RAISE EXCEPTION 'Informe o nome do proprietário'; END IF;
 IF _tech_clean IS NOT NULL AND length(_tech_clean)<3 THEN RAISE EXCEPTION 'Informe o responsável técnico'; END IF;
 IF _address_clean IS NULL AND _area_m2 IS NULL AND _owner_clean IS NULL AND _tech_clean IS NULL THEN
   RAISE EXCEPTION 'Informe ao menos uma correção';
 END IF;
 _property_id:=_p.property_id;
 IF _property_id IS NULL THEN
   IF _address_clean IS NULL THEN
     RAISE EXCEPTION 'Informe o endereço do imóvel antes de salvar o cadastro inicial';
   END IF;
   -- Banco municipal requer IPTU não nulo mesmo quando o campo está em branco.
   INSERT INTO public.properties (tenant_id,municipality_id,iptu_code,address,area_m2)
   VALUES (_p.tenant_id,coalesce(_p.municipality_id,_p.tenant_id),'',_address_clean,_area_m2)
   RETURNING id INTO _property_id;
   UPDATE public.processes SET property_id=_property_id WHERE id=_p.id;
 ELSE
   UPDATE public.properties SET address=coalesce(_address_clean,address),
     area_m2=coalesce(_area_m2,area_m2) WHERE id=_property_id;
 END IF;
 IF _address_clean IS NOT NULL THEN _changes:=array_append(_changes,'endereço atualizado'); END IF;
 IF _area_m2 IS NOT NULL THEN _changes:=array_append(_changes,'área atualizada'); END IF;
 IF _owner_clean IS NOT NULL THEN
   IF EXISTS(SELECT 1 FROM public.process_parties WHERE process_id=_p.id AND party_type='proprietario') THEN
     UPDATE public.process_parties SET display_name=_owner_clean WHERE id=(
       SELECT id FROM public.process_parties WHERE process_id=_p.id AND party_type='proprietario' ORDER BY is_primary DESC,id LIMIT 1);
   ELSE
     INSERT INTO public.process_parties(process_id,tenant_id,municipality_id,party_type,display_name,is_primary)
     VALUES(_p.id,_p.tenant_id,coalesce(_p.municipality_id,_p.tenant_id),'proprietario',_owner_clean,true);
   END IF;
   _changes:=array_append(_changes,'proprietário atualizado');
 END IF;
 IF _tech_clean IS NOT NULL THEN
   IF EXISTS(SELECT 1 FROM public.process_parties WHERE process_id=_p.id AND party_type='profissional_externo') THEN
     UPDATE public.process_parties SET display_name=_tech_clean WHERE id=(
       SELECT id FROM public.process_parties WHERE process_id=_p.id AND party_type='profissional_externo' ORDER BY is_primary DESC,id LIMIT 1);
   ELSE
     INSERT INTO public.process_parties(process_id,tenant_id,municipality_id,party_type,display_name,
       is_primary,profile_id,user_id)
     VALUES(_p.id,_p.tenant_id,coalesce(_p.municipality_id,_p.tenant_id),
       'profissional_externo',_tech_clean,true,_actor,public.current_legacy_user_id());
   END IF;
   _changes:=array_append(_changes,'responsável técnico atualizado');
 END IF;
 INSERT INTO public.process_audit_entries(
   tenant_id,municipality_id,process_id,actor_user_id,actor_profile_id,
   category,title,detail,visible_to_external,created_at)
 VALUES(_p.tenant_id,coalesce(_p.municipality_id,_p.tenant_id),_p.id,
   public.current_legacy_user_id(),_actor,'protocolo',
   'Correção cadastral pelo profissional',array_to_string(_changes,'; '),true,clock_timestamp());
 _result:=public.evaluate_automatic_protocol_triage_v1(_p.id);
 RETURN jsonb_build_object('ok',true,'triage',_result);
END;
$function$;

CREATE OR REPLACE FUNCTION public.evaluate_automatic_protocol_triage_v1(_process_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
 _p public.processes%rowtype;
 _property public.properties%rowtype;
 _missing text[] := ARRAY[]::text[];
 _type text;
 _count int;
 _required_missing int;
 _detail text;
 _department text;
 _previous public.process_status;
 _target uuid;
 _guide_paid boolean;
 _is_approval boolean;
 _is_habite boolean;
 _note text;
 _doc_count integer;
BEGIN
 SELECT * INTO _p FROM public.processes WHERE id=_process_id FOR UPDATE;
 IF _p.id IS NULL THEN RETURN jsonb_build_object('status','not_found'); END IF;
 -- Never touch drafts, settled workflows, existing dispatches, or unconfirmed payments.
 IF _p.officialized_at IS NULL OR _p.status NOT IN
    ('triagem'::public.process_status,'pendencia_documental'::public.process_status)
    OR _p.triage_status='concluido' THEN
   RETURN jsonb_build_object('status','not_eligible');
 END IF;
 SELECT EXISTS (
   SELECT 1 FROM public.payment_guides g
   WHERE g.process_id=_p.id AND g.guide_kind='protocolo'
     AND (g.paid IS TRUE OR lower(coalesce(g.status,'')) IN ('compensada','confirmed','paid','pago','confirmado'))
 ) INTO _guide_paid;
 IF NOT _guide_paid THEN RETURN jsonb_build_object('status','awaiting_payment'); END IF;
 IF EXISTS (SELECT 1 FROM public.interdepartmental_dispatches d
            WHERE d.process_id=_p.id AND public.operational_area_from_label(d.to_department)='analise') THEN
    RETURN jsonb_build_object('status','already_dispatched');
 END IF;
 _type:=lower(coalesce(_p.process_type,''));
 _is_habite:=_type ~ '(habite[- ]?se|ocupac[aã]o)';
 _is_approval:=NOT _is_habite AND _type ~ '(aprov|licenciament|arquitet|projeto)';
 SELECT * INTO _property FROM public.properties WHERE id=_p.property_id;
 IF nullif(btrim(coalesce(_p.title,'')),'') IS NULL OR lower(btrim(coalesce(_p.title,''))) IN ('não informado','nao informado') THEN
   _missing:=array_append(_missing,'Informe o título da solicitação.');
 END IF;
 IF _is_approval OR _is_habite THEN
   IF nullif(btrim(coalesce(_property.address,'')),'') IS NULL
      OR lower(btrim(coalesce(_property.address,''))) IN ('nao informado','não informado','endereço não informado') THEN
     _missing:=array_append(_missing,'Informe o endereço completo do imóvel.');
   END IF;
   IF coalesce(_property.area_m2,0)<=0 THEN _missing:=array_append(_missing,'Informe a área do imóvel/obra em m².'); END IF;
   IF NOT EXISTS (SELECT 1 FROM public.process_parties pp
                  WHERE pp.process_id=_p.id AND pp.party_type='proprietario'
                    AND nullif(btrim(coalesce(pp.display_name,'')),'') IS NOT NULL
                    AND lower(btrim(pp.display_name)) NOT IN ('não informado','nao informado')) THEN
     _missing:=array_append(_missing,'Informe o proprietário do imóvel.');
   END IF;
   IF NOT EXISTS (SELECT 1 FROM public.process_parties pp
                  WHERE pp.process_id=_p.id AND pp.party_type='profissional_externo'
                    AND nullif(btrim(coalesce(pp.display_name,'')),'') IS NOT NULL
                    AND lower(btrim(pp.display_name)) NOT IN ('não informado','nao informado')) THEN
     _missing:=array_append(_missing,'Informe o responsável técnico do projeto.');
   END IF;
 END IF;
 SELECT count(*) INTO _doc_count FROM public.process_documents d
 WHERE d.process_id=_p.id AND d.is_valid IS TRUE
   AND nullif(btrim(coalesce(d.file_path,'')),'') IS NOT NULL
   AND d.file_path NOT LIKE 'pending/%'
   AND (coalesce(d.file_size_bytes,1)>0);
 IF _is_approval THEN
   IF NOT EXISTS (SELECT 1 FROM public.process_documents d WHERE d.process_id=_p.id
     AND d.is_valid IS TRUE AND d.is_required IS TRUE AND d.file_path NOT LIKE 'pending/%'
     AND nullif(btrim(coalesce(d.file_path,'')),'') IS NOT NULL
     AND coalesce(d.file_size_bytes,1)>0 AND lower(d.title)~'projeto arquitet[oô]nico') THEN
     _missing:=array_append(_missing,'Anexe o Projeto Arquitetônico.');
   END IF;
   IF NOT EXISTS (SELECT 1 FROM public.process_documents d WHERE d.process_id=_p.id
     AND d.is_valid IS TRUE AND d.is_required IS TRUE AND d.file_path NOT LIKE 'pending/%'
     AND nullif(btrim(coalesce(d.file_path,'')),'') IS NOT NULL
     AND coalesce(d.file_size_bytes,1)>0 AND lower(d.title)~'memorial descritivo') THEN
     _missing:=array_append(_missing,'Anexe o Memorial Descritivo.');
   END IF;
   IF NOT EXISTS (SELECT 1 FROM public.process_documents d WHERE d.process_id=_p.id
     AND d.is_valid IS TRUE AND d.is_required IS TRUE AND d.file_path NOT LIKE 'pending/%'
     AND nullif(btrim(coalesce(d.file_path,'')),'') IS NOT NULL
     AND coalesce(d.file_size_bytes,1)>0 AND lower(d.title)~'(^|[^a-z])(art|rrt)([^a-z]|$)') THEN
     _missing:=array_append(_missing,'Anexe a ART/RRT.');
   END IF;
   IF NOT EXISTS (SELECT 1 FROM public.process_documents d WHERE d.process_id=_p.id
     AND d.is_valid IS TRUE AND d.is_required IS TRUE AND d.file_path NOT LIKE 'pending/%'
     AND nullif(btrim(coalesce(d.file_path,'')),'') IS NOT NULL
     AND coalesce(d.file_size_bytes,1)>0 AND lower(d.title)~'(matr[ií]cula|escritura)') THEN
     _missing:=array_append(_missing,'Anexe a Escritura/Matrícula.');
   END IF;
 ELSIF _doc_count=0 THEN
   _missing:=array_append(_missing,'Anexe a documentação obrigatória deste serviço.');
 END IF;
 -- Do not ignore a configured mandatory slot whose current file is absent.
 SELECT count(*) INTO _required_missing FROM public.process_documents d
 WHERE d.process_id=_p.id AND d.is_required IS TRUE AND d.is_valid IS TRUE
   AND (nullif(btrim(coalesce(d.file_path,'')),'') IS NULL
        OR d.file_path LIKE 'pending/%' OR coalesce(d.file_size_bytes,1)<=0);
 IF _required_missing>0 THEN
   _missing:=array_append(_missing,format('Há %s anexo(s) obrigatório(s) sem arquivo válido.',_required_missing));
 END IF;
 _previous:=_p.status;
 IF coalesce(array_length(_missing,1),0)>0 THEN
   _detail:=left(array_to_string(_missing,' '),1900);
   _note:='Triagem automática — correção necessária: '||_detail;
   IF _p.status='pendencia_documental'::public.process_status AND _p.triage_notes=_note THEN
     RETURN jsonb_build_object('status','waiting_correction','missing',to_jsonb(_missing),'changed',false);
   END IF;
   UPDATE public.processes
      SET status='pendencia_documental'::public.process_status,
          triage_status='recebido',
          triage_assigned_to=NULL,triage_notes=_note,
          current_department='Profissional externo',current_queue='Correção documental',
          process_checkpoint='Aguardando correção do profissional — triagem automática',
          sla_stage='Correção documental do profissional',updated_at=clock_timestamp()
    WHERE id=_p.id;
   INSERT INTO public.process_audit_entries
     (tenant_id,municipality_id,process_id,category,title,detail,visible_to_external,created_at)
    VALUES(_p.tenant_id,coalesce(_p.municipality_id,_p.tenant_id),_p.id,
      'sistema','Triagem automática — correção solicitada',_detail,true,clock_timestamp());
   INSERT INTO public.process_movements
    (tenant_id,municipality_id,process_id,movement_type,from_status,to_status,description,visible_to_external,created_at)
    VALUES(_p.tenant_id,coalesce(_p.municipality_id,_p.tenant_id),_p.id,
      'triagem_automatica',_previous,'pendencia_documental'::public.process_status,_detail,true,clock_timestamp());
   SELECT COALESCE(
     (SELECT pp.profile_id FROM public.process_parties pp JOIN public.profiles pf ON pf.id=pp.profile_id
      WHERE pp.process_id=_p.id AND pp.party_type='profissional_externo' AND pf.role='profissional_externo'
      AND pf.account_status='active' AND pf.deleted_at IS NULL LIMIT 1),
     (SELECT pf.id FROM public.profiles pf WHERE pf.id=_p.created_by_profile_id
      AND pf.role='profissional_externo' AND pf.account_status='active' AND pf.deleted_at IS NULL)
   ) INTO _target;
   -- Um único alerta na devolução inicial; uploads parciais apenas atualizam
   -- o checklist e o histórico, evitando notificações repetidas por arquivo.
   IF _target IS NOT NULL AND _previous<>'pendencia_documental'::public.process_status THEN
     PERFORM public.enqueue_notification_v1(_target,'Corrija a documentação da solicitação',
       _p.protocol_number||': '||_detail,'processo',_p.id,
       '/processos/'||_p.id::text||'?aba=documentos','documento','alta',
       NULL,'auto-triage:missing:'||_p.id::text||':'||md5(_detail),'{}'::jsonb);
   END IF;
   RETURN jsonb_build_object('status','waiting_correction','missing',to_jsonb(_missing),'changed',true);
 END IF;
 SELECT d.name INTO _department
 FROM public.departments d
 WHERE d.municipality_id=coalesce(_p.municipality_id,_p.tenant_id)
   AND d.is_active IS TRUE AND public.operational_area_from_label(d.name)='analise'
 ORDER BY CASE WHEN d.name='Análise Urbanística' THEN 0 ELSE 1 END,d.sort_order,d.name LIMIT 1;
 IF _department IS NULL THEN
   -- Infrastructure/organogram error: never route to a fictitious department.
   RETURN jsonb_build_object('status','configuration_error','detail','Unidade de Análise Urbanística não configurada.');
 END IF;
 -- Idempotent, atomic dispatch; the existing guards still validate destination and finance.
 UPDATE public.processes SET triage_status='concluido',
     triage_notes='Triagem automática concluída: cadastro e anexos obrigatórios presentes.',
     triage_assigned_to='Sistema SIGAPRO',updated_at=clock_timestamp()
 WHERE id=_p.id;
 INSERT INTO public.interdepartmental_dispatches
   (tenant_id,municipality_id,process_id,from_department,to_department,subject,visibility,
    status,priority,created_at)
 VALUES(_p.tenant_id,coalesce(_p.municipality_id,_p.tenant_id),_p.id,
    'Setor de Protocolo',_department,'Encaminhamento automático após conferência documental',
    'misto','aguardando','media',clock_timestamp());
 UPDATE public.processes SET status='distribuicao'::public.process_status,
      current_department=_department,current_queue=_department,
      process_checkpoint='Recebido automaticamente na Análise Urbanística — aguardando distribuição',
      sla_stage='Distribuição da Análise Urbanística',updated_at=clock_timestamp()
 WHERE id=_p.id;
 INSERT INTO public.process_audit_entries
   (tenant_id,municipality_id,process_id,category,title,detail,visible_to_external,created_at)
 VALUES (_p.tenant_id,coalesce(_p.municipality_id,_p.tenant_id),_p.id,
   'sistema','Triagem automática concluída',
   'Cadastro e documentação obrigatória presentes. Encaminhado automaticamente para '||_department||
   '. A avaliação técnica ainda depende do analista.',true,clock_timestamp());
 INSERT INTO public.process_movements
   (tenant_id,municipality_id,process_id,movement_type,from_status,to_status,description,visible_to_external,created_at)
 VALUES (_p.tenant_id,coalesce(_p.municipality_id,_p.tenant_id),_p.id,
   'triagem_automatica',_previous,'distribuicao'::public.process_status,
   'Triagem automática concluída; encaminhado a '||_department,true,clock_timestamp());
 RETURN jsonb_build_object('status','dispatched','department',_department);
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_municipal_admin_process_write_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF lower(coalesce(public.current_role_code(), '')) IN ('prefeitura_admin', 'admin_municipality') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Administrador da Prefeitura possui acesso somente de leitura aos processos.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recheck_my_automatic_triage_v1(_process_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
DECLARE _p public.processes%rowtype;_actor uuid:=public.current_profile_id();
BEGIN
 SELECT * INTO _p FROM public.processes WHERE id=_process_id;
 IF _actor IS NULL OR public.current_role_code()<>'profissional_externo'
   OR _p.id IS NULL OR _p.status<>'pendencia_documental'::public.process_status
   OR (_p.created_by_profile_id IS DISTINCT FROM _actor AND NOT EXISTS (
     SELECT 1 FROM public.process_parties pp WHERE pp.process_id=_p.id
       AND pp.profile_id=_actor AND pp.party_type='profissional_externo'))
   OR NOT public.has_process_access(_p.id) THEN
   RAISE EXCEPTION 'Somente o profissional vinculado pode reenviar a conferência';
 END IF;
 RETURN public.evaluate_automatic_protocol_triage_v1(_p.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.request_supplementary_document_v1(_process_id uuid, _document_name text, _reason text, _due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, _target_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.save_urban_precheck_run_v6(_process_id uuid, _regulation_version_id uuid, _reference_date date, _measurements jsonb, _legal_review jsonb, _request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
 _version public.urban_regulation_versions%rowtype;
 _ids jsonb;
 _note text;
 _count integer;
BEGIN
 -- Accept only an explicit human review with traceable legal scope IDs.
 IF _process_id IS NULL OR _regulation_version_id IS NULL OR _reference_date IS NULL
    OR _request_id IS NULL OR _legal_review IS NULL
    OR jsonb_typeof(_legal_review)<>'object'
    OR jsonb_typeof(_legal_review->'evidence_ids') IS DISTINCT FROM 'array'
    OR coalesce((_legal_review->>'document_scope_confirmed')::boolean,false) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Conferência legal obrigatória e autenticada.'; END IF;
 _ids:=_legal_review->'evidence_ids';
 _note:=btrim(coalesce(_legal_review->>'note',''));
 _count:=jsonb_array_length(_ids);
 IF _count<1 OR _count>50 OR length(_note)<20 OR length(_note)>1200
 THEN RAISE EXCEPTION 'Fontes legais e declaração humana incompletas.'; END IF;
 SELECT * INTO _version FROM public.urban_regulation_versions
   WHERE id=_regulation_version_id AND status='active'
     AND effective_from<=_reference_date;
 IF NOT FOUND OR _version.municipality_id IS NULL
 THEN RAISE EXCEPTION 'Somente regra ativa na data pode fundamentar a conferência.'; END IF;
 IF jsonb_typeof(_version.rules)<>'array' OR jsonb_array_length(_version.rules)<1
 THEN RAISE EXCEPTION 'Norma não possui índices auditáveis.'; END IF;
 -- No duplicate, malformed, out-of-tenant, wrong zone/use, inactive or
 -- unverified scope ID may enter a signed-off advisory precheck.
 IF EXISTS (
  SELECT 1 FROM jsonb_array_elements_text(_ids) requested(value)
  WHERE requested.value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 ) OR (
   SELECT count(DISTINCT requested.value) FROM jsonb_array_elements_text(_ids) requested(value)
 )<>_count
 THEN RAISE EXCEPTION 'Identificadores de evidência inválidos ou duplicados.'; END IF;
 IF EXISTS (
  SELECT 1 FROM jsonb_array_elements_text(_ids) requested(value)
  LEFT JOIN public.urban_legal_evidence_scopes s
    ON s.id=requested.value::uuid AND s.municipality_id=_version.municipality_id
    AND upper(btrim(s.zone_code))=upper(btrim(_version.zone_code))
    AND upper(btrim(s.use_code))=upper(btrim(_version.use_code))
    AND s.effective_from<=_reference_date
    AND (s.effective_until IS NULL OR s.effective_until>=_reference_date)
    AND s.verification_method IN ('text_layer_verified','visual_double_transcription','browser_ocr_human_verified')
  LEFT JOIN public.urban_legal_evidence_catalog e
    ON e.id=s.evidence_id AND e.municipality_id=s.municipality_id
    AND e.document_sha256 ~* '^[0-9a-f]{64}$'
    AND e.page_number>0 AND length(btrim(e.document_title))>=4
    AND length(btrim(e.excerpt))>=8
  WHERE e.id IS NULL OR NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(_version.rules) m(rule)
    WHERE m.rule->>'metric'=e.metric
  )
 ) THEN RAISE EXCEPTION 'Referência legal incompatível com município, zona, uso, vigência ou índice.'; END IF;
 -- COMPLETE metric coverage; one unrelated citation does not cover all indices.
 IF EXISTS (
  SELECT 1 FROM jsonb_array_elements(_version.rules) m(rule)
  WHERE NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(_ids) requested(value)
    JOIN public.urban_legal_evidence_scopes s
      ON s.id=requested.value::uuid AND s.municipality_id=_version.municipality_id
    JOIN public.urban_legal_evidence_catalog e
      ON e.id=s.evidence_id AND e.municipality_id=s.municipality_id
    WHERE e.metric=m.rule->>'metric'
  )
 ) THEN RAISE EXCEPTION 'Há índices sem evidência legal individual vinculada.'; END IF;
 -- v5 enforces assigned analyst/director, process tenant, version consistency,
 -- idempotency, numeric measurements and original writer history.
 RETURN public.save_urban_precheck_run_v5(
   _process_id,_regulation_version_id,_reference_date,
   _measurements,_legal_review,_request_id
 );
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_auto_protocol_triage_on_document_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
BEGIN
 IF EXISTS (SELECT 1 FROM public.processes p WHERE p.id=new.process_id
            AND p.officialized_at IS NOT NULL AND p.status IN
              ('triagem'::public.process_status,'pendencia_documental'::public.process_status)) THEN
   PERFORM public.evaluate_automatic_protocol_triage_v1(new.process_id);
 END IF;
 RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_auto_protocol_triage_on_officialization_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
BEGIN
 IF old.officialized_at IS NULL AND new.officialized_at IS NOT NULL THEN
   PERFORM public.evaluate_automatic_protocol_triage_v1(new.id);
 END IF;
 RETURN NEW;
END;
$function$;

DO $guard$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.process_requirements'::regclass AND tgname='audit_supplementary_response_v1') THEN EXECUTE 'CREATE TRIGGER audit_supplementary_response_v1 AFTER UPDATE OF status ON public.process_requirements FOR EACH ROW EXECUTE FUNCTION audit_supplementary_response_v1()'; END IF; END $guard$;

DO $guard$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.process_documents'::regclass AND tgname='municipal_admin_process_readonly_v1') THEN EXECUTE 'CREATE TRIGGER municipal_admin_process_readonly_v1 BEFORE INSERT OR DELETE OR UPDATE ON public.process_documents FOR EACH ROW EXECUTE FUNCTION prevent_municipal_admin_process_write_v1()'; END IF; END $guard$;

DO $guard$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.process_movements'::regclass AND tgname='municipal_admin_process_readonly_v1') THEN EXECUTE 'CREATE TRIGGER municipal_admin_process_readonly_v1 BEFORE INSERT OR DELETE OR UPDATE ON public.process_movements FOR EACH ROW EXECUTE FUNCTION prevent_municipal_admin_process_write_v1()'; END IF; END $guard$;

DO $guard$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.process_audit_entries'::regclass AND tgname='municipal_admin_process_readonly_v1') THEN EXECUTE 'CREATE TRIGGER municipal_admin_process_readonly_v1 BEFORE INSERT OR DELETE OR UPDATE ON public.process_audit_entries FOR EACH ROW EXECUTE FUNCTION prevent_municipal_admin_process_write_v1()'; END IF; END $guard$;

DO $guard$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.interdepartmental_dispatches'::regclass AND tgname='municipal_admin_process_readonly_v1') THEN EXECUTE 'CREATE TRIGGER municipal_admin_process_readonly_v1 BEFORE INSERT OR DELETE OR UPDATE ON public.interdepartmental_dispatches FOR EACH ROW EXECUTE FUNCTION prevent_municipal_admin_process_write_v1()'; END IF; END $guard$;

DO $guard$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.payment_guides'::regclass AND tgname='municipal_admin_process_readonly_v1') THEN EXECUTE 'CREATE TRIGGER municipal_admin_process_readonly_v1 BEFORE INSERT OR DELETE OR UPDATE ON public.payment_guides FOR EACH ROW EXECUTE FUNCTION prevent_municipal_admin_process_write_v1()'; END IF; END $guard$;

DO $guard$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.process_requirements'::regclass AND tgname='municipal_admin_process_readonly_v1') THEN EXECUTE 'CREATE TRIGGER municipal_admin_process_readonly_v1 BEFORE INSERT OR DELETE OR UPDATE ON public.process_requirements FOR EACH ROW EXECUTE FUNCTION prevent_municipal_admin_process_write_v1()'; END IF; END $guard$;

DO $guard$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.process_messages'::regclass AND tgname='municipal_admin_process_readonly_v1') THEN EXECUTE 'CREATE TRIGGER municipal_admin_process_readonly_v1 BEFORE INSERT OR DELETE OR UPDATE ON public.process_messages FOR EACH ROW EXECUTE FUNCTION prevent_municipal_admin_process_write_v1()'; END IF; END $guard$;

DO $guard$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.processes'::regclass AND tgname='municipal_admin_process_readonly_v1') THEN EXECUTE 'CREATE TRIGGER municipal_admin_process_readonly_v1 BEFORE INSERT OR DELETE OR UPDATE ON public.processes FOR EACH ROW EXECUTE FUNCTION prevent_municipal_admin_process_write_v1()'; END IF; END $guard$;

DO $guard$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.process_documents'::regclass AND tgname='trg_auto_protocol_triage_document_v1') THEN EXECUTE 'CREATE TRIGGER trg_auto_protocol_triage_document_v1 AFTER INSERT OR UPDATE OF file_path, file_size_bytes, is_valid, title ON public.process_documents FOR EACH ROW EXECUTE FUNCTION trg_auto_protocol_triage_on_document_v1()'; END IF; END $guard$;

DO $guard$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.processes'::regclass AND tgname='trg_auto_protocol_triage_officialized_v1') THEN EXECUTE 'CREATE TRIGGER trg_auto_protocol_triage_officialized_v1 AFTER UPDATE OF officialized_at ON public.processes FOR EACH ROW EXECUTE FUNCTION trg_auto_protocol_triage_on_officialization_v1()'; END IF; END $guard$;

REVOKE ALL ON FUNCTION public.authorize_payment_guide_original_upload_v1(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.authorize_payment_guide_original_upload_v1(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.complete_supplementary_document_v1(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.complete_supplementary_document_v1(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.correct_my_paid_protocol_v1(uuid, text, _area_m2 numeric, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.correct_my_paid_protocol_v1(uuid, text, _area_m2 numeric, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.recheck_my_automatic_triage_v1(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.recheck_my_automatic_triage_v1(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.request_supplementary_document_v1(uuid, text, text, timestamp with time zone, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.request_supplementary_document_v1(uuid, text, text, timestamp with time zone, text) TO authenticated;

REVOKE ALL ON FUNCTION public.save_urban_precheck_run_v6(uuid, uuid, date, jsonb, jsonb, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.save_urban_precheck_run_v6(uuid, uuid, date, jsonb, jsonb, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.audit_supplementary_response_v1() FROM PUBLIC,authenticated;

REVOKE ALL ON FUNCTION public.evaluate_automatic_protocol_triage_v1(uuid) FROM PUBLIC,authenticated;

REVOKE ALL ON FUNCTION public.prevent_municipal_admin_process_write_v1() FROM PUBLIC,authenticated;

REVOKE ALL ON FUNCTION public.trg_auto_protocol_triage_on_document_v1() FROM PUBLIC,authenticated;

REVOKE ALL ON FUNCTION public.trg_auto_protocol_triage_on_officialization_v1() FROM PUBLIC,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
