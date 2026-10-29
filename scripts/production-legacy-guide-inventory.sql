-- SIGAPRO municipal production legacy-guide release inventory
-- READ ONLY. Neither this SQL nor its caller applies migrations or repairs payments.
-- Run on explicit Neon branch IDs (the database name is shared by QA/production).
-- One aggregate row; no owner names, taxpayer documents, guide numbers or credentials.
WITH guides AS (
  SELECT g.id,g.process_id,g.municipality_id,g.guide_number,
    COALESCE(g.paid,false) AS paid_flag,
    LOWER(COALESCE(g.status,'')) IN ('compensada','paid','pago','confirmed','confirmado') AS paid_status,
    NULLIF(BTRIM(COALESCE(to_jsonb(g)->>'original_pdf_key','')),'') AS archived_key
  FROM public.payment_guides g
), settled AS (
  SELECT g.*,
    (g.paid_flag OR g.paid_status) AS is_settled,
    EXISTS (
      SELECT 1 FROM public.process_documents d
      WHERE d.process_id=g.process_id
        AND d.municipality_id IS NOT DISTINCT FROM g.municipality_id
        AND d.file_path IS NOT NULL AND BTRIM(d.file_path)<>''
        AND LOWER(COALESCE(d.mime_type,''))='application/pdf'
        AND (
          d.file_name ILIKE '%'||g.guide_number||'%'
          OR d.title ILIKE '%'||g.guide_number||'%'
        )
    ) AS exact_named_legacy_pdf
  FROM guides g
), metrics AS (
  SELECT
    COUNT(*)::int AS total_guides,
    COUNT(*) FILTER(WHERE is_settled)::int AS settled_guides,
    COUNT(*) FILTER(WHERE is_settled AND NOT paid_flag)::int AS status_settled_but_paid_flag_false,
    COUNT(*) FILTER(WHERE is_settled AND (process_id IS NULL OR municipality_id IS NULL))::int AS settled_missing_process_or_tenant,
    COUNT(*) FILTER(WHERE is_settled AND process_id IS NOT NULL AND municipality_id IS NOT NULL)::int AS settled_linked_guides,
    COUNT(*) FILTER(WHERE is_settled AND archived_key IS NOT NULL)::int AS settled_archived_originals,
    COUNT(*) FILTER(WHERE is_settled AND archived_key IS NULL AND exact_named_legacy_pdf)::int AS settled_exact_legacy_pdf_candidates,
    COUNT(*) FILTER(WHERE is_settled AND archived_key IS NULL AND NOT exact_named_legacy_pdf)::int AS settled_without_matched_original,
    COUNT(*) FILTER(WHERE is_settled AND guide_number IS NULL)::int AS settled_missing_guide_number
  FROM settled
), functions AS (
  SELECT
    to_regprocedure('public.get_payment_guide_original_v1(uuid,text)') IS NOT NULL AS original_read_available,
    to_regprocedure('public.freeze_payment_guide_document_v1(uuid,text,jsonb)') IS NOT NULL AS original_freeze_available,
    to_regprocedure('public.attach_payment_guide_original_v1(uuid,text,text,text)') IS NOT NULL AS original_attach_available
)
SELECT metrics.*, functions.*,
 CASE WHEN
   metrics.status_settled_but_paid_flag_false>0
   OR metrics.settled_missing_process_or_tenant>0
   OR metrics.settled_without_matched_original>0
   OR NOT functions.original_read_available
   OR NOT functions.original_freeze_available
   OR NOT functions.original_attach_available
 THEN 'RELEASE_RECONCILIATION_REQUIRED'
 ELSE 'HISTORICAL_GUIDE_GATE_OK' END AS release_gate
FROM metrics CROSS JOIN functions;
