-- Permissões individuais, comunicações e auditoria de TI. Aplicar após o isolamento operacional.
BEGIN;
CREATE TABLE public.municipal_ti_folder_grants(
 municipality_id uuid NOT NULL, profile_id uuid NOT NULL REFERENCES public.profiles(id),
 folder text NOT NULL CHECK(folder IN ('servidores','organograma','historico','comunicacoes')),
 can_edit boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true,
 granted_by uuid NOT NULL REFERENCES public.profiles(id), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(municipality_id,profile_id,folder));
CREATE TABLE public.municipal_ti_history(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, municipality_id uuid NOT NULL,
 actor_id uuid, actor_name text NOT NULL, actor_role text, folder text NOT NULL, action text NOT NULL,
 record_id text NOT NULL, changes jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE INDEX municipal_ti_history_scope_idx ON public.municipal_ti_history(municipality_id,id DESC);
CREATE TABLE public.municipal_ti_documents(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), number bigint GENERATED ALWAYS AS IDENTITY,
 municipality_id uuid NOT NULL, author_id uuid NOT NULL REFERENCES public.profiles(id), author_name text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('memorando','oficio','despacho')),
 subject text NOT NULL CHECK(length(subject) BETWEEN 3 AND 200), body text NOT NULL CHECK(length(body) BETWEEN 5 AND 15000),
 recipient_id uuid REFERENCES public.profiles(id), external_recipient text, parent_id uuid REFERENCES public.municipal_ti_documents(id),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','received','issued','delivered')),
 signed_at timestamptz, signed_snapshot jsonb, signature_sha256 text, delivery_reference text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((recipient_id IS NULL) <> (external_recipient IS NULL)),CHECK(kind='oficio' OR recipient_id IS NOT NULL));
