-- SIGAPRO IA | Quadro II — machine-extracted source evidence in QA only.
-- This is a quarantined candidate layer, not draft entries, legal versions or AI input.
BEGIN;
CREATE TABLE IF NOT EXISTS public.urban_quadro_ii_source_evidence_v1 (
  municipality_id uuid NOT NULL REFERENCES public.municipalities(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES public.urban_matrix_batch_staging_v1(id) ON DELETE RESTRICT,
  document_sha256 text NOT NULL CHECK(document_sha256 ~ '^[0-9a-f]{64}$'),
  page_number integer NOT NULL CHECK(page_number BETWEEN 38 AND 51),
  extracted_text text NOT NULL CHECK(length(extracted_text) BETWEEN 20 AND 9000),
  source_quality text NOT NULL CHECK(source_quality IN ('machine_unverified','visual_required')),
  proposals jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(proposals)='array'),
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(municipality_id,batch_id,page_number)
);
CREATE INDEX IF NOT EXISTS urban_quadro_ii_evidence_by_pdf_v1
 ON public.urban_quadro_ii_source_evidence_v1(municipality_id,document_sha256,page_number);
ALTER TABLE public.urban_quadro_ii_source_evidence_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.urban_quadro_ii_source_evidence_v1 FROM PUBLIC;
REVOKE ALL ON public.urban_quadro_ii_source_evidence_v1 FROM authenticated;

CREATE OR REPLACE FUNCTION public.list_urban_quadro_ii_workspace_v1(_municipality_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public' SET row_security TO 'off'
AS $fn$
DECLARE
 _batch public.urban_matrix_batch_staging_v1%rowtype;
 _last_action text;
 _pages jsonb;
 _entries jsonb;
BEGIN
 IF public.current_profile_id() IS NULL OR NOT public.is_urban_regulation_admin_v1(_municipality_id)
 THEN RAISE EXCEPTION 'Acesso ao Quadro II nao autorizado para esta prefeitura.'; END IF;
 SELECT * INTO _batch FROM public.urban_matrix_batch_staging_v1
 WHERE municipality_id=_municipality_id AND document_sha256 ~ '^[0-9a-f]{64}$'
 ORDER BY created_at DESC,id DESC LIMIT 1;
 IF NOT FOUND THEN
   RETURN jsonb_build_object('status','no_source','pages','[]'::jsonb,'entries','[]'::jsonb);
 END IF;
 SELECT action INTO _last_action FROM public.urban_matrix_reading_audit_v2
  WHERE municipality_id=_municipality_id AND batch_id=_batch.id AND row_index IS NULL
  ORDER BY created_at DESC,id DESC LIMIT 1;
 IF _last_action='archive' THEN
   RETURN jsonb_build_object('status','archived_source','document_title',_batch.document_title,
     'pages','[]'::jsonb,'entries','[]'::jsonb);
 END IF;
 SELECT jsonb_agg(jsonb_build_object('page_number',p,
   'source_evidence_text',(SELECT e.extracted_text FROM public.urban_quadro_ii_source_evidence_v1 e
      WHERE e.municipality_id=_municipality_id AND e.batch_id=_batch.id AND e.document_sha256=_batch.document_sha256
        AND e.page_number=p),
   'source_quality',(SELECT e.source_quality FROM public.urban_quadro_ii_source_evidence_v1 e
      WHERE e.municipality_id=_municipality_id AND e.batch_id=_batch.id AND e.document_sha256=_batch.document_sha256
        AND e.page_number=p),
   'proposals',COALESCE((SELECT e.proposals FROM public.urban_quadro_ii_source_evidence_v1 e
      WHERE e.municipality_id=_municipality_id AND e.batch_id=_batch.id AND e.document_sha256=_batch.document_sha256
        AND e.page_number=p),'[]'::jsonb),
   'topic',CASE
     WHEN p BETWEEN 38 AND 40 THEN 'Institucional'
     WHEN p BETWEEN 41 AND 42 THEN 'Industrial'
     WHEN p BETWEEN 43 AND 46 THEN 'Serviços'
     WHEN p BETWEEN 47 AND 50 THEN 'Comercial'
     ELSE 'Parcelamento do solo'
   END,
   'visual_warning',p=43,
   'draft_count',(SELECT COUNT(*) FROM public.urban_quadro_ii_draft_entries_v1 e
     WHERE e.municipality_id=_municipality_id AND e.batch_id=_batch.id
       AND e.page_number=p)
 ) ORDER BY p) INTO _pages FROM generate_series(38,51) p;
 SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.page_number,r.created_at), '[]'::jsonb)
 INTO _entries FROM (
    SELECT id,page_number,category_code,use_description,
     permitted_zones_text,road_hierarchy_text,parking_requirement_text,
     special_conditions_text,source_excerpt,status,created_by_profile_id,created_at
    FROM public.urban_quadro_ii_draft_entries_v1
    WHERE municipality_id=_municipality_id AND batch_id=_batch.id
    ORDER BY page_number,created_at LIMIT 500
 ) r;
 RETURN jsonb_build_object('status','pending_legal_review','batch_id',_batch.id,
  'document_title',_batch.document_title,'document_sha256',_batch.document_sha256,
  'pages',COALESCE(_pages,'[]'::jsonb),'entries',COALESCE(_entries,'[]'::jsonb),
  'legal_approval',false,'ready_for_ai',false);
END;
$fn$;
COMMIT;
