CREATE TABLE IF NOT EXISTS public.municipal_authority_designations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 municipality_id uuid NOT NULL REFERENCES public.municipalities(id),
 profile_id uuid NOT NULL REFERENCES public.profiles(id),
 department_id uuid NOT NULL REFERENCES public.departments(id),
 authority_kind text NOT NULL CHECK(authority_kind IN ('secretaria','diretoria')),
 is_active boolean NOT NULL DEFAULT true,
 updated_by uuid NOT NULL REFERENCES public.profiles(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(municipality_id,profile_id,department_id,authority_kind)
);

ALTER TABLE public.municipal_authority_designations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.municipal_authority_designations FROM PUBLIC, anonymous, authenticated;

CREATE TABLE IF NOT EXISTS public.municipal_authority_designation_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 designation_id uuid NOT NULL REFERENCES public.municipal_authority_designations(id),
 municipality_id uuid NOT NULL REFERENCES public.municipalities(id),
 actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
 event text NOT NULL CHECK(event IN ('grant','revoke')),
 created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.municipal_authority_designation_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.municipal_authority_designation_audit FROM PUBLIC, anonymous, authenticated;

CREATE OR REPLACE FUNCTION public.list_municipal_authority_designations_v1(_municipality_id uuid,_profile_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public SET row_security TO off AS $$
DECLARE actor public.profiles%rowtype;
BEGIN
 SELECT * INTO actor FROM public.profiles WHERE id=public.current_profile_id() AND account_status='active' AND deleted_at IS NULL;
 IF actor.id IS NULL OR actor.municipality_id IS DISTINCT FROM _municipality_id OR (actor.role<>'prefeitura_admin' AND actor.id<>_profile_id) THEN RAISE EXCEPTION 'Sem autorização para consultar designações.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=_profile_id AND p.municipality_id=_municipality_id AND p.deleted_at IS NULL) THEN RAISE EXCEPTION 'Perfil fora da Prefeitura.'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'profileId',a.profile_id,'municipalityId',a.municipality_id,'departmentId',a.department_id,'kind',a.authority_kind,'departmentName',d.name,'departmentCode',d.code,'isActive',a.is_active AND d.is_active AND d.unit_type=a.authority_kind AND p.account_status='active' AND p.deleted_at IS NULL) ORDER BY d.name,a.id),'[]'::jsonb)
 FROM public.municipal_authority_designations a JOIN public.departments d ON d.id=a.department_id AND d.municipality_id=a.municipality_id JOIN public.profiles p ON p.id=a.profile_id AND p.municipality_id=a.municipality_id WHERE a.municipality_id=_municipality_id AND a.profile_id=_profile_id AND a.is_active);
END $$;

CREATE OR REPLACE FUNCTION public.set_municipal_authority_designation_v1(_municipality_id uuid,_profile_id uuid,_department_id uuid,_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public SET row_security TO off AS $$
DECLARE actor public.profiles%rowtype; target public.profiles%rowtype; unit public.departments%rowtype; assignment uuid;
BEGIN
 SELECT * INTO actor FROM public.profiles WHERE id=public.current_profile_id() AND account_status='active' AND deleted_at IS NULL;
 IF actor.id IS NULL OR actor.role<>'prefeitura_admin' OR actor.municipality_id IS DISTINCT FROM _municipality_id OR actor.id=_profile_id THEN RAISE EXCEPTION 'Somente o administrador da Prefeitura pode designar outros servidores.'; END IF;
 SELECT * INTO target FROM public.profiles WHERE id=_profile_id AND municipality_id=_municipality_id AND deleted_at IS NULL FOR UPDATE;
 IF target.id IS NULL OR target.role NOT IN ('prefeitura_admin','prefeitura_supervisor','analista','financeiro','fiscal','setor_intersetorial') OR (_enabled AND target.account_status<>'active') THEN RAISE EXCEPTION 'Servidor interno elegível não encontrado.'; END IF;
 SELECT * INTO unit FROM public.departments WHERE id=_department_id AND municipality_id=_municipality_id;
 IF unit.id IS NULL OR (_enabled AND (NOT unit.is_active OR unit.unit_type NOT IN ('secretaria','diretoria'))) THEN RAISE EXCEPTION 'Selecione uma Secretaria ou Diretoria ativa da Prefeitura.'; END IF;
 IF _enabled IS TRUE THEN
 IF EXISTS(SELECT 1 FROM public.municipal_authority_designations WHERE municipality_id=_municipality_id AND profile_id=_profile_id AND department_id=_department_id AND is_active AND authority_kind<>unit.unit_type) THEN RAISE EXCEPTION 'Retire a designação anterior antes de mudar o tipo da unidade.'; END IF;
 INSERT INTO public.municipal_authority_designations(municipality_id,profile_id,department_id,authority_kind,updated_by) VALUES(_municipality_id,_profile_id,_department_id,unit.unit_type,actor.id)
 ON CONFLICT(municipality_id,profile_id,department_id,authority_kind) DO UPDATE SET is_active=true,updated_by=actor.id,updated_at=now()
 WHERE NOT public.municipal_authority_designations.is_active RETURNING id INTO assignment;
 ELSE
 FOR assignment IN UPDATE public.municipal_authority_designations SET is_active=false,updated_by=actor.id,updated_at=now() WHERE municipality_id=_municipality_id AND profile_id=_profile_id AND department_id=_department_id AND is_active RETURNING id LOOP
 INSERT INTO public.municipal_authority_designation_audit(designation_id,municipality_id,actor_profile_id,event) VALUES(assignment,_municipality_id,actor.id,'revoke');
 END LOOP;
 assignment:=NULL;
 END IF;
 IF assignment IS NOT NULL THEN INSERT INTO public.municipal_authority_designation_audit(designation_id,municipality_id,actor_profile_id,event) VALUES(assignment,_municipality_id,actor.id,CASE WHEN _enabled THEN 'grant' ELSE 'revoke' END); END IF;
 RETURN public.list_municipal_authority_designations_v1(_municipality_id,_profile_id);
END $$;

REVOKE ALL ON FUNCTION public.list_municipal_authority_designations_v1(uuid,uuid) FROM PUBLIC, anonymous;

REVOKE ALL ON FUNCTION public.set_municipal_authority_designation_v1(uuid,uuid,uuid,boolean) FROM PUBLIC, anonymous;

GRANT EXECUTE ON FUNCTION public.list_municipal_authority_designations_v1(uuid,uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.set_municipal_authority_designation_v1(uuid,uuid,uuid,boolean) TO authenticated;
