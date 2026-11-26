CREATE OR REPLACE FUNCTION public.list_municipal_identity_badges_v1(_municipality_id uuid,_profile_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public SET row_security TO off AS $$
DECLARE actor public.profiles%rowtype;
BEGIN
 SELECT * INTO actor FROM public.profiles WHERE id=public.current_profile_id() AND account_status='active' AND deleted_at IS NULL;
 IF actor.id IS NULL OR actor.municipality_id IS DISTINCT FROM _municipality_id OR coalesce(cardinality(_profile_ids),0)>100 OR coalesce(cardinality(_profile_ids),0)=0 OR (actor.role<>'prefeitura_admin' AND EXISTS(SELECT 1 FROM unnest(_profile_ids) i WHERE i IS DISTINCT FROM actor.id)) THEN RAISE EXCEPTION 'Consulta institucional fora do escopo.'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('profileId',p.id,'municipalityId',p.municipality_id,'code',CASE WHEN primary_unit.id IS NOT NULL THEN coalesce(primary_unit.code,'') ELSE coalesce(department.code,'') END,'name',coalesce(primary_unit.name,department.name,''),'kind',coalesce(primary_unit.unit_type,department.unit_type,''),'fixed',primary_unit.id IS NOT NULL) ORDER BY p.id),'[]'::jsonb)
 FROM public.profiles p
 LEFT JOIN public.departments department ON department.id=p.department_id AND department.municipality_id=p.municipality_id AND department.is_active
 LEFT JOIN LATERAL(SELECT d.* FROM public.municipal_authority_designations a JOIN public.departments d ON d.id=a.department_id AND d.municipality_id=a.municipality_id AND d.unit_type=a.authority_kind WHERE a.profile_id=p.id AND a.municipality_id=p.municipality_id AND a.is_active AND a.is_primary AND d.is_active LIMIT 1) primary_unit ON true
 WHERE p.id=ANY(_profile_ids) AND p.municipality_id=_municipality_id AND p.deleted_at IS NULL AND p.role IN ('prefeitura_admin','prefeitura_supervisor','analista','financeiro','fiscal','setor_intersetorial'));
END $$;

REVOKE ALL ON FUNCTION public.list_municipal_identity_badges_v1(uuid,uuid[]) FROM PUBLIC, anonymous;

GRANT EXECUTE ON FUNCTION public.list_municipal_identity_badges_v1(uuid,uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_current_municipal_authority_capabilities_v1(_process_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public SET row_security TO off AS $$
DECLARE actor uuid:=public.current_profile_id(); municipality uuid; actor_role text; names jsonb:='[]'::jsonb;
BEGIN
 IF actor IS NULL OR NOT public.has_process_access(_process_id) THEN RETURN jsonb_build_object('director',false,'secretary',false,'supervision',false,'directorNames',names); END IF;
 SELECT coalesce(p.municipality_id,p.tenant_id) INTO municipality FROM public.processes p WHERE p.id=_process_id;
 SELECT role INTO actor_role FROM public.profiles WHERE id=actor AND account_status='active' AND deleted_at IS NULL;
 IF actor_role IN ('prefeitura_admin','prefeitura_supervisor','analista','financeiro','fiscal','setor_intersetorial') OR public.is_master() THEN
 SELECT coalesce(jsonb_agg(q.full_name ORDER BY q.full_name),'[]'::jsonb) INTO names FROM (SELECT p.full_name FROM public.profiles p WHERE p.municipality_id=municipality AND p.role='prefeitura_supervisor' AND p.account_status='active' AND p.deleted_at IS NULL AND nullif(btrim(p.full_name),'') IS NOT NULL AND public._municipal_urbanism_authority_title_v1(p.id,municipality,'diretoria') IS NOT NULL ORDER BY p.full_name LIMIT 100) q;
 END IF;
 RETURN jsonb_build_object('director',public._municipal_urbanism_authority_title_v1(actor,municipality,'diretoria') IS NOT NULL,'secretary',public._municipal_urbanism_authority_title_v1(actor,municipality,'secretaria') IS NOT NULL,'supervision',public.can_supervise_process_analysis(_process_id),'directorNames',names);
END $$;

REVOKE ALL ON FUNCTION public.get_current_municipal_authority_capabilities_v1(uuid) FROM PUBLIC, anonymous;

GRANT EXECUTE ON FUNCTION public.get_current_municipal_authority_capabilities_v1(uuid) TO authenticated;
