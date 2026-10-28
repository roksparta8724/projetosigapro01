-- QA EXCLUSIVE: only br-solitary-sound-b4xlbvs6, NEVER official production.
-- Restore an accredited signed webhook after a legitimate document archive.
-- No new order/charge and no mutation of existing financial rows here.
BEGIN;

CREATE OR REPLACE FUNCTION public.qa_authorize_guide_reconciliation_v1(
 _municipality_id uuid,_guide_code text,_bank_reference text
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public' SET row_security TO 'off'
AS $fn$
DECLARE g public.payment_guides;
BEGIN
 IF public.current_profile_id() IS NULL OR _municipality_id IS NULL
   OR _guide_code !~ '^DAM-PRE-[A-Za-z0-9-]{8,100}$'
   OR NOT public.has_tenant_access(_municipality_id)
 THEN RETURN false; END IF;

 SELECT * INTO g FROM public.payment_guides
 WHERE municipality_id=_municipality_id AND guide_number=_guide_code;
 IF NOT FOUND OR g.process_id IS NULL OR
   NOT public.has_process_access(g.process_id) OR
   g.collection_mode_snapshot IS DISTINCT FROM 'sigapro' OR
   g.provider_environment IS DISTINCT FROM 'test' OR
   g.payment_provider IS DISTINCT FROM 'mercado_pago' OR
   g.bank_reference IS DISTINCT FROM _bank_reference OR
   g.bank_payment_id IS NULL OR
   g.document_snapshot IS NULL OR
   g.original_pdf_key IS NULL OR g.original_pdf_sha256 IS NULL OR
   g.original_pdf_sha256 !~ '^[a-f0-9]{64}$' OR
   g.original_pdf_key IS DISTINCT FROM
     ('municipalities/'||g.municipality_id||'/processes/'||
      g.process_id||'/dam-originals/'||g.id||'/'||g.original_pdf_sha256||'.pdf') OR
   coalesce(g.paid,false) OR
   lower(coalesce(g.status,'')) IN
     ('compensada','paid','pago','confirmed','confirmado') OR
   NOT EXISTS (
    SELECT 1 FROM public.processes pr
    WHERE pr.id=g.process_id
      AND pr.municipality_id=g.municipality_id
      AND pr.tenant_id=g.municipality_id
   ) OR NOT EXISTS (
    SELECT 1 FROM public.mp_qa_pix_orders_v1 o
    WHERE o.guide_id=g.id AND o.municipality_id=g.municipality_id
      AND o.order_id=g.bank_reference AND o.payment_id=g.bank_payment_id
      AND o.amount=g.amount AND o.state='issued' AND o.qr_code=g.pix_code
   )
 THEN RETURN false; END IF;
 RETURN true;
END
$fn$;

-- A logged-in browser can only ask whether its own archived guide is eligible.
-- It must never see the provider token, HMAC key or original signed webhook.
REVOKE ALL ON FUNCTION public.qa_authorize_guide_reconciliation_v1(
 uuid,text,text) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.qa_authorize_guide_reconciliation_v1(
 uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.mp_qa_webhook_signed_receipt_v1(
 _municipality_id uuid,_order_id text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public' SET row_security TO 'off'
AS $fn$
DECLARE e public.mp_webhook_order_events_v1;
BEGIN
 IF _municipality_id IS NULL OR
   _order_id !~ '^[A-Za-z0-9_-]{6,100}$' OR
   NOT EXISTS (
     SELECT 1 FROM public.payment_guides g
     JOIN public.mp_qa_pix_orders_v1 o ON o.guide_id=g.id
     WHERE g.municipality_id=_municipality_id
       AND g.bank_reference=_order_id
       AND g.bank_payment_id=o.payment_id
       AND g.payment_provider='mercado_pago'
       AND g.provider_environment='test'
       AND g.collection_mode_snapshot='sigapro'
       AND o.municipality_id=_municipality_id
       AND o.order_id=_order_id
       AND o.state='issued'
   )
 THEN RETURN NULL; END IF;
 SELECT * INTO e FROM public.mp_webhook_order_events_v1
 WHERE municipality_id=_municipality_id AND order_id=_order_id
   AND signature_verified=true AND first_received_at <= now()
 ORDER BY first_received_at DESC,id DESC LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('request_id',e.request_id,
   'notification_id',e.notification_id,'payload_sha256',e.payload_sha256);
END
$fn$;

REVOKE ALL ON FUNCTION public.mp_qa_webhook_signed_receipt_v1(
 uuid,text) FROM PUBLIC,authenticated,anonymous;
GRANT EXECUTE ON FUNCTION public.mp_qa_webhook_signed_receipt_v1(
 uuid,text) TO sigapro_qa_webhook_worker;
COMMIT;
