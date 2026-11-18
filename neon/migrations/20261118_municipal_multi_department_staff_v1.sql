-- SIGAPRO | Um login e múltiplas lotações internas por prefeitura.
-- Somente o administrador da própria prefeitura concede/revoga vínculos.
-- A atuação é limitada a UM setor ativo por vez e validada no banco.
-- Não altera nem cria credenciais. Não concede papéis de assinatura/administrador.
BEGIN;

CREATE TABLE IF NOT EXISTS public.municipal_staff_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id uuid NOT NULL REFERENCES public.municipalities(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id),
  role_code text NOT NULL CHECK(role_code IN ('analista','financeiro','fiscal','setor_intersetorial')),
  is_active boolean NOT NULL DEFAULT true,
  assigned_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(municipality_id,profile_id,department_id)
);
CREATE INDEX IF NOT EXISTS idx_municipal_staff_assignments_profile
 ON public.municipal_staff_assignments(profile_id,municipality_id) WHERE is_active;
ALTER TABLE public.municipal_staff_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.municipal_staff_assignments FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.municipal_staff_assignment_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  actor_profile_id uuid NOT NULL,
  assignment_id uuid,
  event text NOT NULL CHECK(event IN ('grant','revoke','switch')),
  from_department_id uuid,
  to_department_id uuid,
  from_role text,
  to_role text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_assignment_audit_target
 ON public.municipal_staff_assignment_audit(profile_id,created_at DESC);
ALTER TABLE public.municipal_staff_assignment_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.municipal_staff_assignment_audit FROM PUBLIC, anon, authenticated;

