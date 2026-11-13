-- Legal Quadro II categories include punctuation (S1.1, C2.3).
-- Maintain exact category codes instead of silently converting dots to underscores.
-- The import remains a reviewed DRAFT; never grants use permission or AI approval.
BEGIN;
ALTER TABLE public.urban_legal_matrix_imports
 DROP CONSTRAINT urban_matrix_use_valid;
ALTER TABLE public.urban_legal_matrix_imports
 ADD CONSTRAINT urban_matrix_use_valid CHECK(use_code ~ '^[A-Z0-9_. -]{1,60}$');
CREATE OR REPLACE FUNCTION public.save_urban_legal_matrix_import_v1(
 _municipality_id uuid, _document_title text, _document_sha256 text,
 _page_number integer, _quadro text, _zone_code text, _use_code text,
 _effective_from date, _source_excerpt text, _reviewed_entries jsonb,
 _verification_method text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
SET row_security TO 'off'
AS $body$
DECLARE
 _zone text := upper(btrim(coalesce(_zone_code,'')));
 _use text := upper(btrim(coalesce(_use_code,'')));
 _ver integer;
 _new_id uuid;
 _actor uuid := public.current_profile_id();
BEGIN
 IF public.current_role_code() IS DISTINCT FROM 'prefeitura_admin'
    OR NOT public.has_tenant_access(_municipality_id) OR _actor IS NULL THEN
   RAISE EXCEPTION 'Somente administração municipal autenticada pode revisar importações.';
 END IF;
 IF char_length(btrim(coalesce(_document_title,''))) NOT BETWEEN 4 AND 180
   OR coalesce(_document_sha256,'') !~ '^[0-9a-f]{64}$'
   OR coalesce(_page_number,0) NOT BETWEEN 1 AND 10000
   OR _quadro NOT IN ('I','II')
   OR _zone !~ '^[A-Z0-9_()/.-]{1,40}$'
   OR _use !~ '^[A-Z0-9_. -]{1,60}$'
   OR _effective_from IS NULL
   OR char_length(btrim(coalesce(_source_excerpt,''))) NOT BETWEEN 20 AND 6000
   OR _verification_method NOT IN ('text_layer_verified','visual_double_transcription')
   OR coalesce(jsonb_typeof(_reviewed_entries),'null') <> 'array'
   OR jsonb_array_length(_reviewed_entries) NOT BETWEEN 1 AND 16
   OR pg_column_size(_reviewed_entries)>20000 THEN
   RAISE EXCEPTION 'Fonte oficial, data, hash, transcrição e parâmetros conferidos são obrigatórios.';
 END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(_reviewed_entries) e
   WHERE jsonb_typeof(e)<>'object'
      OR coalesce(e->>'source_excerpt','')=''
      OR char_length(e->>'source_excerpt')>500
      OR position(e->>'source_excerpt' in _source_excerpt)=0
      OR coalesce(e->>'kind','') NOT IN ('numeric_index','use_condition')
      OR (_quadro='I' AND e->>'kind'<>'numeric_index')
      OR (_quadro='II' AND e->>'kind'<>'use_condition')
 ) THEN RAISE EXCEPTION 'Cada linha da matriz deve conter citação literal do trecho original.';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtext(_municipality_id::text),hashtext(_zone||'/'||_use||'/'||_quadro));
 SELECT coalesce(max(version),0)+1 INTO _ver FROM public.urban_legal_matrix_imports
 WHERE municipality_id=_municipality_id AND zone_code=_zone AND use_code=_use AND quadro=_quadro;
 INSERT INTO public.urban_legal_matrix_imports (
  municipality_id,document_title,document_sha256,page_number,quadro,
  zone_code,use_code,effective_from,source_excerpt,reviewed_entries,
  verification_method,version,reviewed_by_profile_id
 ) VALUES (
  _municipality_id,btrim(_document_title),_document_sha256,_page_number,_quadro,
  _zone,_use,_effective_from,btrim(_source_excerpt),_reviewed_entries,
  _verification_method,_ver,_actor
 ) RETURNING id INTO _new_id;
 RETURN jsonb_build_object('id',_new_id,'version',_ver,'status','reviewed_draft');
END;
$body$;
NOTIFY pgrst,'reload schema';
COMMIT;
