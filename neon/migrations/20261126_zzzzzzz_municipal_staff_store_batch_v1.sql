CREATE OR REPLACE FUNCTION public.municipal_staff_store_batch_v1(_assignment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY INVOKER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'on'
AS $function$
DECLARE
 v_profile uuid := public.current_profile_id();
 v_rows jsonb;
 v_assignment jsonb;
BEGIN
 IF v_profile IS NULL OR _assignment_id IS NULL THEN RETURN NULL; END IF;
 SELECT j INTO v_assignment FROM jsonb_array_elements(public.list_municipal_staff_assignments_v1(NULL)) j
 WHERE j->>'id'=_assignment_id::text AND j->>'profileId'=v_profile::text
 AND (j->>'isActive')::boolean IS TRUE AND (j->>'isCurrent')::boolean IS TRUE;
 IF v_assignment IS NULL THEN RETURN NULL; END IF;
 SELECT jsonb_build_object(
 'municipalities',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC,q.id DESC), '[]'::jsonb) FROM (SELECT * FROM public.municipalities ORDER BY created_at DESC,id DESC LIMIT 501) q),
 'municipality_branding',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.id DESC), '[]'::jsonb) FROM (SELECT * FROM public.municipality_branding ORDER BY id DESC LIMIT 501) q),
 'municipality_settings',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.id DESC), '[]'::jsonb) FROM (SELECT * FROM public.municipality_settings ORDER BY id DESC LIMIT 501) q),
 'profiles',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.id DESC), '[]'::jsonb) FROM (SELECT * FROM public.profiles ORDER BY id DESC LIMIT 501) q),
 'tenant_memberships',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.id DESC), '[]'::jsonb) FROM (SELECT * FROM public.tenant_memberships WHERE is_active=true AND deleted_at IS NULL ORDER BY id DESC LIMIT 501) q),
 'roles',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.id DESC), '[]'::jsonb) FROM (SELECT * FROM public.roles ORDER BY id DESC LIMIT 501) q),
 'departments',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.id DESC), '[]'::jsonb) FROM (SELECT * FROM public.departments ORDER BY id DESC LIMIT 501) q),
 'processes',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC,q.id DESC), '[]'::jsonb) FROM (SELECT * FROM public.processes WHERE archived_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 501) q),
 'properties',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.id DESC), '[]'::jsonb) FROM (SELECT * FROM public.properties ORDER BY id DESC LIMIT 501) q),
 'payment_guides',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC,q.id DESC), '[]'::jsonb) FROM (SELECT * FROM public.payment_guides WHERE process_id IS NOT NULL ORDER BY created_at DESC,id DESC LIMIT 501) q),
 'process_parties',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.id DESC), '[]'::jsonb) FROM (SELECT * FROM public.process_parties ORDER BY id DESC LIMIT 501) q),
 'process_documents',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC,q.id DESC), '[]'::jsonb) FROM (SELECT * FROM public.process_documents ORDER BY created_at DESC,id DESC LIMIT 501) q),
 'process_requirements',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC,q.id DESC), '[]'::jsonb) FROM (SELECT * FROM public.process_requirements ORDER BY created_at DESC,id DESC LIMIT 501) q),
 'process_audit_entries',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC,q.id DESC), '[]'::jsonb) FROM (SELECT * FROM public.process_audit_entries ORDER BY created_at DESC,id DESC LIMIT 501) q),
 'process_reopen_history',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC,q.id DESC), '[]'::jsonb) FROM (SELECT * FROM public.process_reopen_history ORDER BY created_at DESC,id DESC LIMIT 501) q),
 'process_movements',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC,q.id DESC), '[]'::jsonb) FROM (SELECT * FROM public.process_movements ORDER BY created_at DESC,id DESC LIMIT 501) q),
 'interdepartmental_dispatches',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC,q.id DESC), '[]'::jsonb) FROM (SELECT * FROM public.interdepartmental_dispatches ORDER BY created_at DESC,id DESC LIMIT 501) q),
 'process_messages',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC,q.id DESC), '[]'::jsonb) FROM (SELECT * FROM public.process_messages ORDER BY created_at DESC,id DESC LIMIT 501) q),
 'process_markers',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC,q.id DESC), '[]'::jsonb) FROM (SELECT * FROM public.process_markers ORDER BY created_at DESC,id DESC LIMIT 501) q),
 'project_owner_requests',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.requested_at DESC,q.id DESC), '[]'::jsonb) FROM (SELECT * FROM public.project_owner_requests ORDER BY requested_at DESC,id DESC LIMIT 501) q),
 'project_owner_links',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.linked_at DESC,q.id DESC), '[]'::jsonb) FROM (SELECT * FROM public.project_owner_links ORDER BY linked_at DESC,id DESC LIMIT 501) q),
 'owner_professional_messages',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC,q.id DESC), '[]'::jsonb) FROM (SELECT * FROM public.owner_professional_messages ORDER BY created_at DESC,id DESC LIMIT 501) q),
 'plans',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.id DESC), '[]'::jsonb) FROM (SELECT * FROM public.plans ORDER BY id DESC LIMIT 501) q),
 'client_plan_assignments',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.updated_at DESC,q.id DESC), '[]'::jsonb) FROM (SELECT * FROM public.client_plan_assignments ORDER BY updated_at DESC,id DESC LIMIT 501) q)
 ) INTO v_rows;
 IF EXISTS (SELECT 1 FROM jsonb_each(v_rows) e WHERE jsonb_array_length(e.value)>500)
 OR pg_column_size(v_rows)>1500000 THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('profileId',v_profile,'assignmentId',_assignment_id,'municipalityId',v_assignment->>'municipalityId','departmentId',v_assignment->>'departmentId','role',v_assignment->>'role','rows',v_rows);
END;
$function$;

REVOKE ALL ON FUNCTION public.municipal_staff_store_batch_v1(uuid) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.municipal_staff_store_batch_v1(uuid) TO authenticated;