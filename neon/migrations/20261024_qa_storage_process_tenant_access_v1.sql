-- QA only. A valid municipality membership and valid process permission
-- are not sufficient independently: the process MUST belong to the exact
-- municipality named in the private storage object key.
CREATE OR REPLACE FUNCTION public.qa_storage_process_tenant_access_v1(
  _process_id uuid, _tenant_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
SET row_security TO 'off'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.processes p
    WHERE p.id = _process_id
      AND COALESCE(p.municipality_id, p.tenant_id) = _tenant_id
      AND public.has_tenant_access(_tenant_id)
      AND public.has_process_access(_process_id)
  );
$function$;
REVOKE ALL ON FUNCTION public.qa_storage_process_tenant_access_v1(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qa_storage_process_tenant_access_v1(uuid,uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
