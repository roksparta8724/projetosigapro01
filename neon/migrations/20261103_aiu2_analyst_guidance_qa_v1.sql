-- SIGAPRO | Analyst-reported CA proposal (AIU-2). Only QA evidence, never legislation.
-- The untouched Quadro I OCR/source_rows remain the source of record.
BEGIN;
CREATE TABLE IF NOT EXISTS public.urban_matrix_analyst_guidance_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 municipality_id uuid NOT NULL REFERENCES public.municipalities(id) ON DELETE RESTRICT,
 batch_id uuid NOT NULL REFERENCES public.urban_matrix_batch_staging_v1(id) ON DELETE RESTRICT,
 document_sha256 text NOT NULL CHECK (document_sha256 ~ '^[0-9a-f]{64}$'),
 row_index integer NOT NULL CHECK (row_index >= 0),
 field_code text NOT NULL CHECK (field_code = 'ca_minimo_original'),
 proposed_value numeric(12,4) NOT NULL CHECK (proposed_value >= 0 AND proposed_value <= 100),
 original_ocr_text text NOT NULL CHECK (length(original_ocr_text) BETWEEN 1 AND 100),
 attribution text NOT NULL CHECK (attribution='reported_by_user_as_analyst_guidance'),
 source_note text NOT NULL CHECK (length(source_note) BETWEEN 40 AND 1200),
 status text NOT NULL DEFAULT 'pending_documentary_confirmation'
   CHECK (status = 'pending_documentary_confirmation'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE (municipality_id,batch_id,row_index,field_code)
);
CREATE INDEX IF NOT EXISTS urban_matrix_analyst_guidance_lookup_v1
 ON public.urban_matrix_analyst_guidance_v1(municipality_id,batch_id,row_index);
ALTER TABLE public.urban_matrix_analyst_guidance_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.urban_matrix_analyst_guidance_v1 FROM PUBLIC;
REVOKE ALL ON public.urban_matrix_analyst_guidance_v1 FROM authenticated;

CREATE OR REPLACE FUNCTION public.get_urban_matrix_batch_staging_v1(
  _municipality_id uuid, _batch_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public' SET row_security TO 'off'
AS $fn$
DECLARE
 _saved public.urban_matrix_batch_staging_v1%rowtype;
 _guidance jsonb;
BEGIN
 IF public.current_profile_id() IS NULL OR
    NOT public.is_urban_regulation_admin_v1(_municipality_id)
 THEN RAISE EXCEPTION 'Acesso ao rascunho historico nao autorizado.'; END IF;
 SELECT * INTO _saved FROM public.urban_matrix_batch_staging_v1
 WHERE id=_batch_id AND municipality_id=_municipality_id
   AND status='pending_legal_review';
 IF NOT FOUND THEN RETURN NULL; END IF;

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'row_index',g.row_index,
   'field_code',g.field_code,
   'proposed_value',g.proposed_value,
   'original_ocr_text',g.original_ocr_text,
   'attribution',g.attribution,
   'source_note',g.source_note,
   'status',g.status,
   'created_at',g.created_at
 ) ORDER BY g.created_at), '[]'::jsonb)
 INTO _guidance
 FROM public.urban_matrix_analyst_guidance_v1 g
 WHERE g.municipality_id=_municipality_id
   AND g.batch_id=_saved.id AND g.document_sha256=_saved.document_sha256
   AND g.status='pending_documentary_confirmation';

 RETURN jsonb_build_object(
   'id',_saved.id,'municipality_id',_saved.municipality_id,
   'document_title',_saved.document_title,
   'document_sha256',_saved.document_sha256,
   'source_municipality',_saved.source_municipality,
   'source_rows',_saved.source_rows,
   'reviewed_indexes',_saved.reviewed_indexes,
   'analyst_guidance',_guidance,
   'version',_saved.version,
   'status',_saved.status,'created_at',_saved.created_at
 );
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_urban_matrix_batch_staging_v1(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_urban_matrix_batch_staging_v1(uuid,uuid) TO authenticated;
COMMIT;
