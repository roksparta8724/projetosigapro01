-- Separate shared technical PDF reading from consultation and formal signature ownership.
CREATE OR REPLACE FUNCTION public.authorize_architectural_reading_v1(_document_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public' SET row_security TO 'off'
AS $function$
 SELECT EXISTS(
   SELECT 1 FROM public.process_documents d
   JOIN public.processes p ON p.id=d.process_id
   JOIN public.profiles actor ON actor.id=public.current_profile_id()
   WHERE d.id=_document_id
    AND actor.deleted_at IS NULL AND actor.account_status='active'
    AND lower(coalesce(public.current_role_code(),'')) IN ('analista','analyst','prefeitura_supervisor')
    AND public.profile_operational_area(actor.id)='analise'
    AND actor.municipality_id=d.municipality_id
    AND d.municipality_id=coalesce(p.municipality_id,p.tenant_id)
    AND d.tenant_id=p.tenant_id AND d.is_valid IS TRUE AND d.invalidated_at IS NULL
    AND d.file_hash ~ '^[a-f0-9]{64}$' AND d.file_size_bytes>0
    AND d.file_path LIKE 'municipalities/'||d.municipality_id::text||'/%'
    AND lower(d.title) ~ 'projeto arquitet[oô]nico'
    AND public.has_process_access(p.id)
    AND public.process_technical_release_verified_v1(p.id)
    AND public.process_is_in_analysis_area(p.id)
    AND p.status NOT IN ('deferido','indeferido','arquivado')
    AND public.can_write_process_analysis(p.id)
 );
$function$;
REVOKE ALL ON FUNCTION public.authorize_architectural_reading_v1(uuid) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.authorize_architectural_reading_v1(uuid) TO authenticated;