CREATE INDEX municipal_ti_documents_scope_idx ON public.municipal_ti_documents(municipality_id,created_at DESC);
ALTER TABLE public.municipal_ti_folder_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.municipal_ti_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.municipal_ti_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.municipal_ti_folder_grants,public.municipal_ti_history,public.municipal_ti_documents FROM PUBLIC,anonymous,authenticated;
CREATE FUNCTION public.municipal_ti_log_v1(m uuid,f text,a text,r text,c jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p public.profiles%rowtype;
BEGIN
 SELECT * INTO p FROM public.profiles WHERE id=public.current_profile_id();
 INSERT INTO public.municipal_ti_history(municipality_id,actor_id,actor_name,actor_role,folder,action,record_id,changes)
 VALUES(m,p.id,coalesce(p.full_name,'Sistema / identidade não vinculada'),p.role,f,a,r,coalesce(c,'{}'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.municipal_ti_log_v1(uuid,text,text,text,jsonb) FROM PUBLIC,anonymous,authenticated;
CREATE FUNCTION public.municipal_ti_audit_trigger_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o jsonb:='{}'; n jsonb:='{}'; x jsonb; fields text[]; delta jsonb; f text; m uuid;
BEGIN
 IF TG_OP<>'INSERT' THEN o:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN n:=to_jsonb(NEW); END IF;
 x:=CASE WHEN TG_OP='DELETE' THEN o ELSE n END;
 m:=(x->>'municipality_id')::uuid;
 IF m IS NULL OR (TG_TABLE_NAME='profiles' AND coalesce(x->>'tipo','')<>'interno') THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
 IF TG_OP='UPDATE' AND o->>'municipality_id' IS DISTINCT FROM n->>'municipality_id' THEN o:='{}'; END IF;
 IF TG_TABLE_NAME='profiles' THEN f:='servidores'; fields:=ARRAY['full_name','email','phone','role','account_status','department_id','deleted_at'];
 ELSIF TG_TABLE_NAME='departments' THEN f:='organograma'; fields:=ARRAY['name','code','description','email','phone','parent_department_id','unit_type','is_active'];
 ELSE f:='servidores'; fields:=ARRAY['profile_id','department_id','role_code','is_active']; END IF;
 SELECT coalesce(jsonb_object_agg(k,jsonb_build_object('antes',o->k,'depois',n->k)),'{}'::jsonb) INTO delta FROM unnest(fields) k WHERE o->k IS DISTINCT FROM n->k;
 IF delta<>'{}'::jsonb THEN PERFORM public.municipal_ti_log_v1(m,f,lower(TG_OP),x->>'id',delta); END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION public.municipal_ti_audit_trigger_v1() FROM PUBLIC,anonymous,authenticated;
CREATE TRIGGER municipal_ti_audit_profiles AFTER INSERT OR UPDATE OR DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.municipal_ti_audit_trigger_v1();
CREATE TRIGGER municipal_ti_audit_departments AFTER INSERT OR UPDATE OR DELETE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.municipal_ti_audit_trigger_v1();
CREATE TRIGGER municipal_ti_audit_assignments AFTER INSERT OR UPDATE OR DELETE ON public.municipal_staff_assignments FOR EACH ROW EXECUTE FUNCTION public.municipal_ti_audit_trigger_v1();
CREATE FUNCTION public.municipal_ti_support_v1(m uuid,pid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p JOIN public.municipal_it_delegations g ON g.municipality_id=m AND g.profile_id=p.id AND g.active
 WHERE p.id=pid AND p.municipality_id=m AND p.account_status='active' AND p.deleted_at IS NULL AND p.role IN ('analista','financeiro','fiscal','setor_intersetorial')
 AND (public.is_municipal_ti_department_v1(m,p.department_id) OR EXISTS(SELECT 1 FROM public.municipal_staff_assignments s WHERE s.municipality_id=m AND s.profile_id=p.id AND s.is_active AND public.is_municipal_ti_department_v1(m,s.department_id))));
$$;
REVOKE ALL ON FUNCTION public.municipal_ti_support_v1(uuid,uuid) FROM PUBLIC,anonymous,authenticated;
CREATE FUNCTION public.municipal_ti_workspace_v1(m uuid,a text,payload jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p public.profiles%rowtype; d public.municipal_ti_documents%rowtype; admin boolean; support boolean; ti_member boolean; f text; can_read boolean; can_write boolean; target uuid; ext text; k text; snap jsonb; rows jsonb; off int; parent uuid;
BEGIN
 SELECT * INTO p FROM public.profiles WHERE id=public.current_profile_id() AND municipality_id=m AND deleted_at IS NULL AND account_status='active' AND role IN ('prefeitura_admin','prefeitura_supervisor','analista','financeiro','fiscal','setor_intersetorial');
 IF p.id IS NULL THEN RAISE EXCEPTION 'Identidade municipal não autorizada.' USING ERRCODE='42501'; END IF;
 admin:=p.role='prefeitura_admin'; support:=public.municipal_ti_support_v1(m,p.id);
 ti_member:=coalesce(public.is_municipal_ti_department_v1(m,p.department_id),false) OR EXISTS(SELECT 1 FROM public.municipal_staff_assignments s WHERE s.municipality_id=m AND s.profile_id=p.id AND s.is_active AND public.is_municipal_ti_department_v1(m,s.department_id));
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
 INSERT INTO public.municipal_ti_folder_grants VALUES(m,target,f,coalesce((payload->>'edit')::boolean,false) AND f<>'historico',coalesce((payload->>'active')::boolean,false),p.id,now()) ON CONFLICT(municipality_id,profile_id,folder) DO UPDATE SET can_edit=excluded.can_edit,active=excluded.active,granted_by=p.id,updated_at=now();
 PERFORM public.municipal_ti_log_v1(m,'permissoes','delegacao',target::text,jsonb_build_object('folder',f,'active',payload->'active','edit',payload->'edit'));RETURN jsonb_build_object('ok',true);
 END IF;
 SELECT admin OR (support AND coalesce(bool_or(g.active),false)),admin OR (support AND coalesce(bool_or(g.active AND g.can_edit),false)) INTO can_read,can_write FROM public.municipal_ti_folder_grants g WHERE g.municipality_id=m AND g.profile_id=p.id AND g.folder=f;
 IF a='list' THEN
 IF NOT can_read THEN RAISE EXCEPTION 'Pasta não autorizada.' USING ERRCODE='42501'; END IF;
 IF f='servidores' THEN SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO rows FROM (SELECT id,full_name,email,phone,role,department_id,account_status FROM public.profiles WHERE municipality_id=m AND tipo='interno' AND deleted_at IS NULL ORDER BY full_name,id LIMIT 30 OFFSET off) q;
 ELSIF f='organograma' THEN SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO rows FROM (SELECT id,name,code,description,email,phone,parent_department_id,is_active FROM public.departments WHERE municipality_id=m ORDER BY sort_order,name,id LIMIT 30 OFFSET off) q;
 ELSIF f='historico' THEN SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO rows FROM (SELECT id,actor_name,actor_id,actor_role,folder,action,record_id,changes,created_at FROM public.municipal_ti_history WHERE municipality_id=m ORDER BY id DESC LIMIT 30 OFFSET off) q;
 ELSE RAISE EXCEPTION 'Pasta inválida.'; END IF;
 RETURN jsonb_build_object('rows',rows,'canEdit',can_write);
 END IF;
 IF a='update_contact' THEN
 IF NOT can_write OR f NOT IN ('servidores','organograma') THEN RAISE EXCEPTION 'Edição não autorizada.' USING ERRCODE='42501'; END IF;
 target:=(payload->>'id')::uuid; IF length(coalesce(payload->>'phone',''))>40 THEN RAISE EXCEPTION 'Telefone inválido.'; END IF;
 IF f='servidores' THEN UPDATE public.profiles SET phone=nullif(btrim(payload->>'phone'),'') WHERE id=target AND municipality_id=m AND tipo='interno' AND deleted_at IS NULL AND (admin OR role NOT IN ('prefeitura_admin','prefeitura_supervisor'));
 ELSE UPDATE public.departments SET phone=nullif(btrim(payload->>'phone'),'') WHERE id=target AND municipality_id=m AND is_active; END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'Registro não autorizado ou inexistente.'; END IF;
 RETURN jsonb_build_object('ok',true);
 END IF;
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
COMMIT;
