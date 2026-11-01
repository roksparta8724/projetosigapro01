-- SIGAPRO 2026-11-01: QA-only strict, evidence-backed process precheck.
-- Apply to isolated Neon QA branch after validation; NEVER activate historical
-- matrix imports, modify user accounts or loosen process permissions.
CREATE OR REPLACE FUNCTION public.save_urban_precheck_run_v6(
 _process_id uuid, _regulation_version_id uuid, _reference_date date,
 _measurements jsonb, _legal_review jsonb, _request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
SET row_security TO 'off'
AS $function$
DECLARE
 _version public.urban_regulation_versions%rowtype;
 _ids jsonb;
 _note text;
 _count integer;
BEGIN
 -- Accept only an explicit human review with traceable legal scope IDs.
 IF _process_id IS NULL OR _regulation_version_id IS NULL OR _reference_date IS NULL
    OR _request_id IS NULL OR _legal_review IS NULL
    OR jsonb_typeof(_legal_review)<>'object'
    OR jsonb_typeof(_legal_review->'evidence_ids') IS DISTINCT FROM 'array'
    OR coalesce((_legal_review->>'document_scope_confirmed')::boolean,false) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Conferência legal obrigatória e autenticada.'; END IF;
 _ids:=_legal_review->'evidence_ids';
 _note:=btrim(coalesce(_legal_review->>'note',''));
 _count:=jsonb_array_length(_ids);
 IF _count<1 OR _count>50 OR length(_note)<20 OR length(_note)>1200
 THEN RAISE EXCEPTION 'Fontes legais e declaração humana incompletas.'; END IF;
 SELECT * INTO _version FROM public.urban_regulation_versions
   WHERE id=_regulation_version_id AND status='active'
     AND effective_from<=_reference_date;
 IF NOT FOUND OR _version.municipality_id IS NULL
 THEN RAISE EXCEPTION 'Somente regra ativa na data pode fundamentar a conferência.'; END IF;
 IF jsonb_typeof(_version.rules)<>'array' OR jsonb_array_length(_version.rules)<1
 THEN RAISE EXCEPTION 'Norma não possui índices auditáveis.'; END IF;
 -- No duplicate, malformed, out-of-tenant, wrong zone/use, inactive or
 -- unverified scope ID may enter a signed-off advisory precheck.
 IF EXISTS (
  SELECT 1 FROM jsonb_array_elements_text(_ids) requested(value)
  WHERE requested.value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 ) OR (
   SELECT count(DISTINCT requested.value) FROM jsonb_array_elements_text(_ids) requested(value)
 )<>_count
 THEN RAISE EXCEPTION 'Identificadores de evidência inválidos ou duplicados.'; END IF;
 IF EXISTS (
  SELECT 1 FROM jsonb_array_elements_text(_ids) requested(value)
  LEFT JOIN public.urban_legal_evidence_scopes s
    ON s.id=requested.value::uuid AND s.municipality_id=_version.municipality_id
    AND upper(btrim(s.zone_code))=upper(btrim(_version.zone_code))
    AND upper(btrim(s.use_code))=upper(btrim(_version.use_code))
    AND s.effective_from<=_reference_date
    AND (s.effective_until IS NULL OR s.effective_until>=_reference_date)
    AND s.verification_method IN ('text_layer_verified','visual_double_transcription','browser_ocr_human_verified')
  LEFT JOIN public.urban_legal_evidence_catalog e
    ON e.id=s.evidence_id AND e.municipality_id=s.municipality_id
    AND e.document_sha256 ~* '^[0-9a-f]{64}$'
    AND e.page_number>0 AND length(btrim(e.document_title))>=4
    AND length(btrim(e.excerpt))>=8
  WHERE e.id IS NULL OR NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(_version.rules) m(rule)
    WHERE m.rule->>'metric'=e.metric
  )
 ) THEN RAISE EXCEPTION 'Referência legal incompatível com município, zona, uso, vigência ou índice.'; END IF;
 -- COMPLETE metric coverage; one unrelated citation does not cover all indices.
 IF EXISTS (
  SELECT 1 FROM jsonb_array_elements(_version.rules) m(rule)
  WHERE NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(_ids) requested(value)
    JOIN public.urban_legal_evidence_scopes s
      ON s.id=requested.value::uuid AND s.municipality_id=_version.municipality_id
    JOIN public.urban_legal_evidence_catalog e
      ON e.id=s.evidence_id AND e.municipality_id=s.municipality_id
    WHERE e.metric=m.rule->>'metric'
  )
 ) THEN RAISE EXCEPTION 'Há índices sem evidência legal individual vinculada.'; END IF;
 -- v5 enforces assigned analyst/director, process tenant, version consistency,
 -- idempotency, numeric measurements and original writer history.
 RETURN public.save_urban_precheck_run_v5(
   _process_id,_regulation_version_id,_reference_date,
   _measurements,_legal_review,_request_id
 );
END;
$function$;
REVOKE ALL ON FUNCTION public.save_urban_precheck_run_v6(uuid,uuid,date,jsonb,jsonb,uuid) FROM PUBLIC;
-- QA Neon has no explicit anon role. PUBLIC includes all ungranted roles.
GRANT EXECUTE ON FUNCTION public.save_urban_precheck_run_v6(uuid,uuid,date,jsonb,jsonb,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
