-- QA ONLY — fail closed for legacy objects in owner folders.
-- Sharing the original uploader is not proof that an object belongs to this process.
-- Return only object keys already recorded by this process in its municipal
-- document catalog. Process-local folder keys are authorized separately.
-- No production migration or financial/process data is changed by this DDL.
CREATE OR REPLACE FUNCTION public.qa_storage_process_file_keys_v1(
  _process_id uuid, _tenant_id uuid
) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
SET row_security TO 'off'
AS $function$
  SELECT CASE
    WHEN _process_id IS NULL OR _tenant_id IS NULL
      OR NOT public.qa_storage_process_tenant_access_v1(_process_id,_tenant_id)
    THEN ARRAY[]::text[]
    ELSE COALESCE((
      SELECT array_agg(verified.file_path ORDER BY verified.file_path)
      FROM (
        SELECT DISTINCT d.file_path
        FROM public.process_documents AS d
        WHERE d.process_id = _process_id
          AND d.tenant_id = _tenant_id
          AND d.file_path IS NOT NULL
          AND length(d.file_path) BETWEEN 1 AND 850
        ORDER BY d.file_path
        LIMIT 1001
      ) AS verified
    ), ARRAY[]::text[])
  END;
$function$;

REVOKE ALL ON FUNCTION public.qa_storage_process_file_keys_v1(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qa_storage_process_file_keys_v1(uuid,uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
