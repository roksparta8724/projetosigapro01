CREATE TABLE IF NOT EXISTS public.municipal_staff_identity_primary (
 profile_id uuid PRIMARY KEY REFERENCES public.profiles(id),
 municipality_id uuid NOT NULL REFERENCES public.municipalities(id),
 department_id uuid NOT NULL REFERENCES public.departments(id),
 updated_by uuid NOT NULL REFERENCES public.profiles(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.municipal_staff_identity_primary ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.municipal_staff_identity_primary FROM PUBLIC, anonymous, authenticated;

CREATE TABLE IF NOT EXISTS public.municipal_staff_identity_primary_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),profile_id uuid NOT NULL REFERENCES public.profiles(id),municipality_id uuid NOT NULL REFERENCES public.municipalities(id),department_id uuid NOT NULL REFERENCES public.departments(id),actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),event text NOT NULL CHECK(event IN ('fix','clear')),created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.municipal_staff_identity_primary_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.municipal_staff_identity_primary_audit FROM PUBLIC, anonymous, authenticated;

CREATE OR REPLACE FUNCTION public.set_municipal_staff_identity_primary_v1(_municipality_id uuid,_profile_id uuid,_department_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public SET row_security TO off AS $$
DECLARE actor public.profiles%rowtype; target public.profiles%rowtype; unit public.departments%rowtype; old_unit uuid;
BEGIN
 SELECT * INTO actor FROM public.profiles WHERE id=public.current_profile_id() AND account_status='active' AND deleted_at IS NULL;
 IF actor.id IS NULL OR actor.role<>'prefeitura_admin' OR actor.municipality_id IS DISTINCT FROM _municipality_id OR actor.id=_profile_id THEN RAISE EXCEPTION 'Somente o administrador da Prefeitura pode fixar a identificação de outro servidor.'; END IF;
 SELECT * INTO target FROM public.profiles WHERE id=_profile_id AND municipality_id=_municipality_id AND account_status='active' AND deleted_at IS NULL FOR UPDATE;
 IF target.id IS NULL OR target.role NOT IN ('analista','financeiro','fiscal','setor_intersetorial','prefeitura_supervisor','prefeitura_admin') THEN RAISE EXCEPTION 'Servidor interno ativo não encontrado.'; END IF;
 SELECT department_id INTO old_unit FROM public.municipal_staff_identity_primary WHERE profile_id=_profile_id AND municipality_id=_municipality_id;
 IF _department_id IS NULL THEN
 DELETE FROM public.municipal_staff_identity_primary WHERE profile_id=_profile_id AND municipality_id=_municipality_id;
 IF old_unit IS NOT NULL THEN INSERT INTO public.municipal_staff_identity_primary_audit(profile_id,municipality_id,department_id,actor_profile_id,event) VALUES(_profile_id,_municipality_id,old_unit,actor.id,'clear'); END IF;
 ELSE
 SELECT * INTO unit FROM public.departments WHERE id=_department_id AND municipality_id=_municipality_id AND is_active AND nullif(btrim(code),'') IS NOT NULL;
 IF unit.id IS NULL OR (target.department_id IS DISTINCT FROM _department_id AND NOT EXISTS(SELECT 1 FROM public.municipal_staff_assignments a WHERE a.profile_id=_profile_id AND a.municipality_id=_municipality_id AND a.department_id=_department_id AND a.is_active)) THEN RAISE EXCEPTION 'Escolha uma lotação ativa e autorizada com sigla cadastrada.'; END IF;
 INSERT INTO public.municipal_staff_identity_primary_audit(profile_id,municipality_id,department_id,actor_profile_id,event) SELECT _profile_id,_municipality_id,old_unit,actor.id,'clear' WHERE old_unit IS NOT NULL AND old_unit<>_department_id;
 UPDATE public.municipal_authority_designations SET is_primary=false,updated_at=now(),updated_by=actor.id WHERE profile_id=_profile_id AND municipality_id=_municipality_id AND is_primary AND is_active;
 INSERT INTO public.municipal_staff_identity_primary(profile_id,municipality_id,department_id,updated_by) VALUES(_profile_id,_municipality_id,_department_id,actor.id) ON CONFLICT(profile_id) DO UPDATE SET municipality_id=excluded.municipality_id,department_id=excluded.department_id,updated_by=actor.id,updated_at=now();
 INSERT INTO public.municipal_staff_identity_primary_audit(profile_id,municipality_id,department_id,actor_profile_id,event) VALUES(_profile_id,_municipality_id,_department_id,actor.id,'fix');
 END IF;
 RETURN public.list_municipal_identity_badges_v1(_municipality_id,ARRAY[_profile_id]);
END $$;

REVOKE ALL ON FUNCTION public.set_municipal_staff_identity_primary_v1(uuid,uuid,uuid) FROM PUBLIC, anonymous;

GRANT EXECUTE ON FUNCTION public.set_municipal_staff_identity_primary_v1(uuid,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_municipal_authority_preferences_v1(_municipality_id uuid, _profile_id uuid, _designation_id uuid, _make_primary boolean, _urbanism_authorized boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
DECLARE actor public.profiles%rowtype; target public.profiles%rowtype; designation public.municipal_authority_designations%rowtype; old_primary boolean;
BEGIN
 SELECT * INTO actor FROM public.profiles WHERE id=public.current_profile_id() AND account_status='active' AND deleted_at IS NULL;
 IF actor.id IS NULL OR actor.role<>'prefeitura_admin' OR actor.municipality_id IS DISTINCT FROM _municipality_id OR actor.id=_profile_id THEN RAISE EXCEPTION 'Somente o administrador da Prefeitura pode definir a competência de outros servidores.'; END IF;
 SELECT * INTO target FROM public.profiles WHERE id=_profile_id AND municipality_id=_municipality_id AND deleted_at IS NULL AND account_status='active' FOR UPDATE;
 IF target.id IS NULL THEN RAISE EXCEPTION 'Servidor ativo não encontrado.'; END IF;
 SELECT a.* INTO designation FROM public.municipal_authority_designations a JOIN public.departments d ON d.id=a.department_id AND d.municipality_id=a.municipality_id AND d.unit_type=a.authority_kind WHERE a.id=_designation_id AND a.profile_id=_profile_id AND a.municipality_id=_municipality_id AND a.is_active AND d.is_active FOR UPDATE OF a;
 IF designation.id IS NULL THEN RAISE EXCEPTION 'Designação ativa não encontrada.'; END IF;
 IF _make_primary IS TRUE AND NOT EXISTS(SELECT 1 FROM public.departments d WHERE d.id=designation.department_id AND nullif(btrim(d.code),'') IS NOT NULL) THEN RAISE EXCEPTION 'Cadastre a sigla da unidade antes de fixá-la no nome.'; END IF;
 IF _urbanism_authorized IS TRUE AND target.role<>'prefeitura_supervisor' THEN RAISE EXCEPTION 'A competência urbanística exige o perfil institucional de Supervisão.'; END IF;
 old_primary:=designation.is_primary;
 IF _make_primary IS TRUE THEN
 INSERT INTO public.municipal_staff_identity_primary_audit(profile_id,municipality_id,department_id,actor_profile_id,event) SELECT profile_id,municipality_id,department_id,actor.id,'clear' FROM public.municipal_staff_identity_primary WHERE profile_id=_profile_id AND municipality_id=_municipality_id;
 DELETE FROM public.municipal_staff_identity_primary WHERE profile_id=_profile_id AND municipality_id=_municipality_id;
 UPDATE public.municipal_authority_designations SET is_primary=false,updated_by=actor.id,updated_at=now() WHERE municipality_id=_municipality_id AND profile_id=_profile_id AND is_active AND is_primary AND id<>designation.id;
 END IF;
 UPDATE public.municipal_authority_designations SET is_primary=coalesce(_make_primary,is_primary),urbanism_authorized=coalesce(_urbanism_authorized,urbanism_authorized),updated_by=actor.id,updated_at=now() WHERE id=designation.id;
 INSERT INTO public.municipal_authority_designation_audit(designation_id,municipality_id,actor_profile_id,event,details) VALUES(designation.id,_municipality_id,actor.id,'preferences',jsonb_build_object('previousPrimary',old_primary,'primary',coalesce(_make_primary,old_primary),'previousUrbanismAuthorized',designation.urbanism_authorized,'urbanismAuthorized',coalesce(_urbanism_authorized,designation.urbanism_authorized)));
 RETURN public.list_municipal_authority_designations_v1(_municipality_id,_profile_id);
END $function$;

CREATE OR REPLACE FUNCTION public.list_municipal_identity_badges_v1(_municipality_id uuid, _profile_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
DECLARE actor public.profiles%rowtype;
BEGIN
 SELECT * INTO actor FROM public.profiles WHERE id=public.current_profile_id() AND account_status='active' AND deleted_at IS NULL;
 IF actor.id IS NULL OR actor.municipality_id IS DISTINCT FROM _municipality_id OR coalesce(cardinality(_profile_ids),0)>100 OR coalesce(cardinality(_profile_ids),0)=0 OR (actor.role<>'prefeitura_admin' AND EXISTS(SELECT 1 FROM unnest(_profile_ids) i WHERE i IS DISTINCT FROM actor.id)) THEN RAISE EXCEPTION 'Consulta institucional fora do escopo.'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('profileId',p.id,'municipalityId',p.municipality_id,'departmentId',coalesce(primary_unit.id,fixed_unit.id,department.id),'code',CASE WHEN primary_unit.id IS NOT NULL THEN coalesce(primary_unit.code,'') WHEN fixed_unit.id IS NOT NULL THEN coalesce(fixed_unit.code,'') ELSE coalesce(department.code,'') END,'name',coalesce(primary_unit.name,fixed_unit.name,department.name,''),'kind',coalesce(primary_unit.unit_type,fixed_unit.unit_type,department.unit_type,''),'fixed',primary_unit.id IS NOT NULL OR fixed_unit.id IS NOT NULL,'authority',primary_unit.id IS NOT NULL) ORDER BY p.id),'[]'::jsonb)
 FROM public.profiles p
 LEFT JOIN public.departments department ON department.id=p.department_id AND department.municipality_id=p.municipality_id AND department.is_active
 LEFT JOIN LATERAL(SELECT d.* FROM public.municipal_authority_designations a JOIN public.departments d ON d.id=a.department_id AND d.municipality_id=a.municipality_id AND d.unit_type=a.authority_kind WHERE a.profile_id=p.id AND a.municipality_id=p.municipality_id AND a.is_active AND a.is_primary AND d.is_active LIMIT 1) primary_unit ON true
 LEFT JOIN LATERAL(SELECT d.* FROM public.municipal_staff_identity_primary f JOIN public.departments d ON d.id=f.department_id AND d.municipality_id=f.municipality_id AND d.is_active WHERE f.profile_id=p.id AND f.municipality_id=p.municipality_id AND (p.department_id=f.department_id OR EXISTS(SELECT 1 FROM public.municipal_staff_assignments a WHERE a.profile_id=p.id AND a.municipality_id=p.municipality_id AND a.department_id=f.department_id AND a.is_active)) LIMIT 1) fixed_unit ON true
 WHERE p.id=ANY(_profile_ids) AND p.municipality_id=_municipality_id AND p.deleted_at IS NULL AND p.role IN ('prefeitura_admin','prefeitura_supervisor','analista','financeiro','fiscal','setor_intersetorial'));
END $function$;

CREATE OR REPLACE FUNCTION public.set_municipal_staff_department_v1(_municipality_id uuid, _profile_id uuid, _department_id uuid, _enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
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
   INSERT INTO public.municipal_staff_identity_primary_audit(profile_id,municipality_id,department_id,actor_profile_id,event) SELECT profile_id,municipality_id,department_id,v_actor,'clear' FROM public.municipal_staff_identity_primary WHERE profile_id=_profile_id AND municipality_id=_municipality_id AND department_id=_department_id;
   DELETE FROM public.municipal_staff_identity_primary WHERE profile_id=_profile_id AND municipality_id=_municipality_id AND department_id=_department_id;
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
$function$;
