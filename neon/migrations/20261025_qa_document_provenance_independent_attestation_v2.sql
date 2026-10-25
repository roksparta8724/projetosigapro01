-- QA ISOLATED ONLY. A row in process_documents is writable through the
-- regular process workflow and cannot, by itself, prove the origin of an
-- object in an applicant's personal folder. file_hash may be derived from
-- the path/name rather than the uploaded bytes.
--
-- This independent attestation is intentionally NOT writable by the browser,
-- client RPCs or the authenticated role. It may be populated ONLY after a
-- privileged, separately audited verification of original storage bytes and
-- the actual process relationship. No legacy rows are auto-attested.
CREATE TABLE IF NOT EXISTS public.qa_verified_document_provenance_v1 (
  tenant_id uuid NOT NULL,
  process_id uuid NOT NULL,
  object_key text NOT NULL,
  content_sha256 text NOT NULL,
  attested_at timestamptz NOT NULL DEFAULT now(),
  attestation_method text NOT NULL,
  PRIMARY KEY(tenant_id,process_id,object_key),
  CONSTRAINT qa_verified_object_key_size CHECK (
    length(object_key) BETWEEN 1 AND 850 AND
    object_key LIKE 'municipalities/%' AND
    object_key NOT LIKE '%..%'
  ),
  CONSTRAINT qa_verified_sha256_format CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT qa_attestation_method_required CHECK (length(btrim(attestation_method)) > 5)
);
ALTER TABLE public.qa_verified_document_provenance_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.qa_verified_document_provenance_v1 FROM PUBLIC;
REVOKE ALL ON TABLE public.qa_verified_document_provenance_v1 FROM authenticated;

-- No role usable by the app can self-issue a provenance attestation.
-- Only verified keys already catalogued under THIS process are listed.
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
      SELECT array_agg(d.file_path ORDER BY d.file_path)
      FROM (
        SELECT DISTINCT doc.file_path
        FROM public.process_documents doc
        INNER JOIN public.qa_verified_document_provenance_v1 proof
          ON proof.tenant_id=doc.tenant_id
         AND proof.process_id=doc.process_id
         AND proof.object_key=doc.file_path
        WHERE doc.process_id=_process_id
          AND doc.tenant_id=_tenant_id
          AND doc.is_valid=true
          AND doc.file_path LIKE 'municipalities/%'
        ORDER BY doc.file_path LIMIT 1001
      ) d
    ), ARRAY[]::text[])
  END;
$function$;

-- Returned only for the exact process and key and only if a separate
-- byte-level attestation exists; never trust process_documents.file_hash.
CREATE OR REPLACE FUNCTION public.qa_storage_verified_file_sha_v1(
  _process_id uuid, _tenant_id uuid, _object_key text
) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
SET row_security TO 'off'
AS $function$
  SELECT CASE
    WHEN _process_id IS NULL OR _tenant_id IS NULL OR _object_key IS NULL
      OR NOT public.qa_storage_process_tenant_access_v1(_process_id,_tenant_id)
    THEN NULL::text
    ELSE (
      SELECT proof.content_sha256
      FROM public.qa_verified_document_provenance_v1 proof
      JOIN public.process_documents doc
        ON doc.tenant_id=proof.tenant_id
       AND doc.process_id=proof.process_id
       AND doc.file_path=proof.object_key
      WHERE proof.tenant_id=_tenant_id
        AND proof.process_id=_process_id
        AND proof.object_key=_object_key
        AND doc.is_valid=true
      LIMIT 1
    )
  END;
$function$;

REVOKE ALL ON FUNCTION public.qa_storage_process_file_keys_v1(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qa_storage_process_file_keys_v1(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.qa_storage_verified_file_sha_v1(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qa_storage_verified_file_sha_v1(uuid,uuid,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