-- Idêntica categorização operacional que o SIGAPRO usa no organograma.
-- O administrador escolhe a unidade, nunca inventa permissões por string.
CREATE OR REPLACE FUNCTION public._staff_role_for_department_v1(_name text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path TO 'pg_catalog','public'
AS $$
DECLARE
  v text := lower(translate(coalesce(_name,''),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'));
BEGIN
  IF v ~ '(finance|financa|fazenda|tesour|arrecad|tribut)' THEN RETURN 'financeiro'; END IF;
  IF v ~ '(fiscaliz|fiscal|postura)' THEN RETURN 'fiscal'; END IF;
  IF v ~ '(analise|urbanismo|obras|engenharia|planejamento|licenciamento|aprovacao|topografia)' THEN RETURN 'analista'; END IF;
  RETURN 'setor_intersetorial';
END;
$$;
REVOKE ALL ON FUNCTION public._staff_role_for_department_v1(text) FROM PUBLIC,anon,authenticated;

-- Privado: troca o contexto canônico lido pela RLS e pelo cliente.
-- ATENÇÃO: invocável somente pelas duas funções autenticadas abaixo.
CREATE OR REPLACE FUNCTION public._apply_staff_context_v1(
  _profile_id uuid,_municipality_id uuid,_department_id uuid,_role_code text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public' SET row_security TO 'off'
AS $$
DECLARE
 v_name text;
 v_role_id uuid;
 v_membership_id uuid;
BEGIN
 IF _role_code NOT IN ('analista','financeiro','fiscal','setor_intersetorial') THEN
   RAISE EXCEPTION 'Papel operacional inválido';
 END IF;
 SELECT d.name INTO v_name FROM public.departments d
 WHERE d.id=_department_id AND d.municipality_id=_municipality_id AND d.is_active;
 IF v_name IS NULL OR public._staff_role_for_department_v1(v_name)<>_role_code THEN
   RAISE EXCEPTION 'A unidade não corresponde ao perfil operacional autorizado';
 END IF;
 SELECT id INTO v_role_id FROM public.roles WHERE code::text=_role_code LIMIT 1;
 IF v_role_id IS NULL THEN RAISE EXCEPTION 'Papel operacional indisponível'; END IF;
 UPDATE public.profiles SET role=_role_code,department_id=_department_id,updated_at=now()
 WHERE id=_profile_id AND municipality_id=_municipality_id
   AND account_status='active' AND deleted_at IS NULL
   AND role IN ('analista','financeiro','fiscal','setor_intersetorial');
 IF NOT FOUND THEN RAISE EXCEPTION 'Conta interna indisponível'; END IF;

 -- A fonte de current_role_code() só pode ter um papel ativo.
 UPDATE public.tenant_memberships SET is_active=false,
   deleted_at=coalesce(deleted_at,now()),updated_at=now()
 WHERE tenant_id=_municipality_id AND profile_id=_profile_id
   AND role_id<>v_role_id AND is_active=true AND deleted_at IS NULL;
 SELECT id INTO v_membership_id FROM public.tenant_memberships
 WHERE tenant_id=_municipality_id AND profile_id=_profile_id AND role_id=v_role_id
 ORDER BY updated_at DESC NULLS LAST LIMIT 1 FOR UPDATE;
 IF v_membership_id IS NOT NULL THEN
   UPDATE public.tenant_memberships
   SET department=v_name,is_active=true,deleted_at=NULL,updated_at=now()
   WHERE id=v_membership_id;
 ELSE
   INSERT INTO public.tenant_memberships(
     tenant_id,profile_id,role_id,department,is_active,created_at,updated_at
   ) VALUES(_municipality_id,_profile_id,v_role_id,v_name,true,now(),now());
 END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._apply_staff_context_v1(uuid,uuid,uuid,text)
 FROM PUBLIC,anon,authenticated;

-- Vínculo principal existente: preservar sua função e departamento.
INSERT INTO public.municipal_staff_assignments(
  municipality_id,profile_id,department_id,role_code
)
SELECT p.municipality_id,p.id,p.department_id,
       public._staff_role_for_department_v1(d.name)
FROM public.profiles p
JOIN public.departments d ON d.id=p.department_id
 AND d.municipality_id=p.municipality_id AND d.is_active
WHERE p.deleted_at IS NULL AND p.account_status='active'
  AND p.role IN ('analista','financeiro','fiscal','setor_intersetorial')
ON CONFLICT(municipality_id,profile_id,department_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.list_municipal_staff_assignments_v1(
  _profile_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public' SET row_security TO 'off'
AS $$
DECLARE
 v_actor uuid := public.current_profile_id();
 v_target uuid := coalesce(_profile_id,v_actor);
 v_municipality uuid;
 v_actor_municipality uuid;
 v_actor_role text;
 v_target_status text;
 v_current_department uuid;
 v_result jsonb;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Sessão não autenticada'; END IF;
 SELECT municipality_id,role INTO v_actor_municipality,v_actor_role
 FROM public.profiles WHERE id=v_actor AND deleted_at IS NULL AND account_status='active';
 SELECT municipality_id,account_status,department_id
 INTO v_municipality,v_target_status,v_current_department
 FROM public.profiles WHERE id=v_target AND deleted_at IS NULL;
 IF v_municipality IS NULL OR v_target_status<>'active' THEN
   RAISE EXCEPTION 'Servidor indisponível';
 END IF;
 IF v_target<>v_actor AND NOT (
   public.is_master() OR
   (v_actor_role='prefeitura_admin' AND v_actor_municipality=v_municipality)
 ) THEN RAISE EXCEPTION 'Sem permissão para consultar lotações'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',a.id,'municipalityId',a.municipality_id,'profileId',a.profile_id,
   'departmentId',d.id,'departmentName',d.name,'departmentCode',coalesce(d.code,''),
   'role',a.role_code,'isCurrent',a.department_id=v_current_department,
   'isActive',a.is_active
 ) ORDER BY d.sort_order,d.name),'[]'::jsonb) INTO v_result
 FROM public.municipal_staff_assignments a
 JOIN public.departments d ON d.id=a.department_id
   AND d.municipality_id=a.municipality_id AND d.is_active
 WHERE a.profile_id=v_target AND a.municipality_id=v_municipality AND a.is_active;
 RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.list_municipal_staff_assignments_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_municipal_staff_assignments_v1(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_municipal_staff_department_v1(
 _municipality_id uuid,_profile_id uuid,_department_id uuid,_enabled boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public' SET row_security TO 'off'
AS $$
DECLARE
 v_actor uuid := public.current_profile_id();
 v_actor_role text;
 v_actor_municipality uuid;
 v_target public.profiles%rowtype;
 v_department_name text;
 v_assignment_id uuid;
 v_role_code text;
 v_fallback record;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Sessão não autenticada'; END IF;
 SELECT role,municipality_id INTO v_actor_role,v_actor_municipality
 FROM public.profiles WHERE id=v_actor AND account_status='active' AND deleted_at IS NULL;
 IF NOT (public.is_master() OR
    (v_actor_role='prefeitura_admin' AND v_actor_municipality=_municipality_id)) THEN
   RAISE EXCEPTION 'Somente o administrador desta Prefeitura pode designar unidades';
 END IF;
 IF v_actor=_profile_id THEN RAISE EXCEPTION 'Não é permitido conceder acesso operacional à própria conta'; END IF;
 SELECT * INTO v_target FROM public.profiles
 WHERE id=_profile_id AND municipality_id=_municipality_id
 AND account_status='active' AND deleted_at IS NULL FOR UPDATE;
 IF v_target.id IS NULL OR v_target.role NOT IN
 ('analista','financeiro','fiscal','setor_intersetorial') THEN
   RAISE EXCEPTION 'Vínculo permitido apenas a funcionário interno operacional ativo';
 END IF;
 SELECT name INTO v_department_name FROM public.departments
 WHERE id=_department_id AND municipality_id=_municipality_id AND is_active;
 IF v_department_name IS NULL THEN RAISE EXCEPTION 'Departamento inexistente ou inativo'; END IF;
 v_role_code := public._staff_role_for_department_v1(v_department_name);
 IF coalesce(_enabled,false) THEN
   -- Primeiro vínculo adicional nunca deve apagar a unidade original.
   IF v_target.department_id IS NOT NULL THEN
     INSERT INTO public.municipal_staff_assignments(
       municipality_id,profile_id,department_id,role_code,assigned_by)
     SELECT _municipality_id,_profile_id,d.id,
       public._staff_role_for_department_v1(d.name),v_actor
     FROM public.departments d WHERE d.id=v_target.department_id
       AND d.municipality_id=_municipality_id AND d.is_active
     ON CONFLICT(municipality_id,profile_id,department_id) DO NOTHING;
   END IF;
   INSERT INTO public.municipal_staff_assignments(
     municipality_id,profile_id,department_id,role_code,is_active,assigned_by,updated_at)
   VALUES(_municipality_id,_profile_id,_department_id,v_role_code,true,v_actor,now())
   ON CONFLICT(municipality_id,profile_id,department_id)
   DO UPDATE SET role_code=excluded.role_code,is_active=true,
     assigned_by=v_actor,updated_at=now()
   RETURNING id INTO v_assignment_id;
 ELSE
   SELECT id INTO v_assignment_id FROM public.municipal_staff_assignments
   WHERE municipality_id=_municipality_id AND profile_id=_profile_id
     AND department_id=_department_id AND is_active FOR UPDATE;
   IF v_assignment_id IS NULL THEN RAISE EXCEPTION 'Lotação não está atribuída'; END IF;
   IF v_target.department_id=_department_id THEN
     SELECT a.department_id,a.role_code INTO v_fallback
     FROM public.municipal_staff_assignments a
     JOIN public.departments d ON d.id=a.department_id AND d.is_active
     WHERE a.municipality_id=_municipality_id AND a.profile_id=_profile_id
       AND a.is_active AND a.department_id<>_department_id
     ORDER BY a.created_at,a.id LIMIT 1;
     IF v_fallback.department_id IS NULL THEN
       RAISE EXCEPTION 'É necessário manter ao menos uma lotação ativa ou bloquear a conta';
     END IF;
     PERFORM public._apply_staff_context_v1(
       _profile_id,_municipality_id,v_fallback.department_id,v_fallback.role_code);
   END IF;
   UPDATE public.municipal_staff_assignments SET is_active=false,updated_at=now()
   WHERE id=v_assignment_id;
 END IF;
 INSERT INTO public.municipal_staff_assignment_audit(
   municipality_id,profile_id,actor_profile_id,assignment_id,event,
   from_department_id,to_department_id,from_role,to_role)
 VALUES(_municipality_id,_profile_id,v_actor,v_assignment_id,
   CASE WHEN _enabled THEN 'grant' ELSE 'revoke' END,
   v_target.department_id,CASE WHEN _enabled THEN _department_id ELSE NULL END,
   v_target.role,CASE WHEN _enabled THEN v_role_code ELSE NULL END);
 RETURN jsonb_build_object('ok',true,'profileId',_profile_id,
   'municipalityId',_municipality_id,'departmentId',_department_id,'enabled',_enabled);
END;
$$;
REVOKE ALL ON FUNCTION public.set_municipal_staff_department_v1(uuid,uuid,uuid,boolean)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_municipal_staff_department_v1(uuid,uuid,uuid,boolean)
 TO authenticated;

CREATE OR REPLACE FUNCTION public.activate_municipal_staff_assignment_v1(
 _assignment_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public' SET row_security TO 'off'
AS $$
DECLARE
 v_actor uuid := public.current_profile_id();
 v_profile public.profiles%rowtype;
 v_assignment record;
 v_previous_role text;
 v_previous_department uuid;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Sessão não autenticada'; END IF;
 SELECT * INTO v_profile FROM public.profiles
 WHERE id=v_actor AND account_status='active' AND deleted_at IS NULL FOR UPDATE;
 IF v_profile.id IS NULL OR v_profile.role NOT IN
 ('analista','financeiro','fiscal','setor_intersetorial') THEN
   RAISE EXCEPTION 'A troca é exclusiva de funcionário operacional autorizado';
 END IF;
 SELECT a.id,a.municipality_id,a.profile_id,a.department_id,a.role_code,
        d.name AS department_name
 INTO v_assignment
 FROM public.municipal_staff_assignments a
 JOIN public.departments d ON d.id=a.department_id
 AND d.municipality_id=a.municipality_id AND d.is_active
 WHERE a.id=_assignment_id AND a.profile_id=v_actor
   AND a.municipality_id=v_profile.municipality_id AND a.is_active;
 IF v_assignment.id IS NULL THEN RAISE EXCEPTION 'Lotação não autorizada ou revogada'; END IF;
 v_previous_role:=v_profile.role;
 v_previous_department:=v_profile.department_id;
 PERFORM public._apply_staff_context_v1(v_actor,v_profile.municipality_id,
   v_assignment.department_id,v_assignment.role_code);
 INSERT INTO public.municipal_staff_assignment_audit(
   municipality_id,profile_id,actor_profile_id,assignment_id,event,
   from_department_id,to_department_id,from_role,to_role)
 VALUES(v_profile.municipality_id,v_actor,v_actor,v_assignment.id,'switch',
        v_previous_department,v_assignment.department_id,
        v_previous_role,v_assignment.role_code);
 RETURN jsonb_build_object('ok',true,'profileId',v_actor,
   'municipalityId',v_profile.municipality_id,'departmentId',v_assignment.department_id,
   'departmentName',v_assignment.department_name,
   'role',v_assignment.role_code);
END;
$$;
REVOKE ALL ON FUNCTION public.activate_municipal_staff_assignment_v1(uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.activate_municipal_staff_assignment_v1(uuid) TO authenticated;

COMMIT;
NOTIFY pgrst,'reload schema';
