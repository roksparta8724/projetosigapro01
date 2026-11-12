-- SIGAPRO QA only: read-only integrity probe for ONE existing bank-sandbox DAM original.
-- Grants no table SELECT, mutation, or arbitrary object enumeration to the webhook worker.
-- Callable only through dedicated QA worker credentials; never in production.
BEGIN;
CREATE OR REPLACE FUNCTION public.qa_r2_original_integrity_probe_v1()
RETURNS TABLE(
  id uuid,
  municipality_id uuid,
  process_id uuid,
  original_pdf_key text,
  original_pdf_sha256 text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
SET row_security TO 'off'
AS $function$
  SELECT g.id,g.municipality_id,g.process_id,g.original_pdf_key,g.original_pdf_sha256
  FROM public.payment_guides g
  JOIN public.processes p ON p.id=g.process_id
  JOIN public.mp_qa_settlement_evidence_v1 qa ON qa.guide_id=g.id AND qa.municipality_id=g.municipality_id
  WHERE session_user IN ('sigapro_qa_webhook_worker','neondb_owner')
    AND g.provider_environment='test'
    AND g.payment_provider='mercado_pago'
    AND g.collection_mode_snapshot='sigapro'
    AND g.paid IS TRUE
    AND g.original_pdf_key IS NOT NULL
    AND g.original_pdf_sha256 ~ '^[a-f0-9]{64}$'
    AND p.municipality_id=g.municipality_id
    AND p.tenant_id=g.municipality_id
    AND g.original_pdf_key = 'municipalities/'||g.municipality_id||'/processes/'||
      g.process_id||'/dam-originals/'||g.id||'/'||g.original_pdf_sha256||'.pdf'
  ORDER BY g.created_at DESC
  LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.qa_r2_original_integrity_probe_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qa_r2_original_integrity_probe_v1() TO sigapro_qa_webhook_worker;
COMMIT;
