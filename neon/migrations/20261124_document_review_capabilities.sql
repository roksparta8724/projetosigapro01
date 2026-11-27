-- Authoritative eligibility, using the same active identity and tenant checks as the write RPC.
BEGIN;
CREATE OR REPLACE FUNCTION public.document_individual_review_capabilities_v1(_process_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public' SET row_security TO 'off'
AS $function$
DECLARE
  _profile uuid := public.current_profile_id();
  _role text := lower(coalesce(public.current_role_code(),''));
  _process public.processes%rowtype;
  _reason text;
BEGIN
  SELECT * INTO _process FROM public.processes WHERE id=_process_id;
  IF _profile IS NULL OR _process.id IS NULL OR NOT public.has_process_access(_process_id) THEN
    RETURN jsonb_build_object('document_ids','[]'::jsonb,'reason','Acesso ao processo não confirmado.');
  END IF;
  IF NOT public.process_technical_release_verified_v1(_process_id) THEN
    _reason := 'A liberação técnica do protocolo ainda não foi confirmada.';
  ELSIF _role NOT IN ('analista','analyst','prefeitura_supervisor','master_admin','master_ops','admin_master')
     OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=_profile AND p.account_status='active' AND p.deleted_at IS NULL)
     OR (NOT public.is_master() AND (
       public.profile_operational_area(_profile) IS DISTINCT FROM 'analise'
       OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=_profile AND p.municipality_id=coalesce(_process.municipality_id,_process.tenant_id))
     )) THEN
    _reason := 'O perfil ativo não pertence à equipe técnica autorizada. Administradores de consulta não podem alterar avaliações.';
  END IF;
  IF _reason IS NOT NULL THEN
    RETURN jsonb_build_object('document_ids','[]'::jsonb,'reason',_reason);
  END IF;
  RETURN jsonb_build_object('document_ids',coalesce((
    SELECT jsonb_agg(d.id ORDER BY d.id) FROM public.process_documents d
    WHERE d.process_id=_process_id AND d.tenant_id=_process.tenant_id
      AND coalesce(d.municipality_id,d.tenant_id)=coalesce(_process.municipality_id,_process.tenant_id)
      AND d.is_valid IS TRUE AND d.invalidated_at IS NULL
      AND nullif(btrim(d.file_path),'') IS NOT NULL AND d.review_status IN ('aprovado','rejeitado')
      AND NOT (coalesce(d.source,'')='prefeitura' AND d.title ~* '^Ficha Técnica( de Análise assinada| - assinada)')
      AND (NOT public.process_is_in_analysis_area(_process_id)
        OR _process.status IN ('deferido','indeferido','arquivado')
        OR (SELECT a.title FROM public.process_audit_entries a WHERE a.process_id=_process_id AND a.category='documento'
          AND a.detail LIKE '[documento:'||d.id::text||'] %'
          AND a.title IN ('Reavaliação individual aberta','Reavaliação individual aprovada','Reavaliação individual com ressalvas')
          ORDER BY a.created_at DESC,a.id DESC LIMIT 1)='Reavaliação individual aberta')
  ),'[]'::jsonb),'reason','');
END;
$function$;
REVOKE ALL ON FUNCTION public.document_individual_review_capabilities_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.document_individual_review_capabilities_v1(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
