-- QA interim CONCIDADE instruction: append-only, no change to original OCR.
BEGIN;
CREATE TABLE IF NOT EXISTS public.urban_matrix_analyst_provisional_criteria_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 guidance_id uuid NOT NULL REFERENCES public.urban_matrix_analyst_guidance_v1(id) ON DELETE RESTRICT,
 municipality_id uuid NOT NULL REFERENCES public.municipalities(id) ON DELETE RESTRICT,
 batch_id uuid NOT NULL REFERENCES public.urban_matrix_batch_staging_v1(id) ON DELETE RESTRICT,
 document_sha256 text NOT NULL CHECK(document_sha256 ~ '^[a-f0-9]{64}$'),
 version integer NOT NULL CHECK(version >= 1),
 provisional_value numeric(12,4) NOT NULL CHECK(provisional_value BETWEEN 0 AND 100),
 status text NOT NULL CHECK(status IN ('manual_only_pending_concidade','withdrawn')),
 decision_note text NOT NULL CHECK(length(decision_note) BETWEEN 40 AND 1200),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(guidance_id,version)
);
CREATE INDEX IF NOT EXISTS idx_urban_analyst_provisional_source_v1
 ON public.urban_matrix_analyst_provisional_criteria_v1 (municipality_id,batch_id,document_sha256,guidance_id);
ALTER TABLE public.urban_matrix_analyst_provisional_criteria_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.urban_matrix_analyst_provisional_criteria_v1 FROM PUBLIC, authenticated;
CREATE OR REPLACE FUNCTION public.get_urban_matrix_batch_staging_v1(_municipality_id uuid, _batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
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
   'provisional_manual_value',(SELECT c.provisional_value FROM public.urban_matrix_analyst_provisional_criteria_v1 c WHERE c.guidance_id=g.id AND c.municipality_id=g.municipality_id AND c.batch_id=g.batch_id AND c.document_sha256=g.document_sha256 ORDER BY c.version DESC LIMIT 1),
   'provisional_status',(SELECT c.status FROM public.urban_matrix_analyst_provisional_criteria_v1 c WHERE c.guidance_id=g.id AND c.municipality_id=g.municipality_id AND c.batch_id=g.batch_id AND c.document_sha256=g.document_sha256 ORDER BY c.version DESC LIMIT 1),
   'provisional_note',(SELECT c.decision_note FROM public.urban_matrix_analyst_provisional_criteria_v1 c WHERE c.guidance_id=g.id AND c.municipality_id=g.municipality_id AND c.batch_id=g.batch_id AND c.document_sha256=g.document_sha256 ORDER BY c.version DESC LIMIT 1),
   'provisional_version',(SELECT c.version FROM public.urban_matrix_analyst_provisional_criteria_v1 c WHERE c.guidance_id=g.id AND c.municipality_id=g.municipality_id AND c.batch_id=g.batch_id AND c.document_sha256=g.document_sha256 ORDER BY c.version DESC LIMIT 1),
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
$function$;
NOTIFY pgrst,'reload schema';
COMMIT;
