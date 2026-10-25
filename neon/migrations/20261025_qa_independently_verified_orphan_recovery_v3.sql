-- Isolated Neon QA only. A document that is physically stored but absent from
-- process_documents is precisely what recovery is intended to repair.
-- The source of truth for delegated access must be a separately established,
-- immutable-by-browser provenance attestation, not the mutable catalog row.
-- Existing attestation rows are preserved; none are created automatically.
--
-- An object may be certified for only ONE process in its municipality.
-- This prevents a repeated filename/object key being used to authorize
-- cross-protocol reads even if a privileged reviewer makes a mistake.
CREATE UNIQUE INDEX IF NOT EXISTS qa_verified_document_key_single_process_v1
  ON public.qa_verified_document_provenance_v1 (tenant_id, object_key);

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
      SELECT array_agg(v.object_key ORDER BY v.object_key)
      FROM (
        SELECT proof.object_key
        FROM public.qa_verified_document_provenance_v1 AS proof
        WHERE proof.tenant_id=_tenant_id
          AND proof.process_id=_process_id
          AND proof.object_key LIKE ('municipalities/' || _tenant_id::text || '/%')
        ORDER BY proof.object_key
        LIMIT 1001
      ) v
    ), ARRAY[]::text[])
  END;
$function$;

CREATE OR REPLACE FUNCTION public.qa_storage_verified_file_sha_v1(
  _process_id uuid, _tenant_id uuid, _object_key text
) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
SET row_security TO 'off'
AS $function$
  SELECT CASE
    WHEN _process_id IS NULL OR _tenant_id IS NULL
      OR _object_key IS NULL OR length(_object_key) NOT BETWEEN 1 AND 850
      OR NOT public.qa_storage_process_tenant_access_v1(_process_id,_tenant_id)
    THEN NULL::text
    ELSE (
      SELECT proof.content_sha256
      FROM public.qa_verified_document_provenance_v1 proof
      WHERE proof.tenant_id=_tenant_id
        AND proof.process_id=_process_id
        AND proof.object_key=_object_key
        AND proof.object_key LIKE ('municipalities/' || _tenant_id::text || '/%')
      LIMIT 1
    )
  END;
$function$;

REVOKE ALL ON FUNCTION public.qa_storage_process_file_keys_v1(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qa_storage_process_file_keys_v1(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.qa_storage_verified_file_sha_v1(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qa_storage_verified_file_sha_v1(uuid,uuid,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
