-- SIGAPRO QA: activation gate with evidence for EVERY metric of the exact version.
-- This operation does not activate anything; only the authorized administrator
-- may call the new function, which reuses the transaction-safe v1 activation.
CREATE OR REPLACE FUNCTION public.activate_urban_regulation_v2(_version_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
SET row_security TO 'off'
AS $function$
DECLARE _v public.urban_regulation_versions%rowtype;
BEGIN
 SELECT * INTO _v FROM public.urban_regulation_versions
 WHERE id=_version_id AND status='draft' FOR SHARE;
 IF NOT FOUND OR _v.municipality_id IS NULL OR
    NOT public.is_urban_regulation_admin_v1(_v.municipality_id) OR
    public.current_profile_id() IS NULL THEN
  RAISE EXCEPTION 'Regra inexistente ou perfil sem permissão municipal para ativar.';
 END IF;
 IF jsonb_typeof(_v.rules)<>'array' OR jsonb_array_length(_v.rules)<1 THEN
  RAISE EXCEPTION 'Regras vazias: não é possível ativar.';
 END IF;
 IF EXISTS (
  SELECT 1 FROM jsonb_array_elements(_v.rules) r(rule)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.urban_legal_evidence_scopes s
    JOIN public.urban_legal_evidence_catalog e
      ON e.id=s.evidence_id AND e.municipality_id=s.municipality_id
    WHERE s.municipality_id=_v.municipality_id
      AND upper(btrim(s.zone_code))=upper(btrim(_v.zone_code))
      AND upper(btrim(s.use_code))=upper(btrim(_v.use_code))
      AND e.metric=r.rule->>'metric'
      AND s.effective_from<=_v.effective_from
      AND (s.effective_until IS NULL OR s.effective_until>=_v.effective_from)
      AND s.verification_method IN ('text_layer_verified','visual_double_transcription')
      AND e.document_sha256 ~* '^[0-9a-f]{64}$'
      AND e.page_number>0 AND length(btrim(e.excerpt))>=15
  )
 ) THEN RAISE EXCEPTION 'EVIDENCIA_LEGAL_INCOMPLETA: vincule a fonte original, página e vigência para todos os índices antes de ativar.'; END IF;
 -- Recheck lock, chronology, status and actor in the official activation writer.
 RETURN public.activate_urban_regulation_v1(_version_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.activate_urban_regulation_v2(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_urban_regulation_v2(uuid) TO authenticated;
-- Remove direct use of the older evidence-free activation path on QA.
-- SECURITY DEFINER v2 can still invoke v1 as its owner.
REVOKE ALL ON FUNCTION public.activate_urban_regulation_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activate_urban_regulation_v1(uuid) FROM authenticated;
NOTIFY pgrst,'reload schema';
