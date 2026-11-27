-- TI: pastas administrativas canônicas, permissões pelo contexto ativo e auditoria de concessões.
BEGIN;
CREATE OR REPLACE FUNCTION public.municipal_ti_workspace_v1(m uuid,a text,payload jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p public.profiles%rowtype; d public.municipal_ti_documents%rowtype; admin boolean; support boolean; ti_member boolean; f text; can_read boolean; can_write boolean; target uuid; ext text; k text; snap jsonb; rows jsonb; off int; parent uuid; previous_grant jsonb; new_grant jsonb;
BEGIN
 SELECT * INTO p FROM public.profiles WHERE id=public.current_profile_id() AND municipality_id=m AND deleted_at IS NULL AND account_status='active' AND role IN ('prefeitura_admin','prefeitura_supervisor','analista','financeiro','fiscal','setor_intersetorial');
 IF p.id IS NULL THEN RAISE EXCEPTION 'Identidade municipal não autorizada.' USING ERRCODE='42501'; END IF;
 admin:=p.role='prefeitura_admin'; support:=public.municipal_ti_support_v1(m,p.id);
 ti_member:=coalesce(public.is_municipal_ti_department_v1(m,p.department_id),false);
 support:=support AND ti_member;
 f:=coalesce(payload->>'folder',''); off:=greatest(0,least(100000,coalesce((payload->>'offset')::int,0)));
 IF a='access' THEN RETURN jsonb_build_object('admin',admin,'support',support,'grants',(SELECT coalesce(jsonb_agg(jsonb_build_object('folder',g.folder,'can_edit',g.can_edit)),'[]') FROM public.municipal_ti_folder_grants g WHERE g.municipality_id=m AND g.profile_id=p.id AND g.active AND support)); END IF;
 IF a='grant_list' THEN
 IF NOT admin THEN RAISE EXCEPTION 'Somente administrador.' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('team',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',q.id,'name',q.full_name) ORDER BY q.full_name),'[]') FROM public.profiles q WHERE q.municipality_id=m AND public.municipal_ti_support_v1(m,q.id)), 'grants',(SELECT coalesce(jsonb_agg(to_jsonb(g)),'[]') FROM public.municipal_ti_folder_grants g WHERE g.municipality_id=m AND g.active));
 END IF;
 IF a='grant' THEN
 IF NOT admin OR f NOT IN ('servidores','organograma','historico','comunicacoes') THEN RAISE EXCEPTION 'Delegação inválida.' USING ERRCODE='42501'; END IF;
 target:=(payload->>'profileId')::uuid;
 IF NOT public.municipal_ti_support_v1(m,target) THEN RAISE EXCEPTION 'Servidor TI não autorizado.'; END IF;
 SELECT jsonb_build_object('active',g.active,'can_edit',g.can_edit) INTO previous_grant FROM public.municipal_ti_folder_grants g WHERE g.municipality_id=m AND g.profile_id=target AND g.folder=f;
 INSERT INTO public.municipal_ti_folder_grants VALUES(m,target,f,coalesce((payload->>'edit')::boolean,false) AND f<>'historico',coalesce((payload->>'active')::boolean,false),p.id,now()) ON CONFLICT(municipality_id,profile_id,folder) DO UPDATE SET can_edit=excluded.can_edit,active=excluded.active,granted_by=p.id,updated_at=now();
 SELECT jsonb_build_object('active',g.active,'can_edit',g.can_edit) INTO new_grant FROM public.municipal_ti_folder_grants g WHERE g.municipality_id=m AND g.profile_id=target AND g.folder=f;
 PERFORM public.municipal_ti_log_v1(m,'permissoes','delegacao',target::text,jsonb_build_object('folder',f,'antes',previous_grant,'depois',new_grant));RETURN jsonb_build_object('ok',true);
 END IF;
 SELECT admin OR (support AND coalesce(bool_or(g.active),false)),admin OR (support AND coalesce(bool_or(g.active AND g.can_edit),false)) INTO can_read,can_write FROM public.municipal_ti_folder_grants g WHERE g.municipality_id=m AND g.profile_id=p.id AND g.folder=f;
 IF a='list' THEN
 IF NOT can_read THEN RAISE EXCEPTION 'Pasta não autorizada.' USING ERRCODE='42501'; END IF;
 IF f='servidores' THEN SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO rows FROM (SELECT u.id,u.full_name,u.email,u.phone,u.role,u.department_id,u.account_status,dp.name AS department_name FROM public.profiles u LEFT JOIN public.departments dp ON dp.id=u.department_id AND dp.municipality_id=m WHERE u.municipality_id=m AND u.tipo='interno' AND u.deleted_at IS NULL ORDER BY u.full_name,u.id LIMIT 30 OFFSET off) q;
 ELSIF f='organograma' THEN SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO rows FROM (SELECT u.id,u.name,u.code,u.description,u.email,u.phone,u.parent_department_id,u.is_active,parent.name AS parent_name FROM public.departments u LEFT JOIN public.departments parent ON parent.id=u.parent_department_id AND parent.municipality_id=m WHERE u.municipality_id=m ORDER BY u.sort_order,u.name,u.id LIMIT 30 OFFSET off) q;
 ELSIF f='historico' THEN SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO rows FROM (SELECT id,actor_name,actor_id,actor_role,folder,action,record_id,changes,created_at FROM public.municipal_ti_history WHERE municipality_id=m ORDER BY id DESC LIMIT 30 OFFSET off) q;
 ELSE RAISE EXCEPTION 'Pasta inválida.'; END IF;
 RETURN jsonb_build_object('rows',rows,'canEdit',can_write);
 END IF;
 IF a IN ('update_contact','update_record') THEN
 IF NOT can_write OR f NOT IN ('servidores','organograma') THEN RAISE EXCEPTION 'Edição não autorizada.' USING ERRCODE='42501'; END IF;
 target:=(payload->>'id')::uuid; IF length(coalesce(payload->>'phone',''))>40 THEN RAISE EXCEPTION 'Telefone inválido.'; END IF;
 IF f='servidores' THEN
  IF a='update_record' AND (length(btrim(coalesce(payload->>'fullName',''))) NOT BETWEEN 5 AND 160) THEN RAISE EXCEPTION 'Nome completo inválido.'; END IF;
  UPDATE public.profiles SET phone=nullif(btrim(payload->>'phone'),''),full_name=CASE WHEN a='update_record' THEN btrim(payload->>'fullName') ELSE full_name END
  WHERE id=target AND municipality_id=m AND tipo='interno' AND deleted_at IS NULL AND (admin OR role NOT IN ('prefeitura_admin','prefeitura_supervisor','master_admin','master_ops','admin_master'));
 ELSE
  IF length(coalesce(payload->>'description',''))>2000 OR length(coalesce(payload->>'email',''))>254 OR (nullif(btrim(payload->>'email'),'') IS NOT NULL AND btrim(payload->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') THEN RAISE EXCEPTION 'Contato ou descrição da unidade inválidos.'; END IF;
  UPDATE public.departments SET phone=nullif(btrim(payload->>'phone'),''),description=CASE WHEN a='update_record' THEN nullif(btrim(payload->>'description'),'') ELSE description END,email=CASE WHEN a='update_record' THEN nullif(btrim(payload->>'email'),'') ELSE email END
  WHERE id=target AND municipality_id=m AND is_active;
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'Registro não autorizado ou inexistente.'; END IF;
 RETURN jsonb_build_object('ok',true);
 END IF;
 IF ti_member AND NOT admin AND a IN ('doc_list','doc_detail','recipients','doc_create','doc_sign','doc_receive','doc_deliver') AND (f<>'comunicacoes' OR NOT can_read) THEN RAISE EXCEPTION 'Pasta de comunicações não autorizada.' USING ERRCODE='42501'; END IF;
 IF ti_member AND NOT admin AND a IN ('recipients','doc_create','doc_sign','doc_receive','doc_deliver') AND NOT can_write THEN RAISE EXCEPTION 'Pasta de comunicações somente para consulta.' USING ERRCODE='42501'; END IF;
 IF a='doc_list' THEN
 SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO rows FROM (SELECT id,number,kind,subject,status,author_name,author_id,recipient_id,external_recipient,created_at FROM public.municipal_ti_documents WHERE municipality_id=m AND (author_id=p.id OR (recipient_id=p.id AND status<>'draft')) ORDER BY created_at DESC,id LIMIT 30 OFFSET off) q;
 RETURN jsonb_build_object('rows',rows,'compose',NOT ti_member OR admin OR (f='comunicacoes' AND can_write));
 END IF;
 IF a='recipients' THEN
 SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO rows FROM (SELECT id,full_name,department_id FROM public.profiles WHERE municipality_id=m AND tipo='interno' AND deleted_at IS NULL AND account_status='active' AND role IN ('prefeitura_admin','prefeitura_supervisor','analista','financeiro','fiscal','setor_intersetorial') AND id<>p.id AND full_name ILIKE '%'||left(coalesce(payload->>'search',''),100)||'%' ORDER BY full_name LIMIT 30) q;
 RETURN jsonb_build_object('rows',rows);
 END IF;
 IF a='doc_create' THEN
 IF ti_member AND NOT admin AND (f<>'comunicacoes' OR NOT can_write) THEN RAISE EXCEPTION 'Redação não autorizada.' USING ERRCODE='42501'; END IF;
 k:=payload->>'kind';target:=nullif(payload->>'recipientId','')::uuid;ext:=nullif(btrim(payload->>'externalRecipient'),'');parent:=nullif(payload->>'parentId','')::uuid;
 IF (target IS NULL)=(ext IS NULL) OR length(coalesce(ext,''))>300 OR (ext IS NOT NULL AND k<>'oficio') THEN RAISE EXCEPTION 'Informe destinatário interno ou externo (ofício).'; END IF;
 IF target IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=target AND id<>p.id AND municipality_id=m AND tipo='interno' AND deleted_at IS NULL AND account_status='active' AND role IN ('prefeitura_admin','prefeitura_supervisor','analista','financeiro','fiscal','setor_intersetorial')) THEN RAISE EXCEPTION 'Destinatário inválido.'; END IF;
 IF parent IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.municipal_ti_documents WHERE id=parent AND municipality_id=m AND status<>'draft' AND (author_id=p.id OR recipient_id=p.id)) THEN RAISE EXCEPTION 'Documento de referência fora do escopo.'; END IF;
 INSERT INTO public.municipal_ti_documents(municipality_id,author_id,author_name,kind,subject,body,recipient_id,external_recipient,parent_id) VALUES(m,p.id,coalesce(p.full_name,''),k,btrim(payload->>'subject'),btrim(payload->>'body'),target,ext,parent) RETURNING * INTO d;
 PERFORM public.municipal_ti_log_v1(m,'comunicacoes','rascunho',d.id::text,jsonb_build_object('kind',k)); RETURN jsonb_build_object('document',to_jsonb(d));
 END IF;
 SELECT * INTO d FROM public.municipal_ti_documents WHERE id=(payload->>'id')::uuid AND municipality_id=m AND (author_id=p.id OR (recipient_id=p.id AND status<>'draft')) FOR UPDATE;
 IF d.id IS NULL THEN RAISE EXCEPTION 'Documento fora do escopo.' USING ERRCODE='42501'; END IF;
 IF a='doc_detail' THEN RETURN jsonb_build_object('document',to_jsonb(d),'events',(SELECT coalesce(jsonb_agg(jsonb_build_object('actor_name',h.actor_name,'action',h.action,'created_at',h.created_at) ORDER BY h.id),'[]') FROM public.municipal_ti_history h WHERE h.municipality_id=m AND h.folder='comunicacoes' AND h.record_id=d.id::text)); END IF;
 IF a='doc_sign' AND d.author_id=p.id AND d.status='draft' AND payload->>'consent'='true' THEN
 IF ti_member AND NOT admin AND (f<>'comunicacoes' OR NOT can_write) THEN RAISE EXCEPTION 'Assinatura não autorizada.' USING ERRCODE='42501'; END IF;
 snap:=jsonb_build_object('id',d.id,'number',d.number,'municipality',m,'kind',d.kind,'author',p.id,'authorName',d.author_name,'subject',d.subject,'body',d.body,'recipient',d.recipient_id,'externalRecipient',d.external_recipient,'parent',d.parent_id,'signedAt',clock_timestamp());
 UPDATE public.municipal_ti_documents SET status=CASE WHEN d.recipient_id IS NULL THEN 'issued' ELSE 'sent' END,signed_snapshot=snap,signed_at=(snap->>'signedAt')::timestamptz,signature_sha256=encode(sha256(convert_to(snap::text,'UTF8')),'hex') WHERE id=d.id RETURNING * INTO d;
 ELSIF a='doc_receive' AND d.recipient_id=p.id AND d.status='sent' THEN UPDATE public.municipal_ti_documents SET status='received' WHERE id=d.id RETURNING * INTO d;
 ELSIF a='doc_deliver' AND (admin OR NOT ti_member OR (f='comunicacoes' AND can_write)) AND d.author_id=p.id AND d.status='issued' AND length(btrim(coalesce(payload->>'reference',''))) BETWEEN 5 AND 500 THEN UPDATE public.municipal_ti_documents SET status='delivered',delivery_reference=btrim(payload->>'reference') WHERE id=d.id RETURNING * INTO d;
 ELSE RAISE EXCEPTION 'Ação documental não autorizada ou etapa inválida.' USING ERRCODE='42501'; END IF;
 PERFORM public.municipal_ti_log_v1(m,'comunicacoes',a,d.id::text,jsonb_build_object('status',d.status));RETURN jsonb_build_object('document',to_jsonb(d));
END $$;
REVOKE ALL ON FUNCTION public.municipal_ti_workspace_v1(uuid,text,jsonb) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.municipal_ti_workspace_v1(uuid,text,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.municipal_it_command_v1(_municipality_id uuid,_action text,_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,neon_auth SET row_security TO off AS $function$
DECLARE
 actor public.profiles%rowtype; target public.profiles%rowtype; r public.municipal_it_requests%rowtype;
 unit public.departments%rowtype; root_id uuid; request_id uuid; target_id uuid;
 is_admin boolean; is_support boolean; request_read boolean; request_write boolean; org_read boolean; comm_read boolean; is_authority boolean; authority_unit text; allowed_unit boolean;
 event_name text; note text; normalized_email text; employee_name text; job text; path_text text;
 auth_id text; auth_name text; auth_banned boolean; role_id_value uuid; new_id uuid; item record;
 page_offset integer; filter_status text; result jsonb; snapshot jsonb;
BEGIN
 SELECT * INTO actor FROM public.profiles WHERE id=public.current_profile_id() AND deleted_at IS NULL AND account_status='active' AND municipality_id=_municipality_id;
 IF actor.id IS NULL THEN RAISE EXCEPTION 'Acesso TI fora da Prefeitura autenticada.' USING ERRCODE='42501'; END IF;
 is_admin:=actor.role='prefeitura_admin';
 SELECT d.id INTO root_id FROM public.departments d WHERE d.municipality_id=_municipality_id AND d.is_active AND d.code='TI' AND d.name='Tecnologia da Informação' LIMIT 1;
 is_support:=actor.role IN ('analista','setor_intersetorial','financeiro','fiscal') AND EXISTS(
  WITH RECURSIVE tree AS (SELECT id FROM public.departments WHERE id=root_id UNION SELECT d.id FROM public.departments d JOIN tree t ON d.parent_department_id=t.id WHERE d.municipality_id=_municipality_id AND d.is_active)
  SELECT 1 FROM public.municipal_it_delegations g WHERE g.municipality_id=_municipality_id AND g.profile_id=actor.id AND g.active
   AND actor.department_id IN(SELECT id FROM tree));
 SELECT d.name INTO authority_unit FROM public.municipal_authority_designations a JOIN public.departments d ON d.id=a.department_id AND d.municipality_id=_municipality_id AND d.is_active
 WHERE a.municipality_id=_municipality_id AND a.profile_id=actor.id AND a.is_active AND a.authority_kind IN ('diretoria','secretaria') AND d.unit_type=a.authority_kind ORDER BY a.is_primary DESC,a.id LIMIT 1;
 is_authority:=actor.role='prefeitura_supervisor' AND authority_unit IS NOT NULL;
 IF _action='access' THEN RETURN jsonb_build_object('allowed',is_admin OR is_support OR is_authority); END IF;
 IF NOT (is_admin OR is_support OR is_authority) THEN RAISE EXCEPTION 'TI: acesso não concedido pelo administrador ou autoridade não designada.' USING ERRCODE='42501'; END IF;
 request_read:=is_admin OR (is_support AND EXISTS(SELECT 1 FROM public.municipal_ti_folder_grants g WHERE g.municipality_id=_municipality_id AND g.profile_id=actor.id AND g.folder='servidores' AND g.active));
 request_write:=is_admin OR (is_support AND EXISTS(SELECT 1 FROM public.municipal_ti_folder_grants g WHERE g.municipality_id=_municipality_id AND g.profile_id=actor.id AND g.folder='servidores' AND g.active AND g.can_edit));
 org_read:=is_admin OR (is_support AND EXISTS(SELECT 1 FROM public.municipal_ti_folder_grants g WHERE g.municipality_id=_municipality_id AND g.profile_id=actor.id AND g.folder='organograma' AND g.active));
 comm_read:=is_admin OR is_authority OR (is_support AND EXISTS(SELECT 1 FROM public.municipal_ti_folder_grants g WHERE g.municipality_id=_municipality_id AND g.profile_id=actor.id AND g.folder='comunicacoes' AND g.active));
 IF _action='list' THEN
  page_offset:=greatest(0,least(100000,coalesce((_payload->>'offset')::integer,0)));
  filter_status:=coalesce(_payload->>'status','');
  RETURN jsonb_build_object('admin',is_admin,'support',is_support,'requestRead',request_read,'requestEdit',request_write,'orgRead',org_read,'communicationsRead',comm_read,'authority',is_authority,'initialized',root_id IS NOT NULL,
   'departments',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'code',d.code,'parent',d.parent_department_id,'kind',d.unit_type) ORDER BY d.sort_order,d.name),'[]'::jsonb) FROM public.departments d WHERE d.municipality_id=_municipality_id AND d.is_active AND (is_admin OR is_authority OR org_read OR request_read)),
   'team',CASE WHEN org_read THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'department',d.name,'enabled',coalesce(g.active,false)) ORDER BY p.full_name),'[]'::jsonb)
     FROM public.profiles p LEFT JOIN public.departments d ON d.id=p.department_id AND d.municipality_id=_municipality_id LEFT JOIN public.municipal_it_delegations g ON g.profile_id=p.id AND g.municipality_id=_municipality_id
     WHERE p.municipality_id=_municipality_id AND p.deleted_at IS NULL AND p.account_status='active' AND p.role IN ('analista','setor_intersetorial','financeiro','fiscal')
     AND (g.profile_id IS NOT NULL OR EXISTS(WITH RECURSIVE tree AS(SELECT id FROM public.departments WHERE id=root_id UNION SELECT x.id FROM public.departments x JOIN tree t ON x.parent_department_id=t.id WHERE x.municipality_id=_municipality_id AND x.is_active) SELECT 1 FROM tree WHERE id=p.department_id OR EXISTS(SELECT 1 FROM public.municipal_staff_assignments a WHERE a.profile_id=p.id AND a.municipality_id=_municipality_id AND a.department_id=tree.id AND a.is_active)))) ELSE '[]'::jsonb END,
   'total',(SELECT count(*) FROM public.municipal_it_requests x WHERE x.municipality_id=_municipality_id AND (x.requester_id=actor.id OR (request_read AND x.status<>'draft')) AND (filter_status='' OR x.status=filter_status)),
   'counts',(SELECT coalesce(jsonb_object_agg(q.status,q.n),'{}'::jsonb) FROM (SELECT x.status,count(*) n FROM public.municipal_it_requests x WHERE x.municipality_id=_municipality_id AND (x.requester_id=actor.id OR (request_read AND x.status<>'draft')) GROUP BY x.status)q),
   'requests',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC,q.id),'[]'::jsonb) FROM (SELECT x.* FROM public.municipal_it_requests x WHERE x.municipality_id=_municipality_id AND (x.requester_id=actor.id OR (request_read AND x.status<>'draft')) AND (filter_status='' OR x.status=filter_status) ORDER BY x.created_at DESC,x.id LIMIT 30 OFFSET page_offset)q));
 END IF;
 IF _action='initialize' THEN
  IF NOT is_admin THEN RAISE EXCEPTION 'Somente o administrador pode criar o organograma TI.' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('sigapro-ti:'||_municipality_id::text,0));
  IF root_id IS NULL THEN
   IF EXISTS(SELECT 1 FROM public.departments WHERE municipality_id=_municipality_id AND (code='TI' OR name='Tecnologia da Informação')) THEN RAISE EXCEPTION 'Existe unidade TI conflitante. Confira o organograma municipal.'; END IF;
   INSERT INTO public.departments(municipality_id,code,name,unit_type,sort_order) VALUES(_municipality_id,'TI','Tecnologia da Informação','departamento',90) RETURNING id INTO root_id;
  END IF;
  FOR item IN SELECT * FROM (VALUES('TI-SIS','Sistemas e Suporte',91),('TI-INF','Infraestrutura e Redes',92),('TI-ACE','Administração de Usuários e Permissões',94)) v(code,name,ord) LOOP
   IF NOT EXISTS(SELECT 1 FROM public.departments WHERE municipality_id=_municipality_id AND parent_department_id=root_id AND code=item.code AND name=item.name AND is_active) THEN
    IF EXISTS(SELECT 1 FROM public.departments WHERE municipality_id=_municipality_id AND (code=item.code OR name=item.name)) THEN RAISE EXCEPTION 'Unidade TI conflitante: %',item.name; END IF;
    INSERT INTO public.departments(municipality_id,parent_department_id,code,name,unit_type,sort_order) VALUES(_municipality_id,root_id,item.code,item.name,'setor',item.ord);
   END IF;
  END LOOP;
  RETURN jsonb_build_object('ok',true,'departmentId',root_id);
 END IF;
 IF _action='delegate' THEN
  IF NOT is_admin THEN RAISE EXCEPTION 'Somente o administrador pode delegar acesso TI.' USING ERRCODE='42501'; END IF;
  target_id:=(_payload->>'profileId')::uuid;
  SELECT * INTO target FROM public.profiles WHERE id=target_id AND municipality_id=_municipality_id AND deleted_at IS NULL AND account_status='active' AND role IN ('analista','setor_intersetorial','financeiro','fiscal') FOR UPDATE;
  IF target.id IS NULL OR target.id=actor.id THEN RAISE EXCEPTION 'Servidor interno ativo não encontrado.'; END IF;
  IF (_payload->>'enabled')::boolean IS TRUE AND NOT EXISTS(
   WITH RECURSIVE tree AS (SELECT id FROM public.departments WHERE id=root_id UNION SELECT d.id FROM public.departments d JOIN tree t ON d.parent_department_id=t.id WHERE d.municipality_id=_municipality_id AND d.is_active)
   SELECT 1 FROM tree WHERE id=target.department_id OR EXISTS(SELECT 1 FROM public.municipal_staff_assignments a WHERE a.profile_id=target.id AND a.municipality_id=_municipality_id AND a.department_id=tree.id AND a.is_active)
  ) THEN RAISE EXCEPTION 'Vincule o servidor a uma unidade TI antes de delegar.'; END IF;
  INSERT INTO public.municipal_it_delegations(municipality_id,profile_id,granted_by,active) VALUES(_municipality_id,target.id,actor.id,coalesce((_payload->>'enabled')::boolean,false))
  ON CONFLICT(municipality_id,profile_id) DO UPDATE SET active=excluded.active,granted_by=actor.id,updated_at=now();
  INSERT INTO public.municipal_it_events(municipality_id,actor_id,actor_name,event,detail) VALUES(_municipality_id,actor.id,coalesce(actor.full_name,''),CASE WHEN (_payload->>'enabled')::boolean THEN 'delegate' ELSE 'revoke' END,target.id::text);
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF _action='create' THEN
  IF NOT is_authority THEN RAISE EXCEPTION 'Somente diretor ou secretário designado pode solicitar servidor.' USING ERRCODE='42501'; END IF;
  SELECT * INTO unit FROM public.departments WHERE id=(_payload->>'departmentId')::uuid AND municipality_id=_municipality_id AND is_active;
  IF unit.id IS NULL THEN RAISE EXCEPTION 'Lotação inexistente ou inativa.'; END IF;
  WITH RECURSIVE parents AS (SELECT d.id,d.parent_department_id,ARRAY[d.id] seen,coalesce(d.code||' — ','')||d.name AS path FROM public.departments d WHERE d.id=unit.id UNION ALL SELECT d.id,d.parent_department_id,p.seen||d.id,coalesce(d.code||' — ','')||d.name||' / '||p.path FROM public.departments d JOIN parents p ON d.id=p.parent_department_id WHERE d.municipality_id=_municipality_id AND d.is_active AND NOT d.id=ANY(p.seen))
  SELECT EXISTS(SELECT 1 FROM parents p JOIN public.municipal_authority_designations a ON a.department_id=p.id AND a.municipality_id=_municipality_id AND a.profile_id=actor.id AND a.is_active AND a.authority_kind IN ('diretoria','secretaria')), (SELECT p.path FROM parents p ORDER BY cardinality(p.seen) DESC LIMIT 1) INTO allowed_unit,path_text;
  IF NOT allowed_unit THEN RAISE EXCEPTION 'A lotação precisa pertencer ao organograma da autoridade solicitante.' USING ERRCODE='42501'; END IF;
  employee_name:=btrim(coalesce(_payload->>'fullName','')); normalized_email:=lower(btrim(coalesce(_payload->>'email','')));job:=btrim(coalesce(_payload->>'title',''));note:=btrim(coalesce(_payload->>'justification',''));
  IF length(employee_name) NOT BETWEEN 5 AND 160 OR employee_name !~ '[[:space:]]' OR length(normalized_email)>254 OR normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR length(job) NOT BETWEEN 3 AND 120 OR length(note) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION 'Informe nome completo, e-mail, cargo e justificativa.'; END IF;
  IF EXISTS(SELECT 1 FROM public.profiles WHERE lower(btrim(email))=normalized_email AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Já existe um perfil com esse e-mail. Solicite revisão de acesso, não novo cadastro.'; END IF;
  INSERT INTO public.municipal_it_requests(municipality_id,requester_id,requester_name,requester_unit,full_name,email,department_id,department_path,position_title,role_code,justification)
  VALUES(_municipality_id,actor.id,coalesce(actor.full_name,''),authority_unit,employee_name,normalized_email,unit.id,path_text,job,public._staff_role_for_department_v1(unit.name),note) RETURNING * INTO r;
  event_name:='created';note:='';
 ELSE
  request_id:=(_payload->>'requestId')::uuid;
  SELECT * INTO r FROM public.municipal_it_requests WHERE id=request_id AND municipality_id=_municipality_id FOR UPDATE;
  IF r.id IS NULL OR NOT(r.requester_id=actor.id OR (request_read AND r.status<>'draft')) THEN RAISE EXCEPTION 'Memorando fora do escopo.' USING ERRCODE='42501'; END IF;
  IF _action='detail' THEN
   RETURN jsonb_build_object('request',to_jsonb(r),'events',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.id),'[]'::jsonb) FROM public.municipal_it_events e WHERE e.municipality_id=_municipality_id AND e.request_id=r.id));
  ELSIF _action='sign' THEN
   IF NOT is_authority OR r.requester_id<>actor.id OR r.status<>'draft' OR _payload->>'consent' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Somente o solicitante pode assinar o próprio memorando.' USING ERRCODE='42501'; END IF;
   IF NOT EXISTS(WITH RECURSIVE parents AS(SELECT id,parent_department_id FROM public.departments WHERE id=r.department_id AND municipality_id=_municipality_id AND is_active UNION SELECT d.id,d.parent_department_id FROM public.departments d JOIN parents p ON d.id=p.parent_department_id WHERE d.municipality_id=_municipality_id AND d.is_active) SELECT 1 FROM parents p JOIN public.municipal_authority_designations a ON a.department_id=p.id AND a.municipality_id=_municipality_id AND a.profile_id=actor.id AND a.is_active AND a.authority_kind IN ('diretoria','secretaria')) THEN RAISE EXCEPTION 'Competência sobre a lotação não está mais ativa.'; END IF;
   snapshot:=jsonb_build_object('id',r.id,'number',r.number,'municipality',r.municipality_id,'requester',actor.id,'name',r.requester_name,'unit',r.requester_unit,'employee',r.full_name,'email',r.email,'department',r.department_id,'path',r.department_path,'title',r.position_title,'role',r.role_code,'justification',r.justification,'signedAt',clock_timestamp());
   UPDATE public.municipal_it_requests SET status='signed',signed_snapshot=snapshot,signed_at=(snapshot->>'signedAt')::timestamptz,signature_sha256=encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'),updated_at=now() WHERE id=r.id RETURNING * INTO r;
   event_name:='signed';note:='Assinatura eletrônica interna autenticada; não é certificado ICP-Brasil.';
  ELSIF _action IN ('review','approve','reject') THEN
   IF NOT request_write OR r.requester_id=actor.id OR r.signed_at IS NULL OR r.signature_sha256 IS DISTINCT FROM encode(sha256(convert_to(r.signed_snapshot::text,'UTF8')),'hex') THEN RAISE EXCEPTION 'Análise exige memorando assinado e equipe autorizada.' USING ERRCODE='42501'; END IF;
   IF (_action='review' AND r.status<>'signed') OR (_action IN ('approve','reject') AND r.status<>'review') THEN RAISE EXCEPTION 'Etapa inválida.'; END IF;
   note:=btrim(coalesce(_payload->>'note',''));
   IF length(note)>1000 OR (_action='reject' AND length(note)<5) THEN RAISE EXCEPTION 'Informe o motivo da devolução.'; END IF;
   UPDATE public.municipal_it_requests SET status=CASE _action WHEN 'review' THEN 'review' WHEN 'approve' THEN 'approved' ELSE 'rejected' END,reviewed_by=actor.id,updated_at=now() WHERE id=r.id RETURNING * INTO r;
   event_name:=_action;
  ELSIF _action='provision' THEN
   IF NOT request_write OR r.requester_id=actor.id OR r.status NOT IN ('approved','completed') OR r.signed_at IS NULL OR r.signature_sha256 IS DISTINCT FROM encode(sha256(convert_to(r.signed_snapshot::text,'UTF8')),'hex') THEN RAISE EXCEPTION 'Cadastro exige memorando aprovado e íntegro.' USING ERRCODE='42501'; END IF;
   IF r.status='completed' THEN RETURN jsonb_build_object('ready',true,'profileId',r.completed_profile_id); END IF;
   SELECT * INTO unit FROM public.departments WHERE id=r.department_id AND municipality_id=_municipality_id AND is_active;
   IF unit.id IS NULL OR r.role_code NOT IN ('analista','financeiro','fiscal','setor_intersetorial') OR r.role_code IS DISTINCT FROM public._staff_role_for_department_v1(unit.name) THEN RAISE EXCEPTION 'Lotação ou perfil alterados; solicite novo memorando.'; END IF;
   IF r.signed_snapshot->>'employee' IS DISTINCT FROM r.full_name OR r.signed_snapshot->>'email' IS DISTINCT FROM r.email OR r.signed_snapshot->>'department' IS DISTINCT FROM r.department_id::text OR r.signed_snapshot->>'role' IS DISTINCT FROM r.role_code OR r.signed_snapshot->>'title' IS DISTINCT FROM r.position_title THEN RAISE EXCEPTION 'Dados divergentes do memorando assinado.'; END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended('sigapro-ti-email:'||r.email,0));
   IF EXISTS(SELECT 1 FROM public.profiles WHERE lower(btrim(email))=r.email) THEN RAISE EXCEPTION 'Perfil já existente; encaminhe ao administrador para revisão, sem alterar conta.'; END IF;
   PERFORM public.assert_municipality_entitlement_v1(_municipality_id,'users',1);
   SELECT u.id::text,u.name,u.banned INTO auth_id,auth_name,auth_banned FROM neon_auth."user" u WHERE lower(btrim(u.email))=r.email LIMIT 1;
   IF auth_id IS NULL THEN RETURN jsonb_build_object('ready',false,'reason','auth_missing','email',r.email,'name',r.full_name); END IF;
   IF coalesce(auth_banned,false) OR lower(btrim(auth_name)) IS DISTINCT FROM lower(btrim(r.full_name)) OR EXISTS(SELECT 1 FROM public.profile_auth_identities WHERE provider='neon' AND provider_user_id=auth_id) THEN RAISE EXCEPTION 'Identidade de autenticação existente exige revisão do administrador.'; END IF;
   SELECT id INTO role_id_value FROM public.roles WHERE code::text=r.role_code;
   IF role_id_value IS NULL OR NOT EXISTS(SELECT 1 FROM public.tenants WHERE id=_municipality_id) THEN RAISE EXCEPTION 'Cadastro municipal não disponível.'; END IF;
   INSERT INTO public.profiles(full_name,email,tipo,role,account_status,municipality_id,department_id) VALUES(r.full_name,r.email,'interno',r.role_code,'active',_municipality_id,unit.id) RETURNING id INTO new_id;
   INSERT INTO public.profile_auth_identities(profile_id,provider,provider_user_id,is_active,last_used_at) VALUES(new_id,'neon',auth_id,true,now());
   INSERT INTO public.tenant_memberships(tenant_id,profile_id,role_id,department,position_title,queue_name,level_name,is_active) VALUES(_municipality_id,new_id,role_id_value,unit.name,r.position_title,'Operacao municipal','Nivel 1',true);
   INSERT INTO public.municipal_staff_assignments(municipality_id,profile_id,department_id,role_code,assigned_by) VALUES(_municipality_id,new_id,unit.id,r.role_code,actor.id);
   UPDATE public.municipal_it_requests SET status='completed',completed_profile_id=new_id,updated_at=now() WHERE id=r.id RETURNING * INTO r;
   INSERT INTO public.municipal_it_events(municipality_id,request_id,actor_id,actor_name,event,detail) VALUES(_municipality_id,r.id,actor.id,coalesce(actor.full_name,''),'completed',new_id::text);
   RETURN jsonb_build_object('ready',true,'profileId',new_id);
  ELSE RAISE EXCEPTION 'Ação TI inválida.';
  END IF;
 END IF;
 INSERT INTO public.municipal_it_events(municipality_id,request_id,actor_id,actor_name,event,detail) VALUES(_municipality_id,r.id,actor.id,coalesce(actor.full_name,''),event_name,coalesce(note,''));
 RETURN jsonb_build_object('ok',true,'request',to_jsonb(r));
END $function$;
COMMIT;
