-- SIGAPRO QA — register verified legal text against the exact version and metric.
-- No automatic law activation or project compliance. Allow actual single-zone
-- codes such as ZM-B(e); composite cells must be split only after official review.
CREATE OR REPLACE FUNCTION public.save_urban_legal_evidence_scoped_v4(
 _regulation_version_id uuid,
 _document_title text,
 _document_sha256 text,
 _page_number integer,
 _metric text,
 _excerpt text,
 _effective_from date,
 _effective_until date,
 _verification_method text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
SET row_security TO 'off'
AS $function$
DECLARE
 _version public.urban_regulation_versions%rowtype;
 _evidence jsonb;
 _evidence_id uuid;
 _scope_id uuid;
 _zone text;
 _use text;
BEGIN
 SELECT * INTO _version FROM public.urban_regulation_versions
 WHERE id=_regulation_version_id AND status IN ('draft','active') FOR SHARE;
 IF NOT FOUND OR _version.municipality_id IS NULL OR
    NOT public.is_urban_regulation_admin_v1(_version.municipality_id) OR
    public.current_profile_id() IS NULL THEN
  RAISE EXCEPTION 'Somente o administrador desta prefeitura pode registrar evidências de uma versão válida.';
 END IF;
 _zone:=upper(btrim(_version.zone_code));
 _use:=upper(btrim(_version.use_code));
 -- The previous v2 regex rejected genuine parenthesized zones.
 -- Never accept comma-separated/composite zones or free-form punctuation.
 IF _zone !~ '^[A-Z0-9][A-Z0-9._/-]{0,39}(\([A-Z0-9]{1,12}\))?$'
   OR length(_zone)>40
   OR _use !~ '^[A-Z0-9][A-Z0-9_ -]{0,59}$'
   OR _verification_method NOT IN
     ('text_layer_verified','visual_double_transcription')
   OR _effective_from IS NULL
   OR (_effective_until IS NOT NULL AND _effective_until<_effective_from)
   OR NOT EXISTS (
     SELECT 1 FROM jsonb_array_elements(_version.rules) r(rule)
     WHERE r.rule->>'metric'=_metric
   ) THEN
  RAISE EXCEPTION 'Zona individual, uso, métrica, método ou vigência incompatíveis com a regra.';
 END IF;
 _evidence:=public.save_urban_legal_evidence_v1(
  _version.municipality_id,_document_title,_document_sha256,
  _page_number,_metric,_excerpt
 );
 _evidence_id:=(_evidence->>'id')::uuid;
 IF _evidence_id IS NULL THEN RAISE EXCEPTION 'Documento não registrado no acervo.'; END IF;
 INSERT INTO public.urban_legal_evidence_scopes(
   evidence_id,municipality_id,zone_code,use_code,effective_from,effective_until,
   confirmed_by_profile_id,verification_method
 ) VALUES (
   _evidence_id,_version.municipality_id,_zone,_use,
   _effective_from,_effective_until,public.current_profile_id(),_verification_method
 )
 ON CONFLICT (evidence_id,municipality_id,zone_code,use_code,effective_from)
 DO UPDATE SET
   effective_until=excluded.effective_until,
   verification_method=excluded.verification_method,
   confirmed_by_profile_id=excluded.confirmed_by_profile_id
 RETURNING id INTO _scope_id;
 IF _scope_id IS NULL THEN RAISE EXCEPTION 'Falha ao vincular fonte legal à versão.'; END IF;
 RETURN jsonb_build_object(
   'id',_scope_id,'status','verified_evidence',
   'municipality_id',_version.municipality_id,
   'metric',_metric,'zone_code',_zone,'use_code',_use,
   'document_sha256',_document_sha256,'page_number',_page_number,
   'automated_approval',false
 );
END
$function$;
REVOKE ALL ON FUNCTION public.save_urban_legal_evidence_scoped_v4(uuid,text,text,integer,text,text,date,date,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_urban_legal_evidence_scoped_v4(uuid,text,text,integer,text,text,date,date,text) TO authenticated;
NOTIFY pgrst,'reload schema';
