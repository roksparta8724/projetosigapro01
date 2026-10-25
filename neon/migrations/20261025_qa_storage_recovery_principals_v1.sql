-- QA-only. Retrieve the original uploader's allowed protocol folder
-- identifiers for a process the caller is already authorized to view.
-- Never accept a creator ID from a browser. Never disclose a different
-- municipality's process owner. The returned identifiers are used solely
-- as S3 prefix selectors inside the Neon QA Function.
CREATE OR REPLACE FUNCTION public.qa_storage_recovery_principals_v1(
  _process_id uuid, _tenant_id uuid
) RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
SET row_security TO 'off'
AS $function$
DECLARE
  _principals text[] := ARRAY[]::text[];
BEGIN
  IF _process_id IS NULL OR _tenant_id IS NULL OR
     NOT public.qa_storage_process_tenant_access_v1(_process_id,_tenant_id) THEN
    RETURN _principals;
  END IF;

  SELECT coalesce(array_agg(DISTINCT candidate ORDER BY candidate),ARRAY[]::text[])
    INTO _principals
  FROM public.processes proc
  LEFT JOIN public.profiles creator ON creator.id=proc.created_by_profile_id
  CROSS JOIN LATERAL unnest(ARRAY[
    proc.created_by_profile_id::text,
    proc.created_by::text,
    creator.user_id::text
  ]) AS uploader(candidate)
  WHERE proc.id=_process_id
    AND coalesce(proc.municipality_id,proc.tenant_id)=_tenant_id
    AND candidate ~ '^[A-Za-z0-9_-]{1,128}$';

  RETURN coalesce(_principals,ARRAY[]::text[]);
END;
$function$;

REVOKE ALL ON FUNCTION public.qa_storage_recovery_principals_v1(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qa_storage_recovery_principals_v1(uuid,uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
