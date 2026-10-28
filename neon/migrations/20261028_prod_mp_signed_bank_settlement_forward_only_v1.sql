-- SIGAPRO production-ready NEW-payments settlement, forward-only.
-- QA rehearsal FIRST. Apply to production only after role, migration and
-- authenticated bank-to-PDF E2E approval. Does not modify legacy guides.
-- Dedicated Postgres worker is a prerequisite. Never grant RPCs to browsers.
BEGIN;
CREATE TABLE IF NOT EXISTS public.mp_prod_signed_order_receipts_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 municipality_id uuid NOT NULL REFERENCES public.municipalities(id),
 guide_id uuid REFERENCES public.payment_guides(id),
 order_id text NOT NULL CHECK(order_id ~ '^[A-Za-z0-9_-]{6,100}$'),
 payment_id text NOT NULL CHECK(payment_id ~ '^[A-Za-z0-9_-]{6,100}$'),
 request_id text NOT NULL CHECK(request_id ~ '^[A-Za-z0-9_-]{8,128}$'),
 notification_id text NOT NULL CHECK(length(notification_id) BETWEEN 1 AND 128),
 payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[a-f0-9]{64}$'),
 signature_verified boolean NOT NULL CHECK(signature_verified=true),
 provider_fetch_succeeded boolean NOT NULL CHECK(provider_fetch_succeeded=true),
 provider_status text NOT NULL,
 provider_status_detail text NOT NULL,
 transaction_status text NOT NULL,
 transaction_status_detail text NOT NULL,
 currency text NOT NULL CHECK(currency='BRL'),
 provider_amount numeric(16,2) NOT NULL CHECK(provider_amount>0),
 verified_paid_amount numeric(16,2),
 received_at timestamptz NOT NULL DEFAULT now(),
 last_verified_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(municipality_id,order_id,request_id)
);
CREATE INDEX IF NOT EXISTS mp_prod_receipts_guide_idx
 ON public.mp_prod_signed_order_receipts_v1(municipality_id,guide_id,received_at DESC);
ALTER TABLE public.mp_prod_signed_order_receipts_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mp_prod_signed_order_receipts_v1 FROM PUBLIC,anonymous,authenticated;

CREATE TABLE IF NOT EXISTS public.mp_prod_settlement_evidence_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 municipality_id uuid NOT NULL REFERENCES public.municipalities(id),
 guide_id uuid NOT NULL UNIQUE REFERENCES public.payment_guides(id),
 receipt_id uuid NOT NULL REFERENCES public.mp_prod_signed_order_receipts_v1(id),
 provider_order_id text NOT NULL,
 provider_payment_id text NOT NULL,
 credited_amount numeric(16,2) NOT NULL CHECK(credited_amount>0),
 currency text NOT NULL CHECK(currency='BRL'),
 original_pdf_key text NOT NULL,
 original_pdf_sha256 text NOT NULL CHECK(original_pdf_sha256 ~ '^[a-f0-9]{64}$'),
 status_detail text NOT NULL CHECK(status_detail='accredited'),
 transaction_status_detail text NOT NULL CHECK(transaction_status_detail='accredited'),
 credited_verified_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(municipality_id,provider_order_id),
 UNIQUE(municipality_id,provider_payment_id)
);
ALTER TABLE public.mp_prod_settlement_evidence_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mp_prod_settlement_evidence_v1 FROM PUBLIC,anonymous,authenticated;

CREATE OR REPLACE FUNCTION public.mp_prod_webhook_connection_v1(_municipality_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog','public' SET row_security TO 'off'
AS $fn$
DECLARE c public.municipal_payment_provider_connections;
BEGIN
 SELECT p.* INTO c FROM public.municipal_payment_provider_connections p
 JOIN public.municipal_collection_configurations x
   ON x.municipality_id=p.municipality_id
 WHERE p.municipality_id=_municipality_id
  AND p.provider='mercado_pago' AND p.environment='production'
  AND p.status='active' AND p.last_test_status='ok'
  AND nullif(btrim(p.credentials_ciphertext),'') IS NOT NULL
  AND nullif(btrim(p.webhook_secret_ciphertext),'') IS NOT NULL
  AND x.mode='sigapro' AND x.environment='production' AND x.status='active'
 LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('municipality_id',c.municipality_id,
  'environment',c.environment,'provider',c.provider,
  'access_token_ciphertext',c.credentials_ciphertext,
  'webhook_secret_ciphertext',c.webhook_secret_ciphertext);
END
$fn$;

CREATE OR REPLACE FUNCTION public.mp_prod_record_accredited_order_v1(
 _municipality_id uuid,_order_id text,_payment_id text,
 _request_id text,_notification_id text,_payload_sha256 text,
 _external_reference text,_currency text,
 _order_status text,_order_detail text,_transaction_status text,
 _transaction_detail text,
 _amount numeric,_paid_amount numeric,_transaction_amount numeric,
 _transaction_paid_amount numeric,_no_refunds_or_chargebacks boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'pg_catalog','public' SET row_security TO 'off'
AS $fn$
DECLARE r public.mp_prod_signed_order_receipts_v1;
        g public.payment_guides;
        evidence public.mp_prod_settlement_evidence_v1;
        is_credit boolean;
BEGIN
 IF _municipality_id IS NULL OR
  _order_id !~ '^[A-Za-z0-9_-]{6,100}$' OR
  _payment_id !~ '^[A-Za-z0-9_-]{6,100}$' OR
  _request_id !~ '^[A-Za-z0-9_-]{8,128}$' OR
  length(coalesce(_notification_id,'')) NOT BETWEEN 1 AND 128 OR
  _payload_sha256 !~ '^[a-f0-9]{64}$' OR
  _currency IS DISTINCT FROM 'BRL' OR
  _amount IS NULL OR _amount<=0 OR
  _amount>999999999999.99
 THEN RETURN jsonb_build_object('status','manual_review','settled',false); END IF;
 IF public.mp_prod_webhook_connection_v1(_municipality_id) IS NULL
 THEN RETURN jsonb_build_object('status','bank_not_active','settled',false); END IF;

 -- The caller is a dedicated server worker that authenticated the HMAC and
 -- fetched the same order using THIS municipality's own bank access token.
 -- No RLS bypass or direct function grant is ever available to a browser.
 SELECT * INTO g FROM public.payment_guides
 WHERE municipality_id=_municipality_id AND bank_reference=_order_id
  AND bank_payment_id=_payment_id AND guide_number=_external_reference
  AND payment_provider='mercado_pago' AND provider_environment='production'
  AND collection_mode_snapshot='sigapro'
  AND process_id IS NOT NULL AND amount=_amount
 FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','guide_mismatch','settled',false); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.processes p
  WHERE p.id=g.process_id AND p.municipality_id=g.municipality_id
    AND p.tenant_id=g.municipality_id)
 THEN RETURN jsonb_build_object('status','process_mismatch','settled',false); END IF;
 -- Prohibit accidental reconciliation of a future or different guide.
 IF g.provider_charge_saved_at IS NULL OR
    g.bank_reference IS NULL OR g.bank_payment_id IS NULL
 THEN RETURN jsonb_build_object('status','charge_not_persisted','settled',false); END IF;

 is_credit:=
   _order_status='processed' AND _order_detail='accredited'
   AND _transaction_status='processed' AND _transaction_detail='accredited'
   AND coalesce(_no_refunds_or_chargebacks,false)
   AND _paid_amount IS NOT NULL AND _transaction_amount IS NOT NULL
   AND _transaction_paid_amount IS NOT NULL AND _paid_amount>0
   AND _amount=_paid_amount AND _amount=_transaction_amount
   AND _amount=_transaction_paid_amount;

 INSERT INTO public.mp_prod_signed_order_receipts_v1(
  municipality_id,guide_id,order_id,payment_id,request_id,notification_id,
  payload_sha256,signature_verified,provider_fetch_succeeded,
  provider_status,provider_status_detail,transaction_status,
  transaction_status_detail,currency,provider_amount,verified_paid_amount)
 VALUES(_municipality_id,g.id,_order_id,_payment_id,_request_id,
  _notification_id,_payload_sha256,true,true,_order_status,_order_detail,
  _transaction_status,_transaction_detail,'BRL',_amount,
  CASE WHEN is_credit THEN _paid_amount ELSE NULL END)
 ON CONFLICT(municipality_id,order_id,request_id) DO UPDATE SET
  provider_status=excluded.provider_status,
  provider_status_detail=excluded.provider_status_detail,
  transaction_status=excluded.transaction_status,
  transaction_status_detail=excluded.transaction_status_detail,
  verified_paid_amount=excluded.verified_paid_amount,
  last_verified_at=now()
 WHERE public.mp_prod_signed_order_receipts_v1.payload_sha256=excluded.payload_sha256
  AND public.mp_prod_signed_order_receipts_v1.guide_id=excluded.guide_id
  AND public.mp_prod_signed_order_receipts_v1.payment_id=excluded.payment_id
 RETURNING * INTO r;
 IF NOT FOUND THEN
   RETURN jsonb_build_object('status','receipt_conflict','settled',false); END IF;

 IF NOT is_credit THEN
  RETURN jsonb_build_object('status','awaiting_bank_credit','settled',false); END IF;
 IF g.original_pdf_key IS NULL OR g.original_pdf_sha256 IS NULL OR
   g.document_snapshot IS NULL OR
   coalesce(g.document_snapshot #>> '{guia,nonPayablePreview}','false')='true'
   OR g.original_pdf_sha256 !~ '^[a-f0-9]{64}$' OR
   g.original_pdf_key IS DISTINCT FROM (
    'municipalities/'||g.municipality_id||'/processes/'||
    g.process_id||'/dam-originals/'||g.id||'/'||g.original_pdf_sha256||'.pdf')
 THEN RETURN jsonb_build_object('status','awaiting_original_pdf','settled',false); END IF;

 IF coalesce(g.paid,false) OR
  lower(coalesce(g.status,'')) IN ('compensada','confirmed','confirmado','paid','pago')
 THEN
  IF EXISTS(SELECT 1 FROM public.mp_prod_settlement_evidence_v1 e
    WHERE e.guide_id=g.id AND e.municipality_id=g.municipality_id
    AND e.provider_order_id=_order_id AND e.provider_payment_id=_payment_id)
  THEN RETURN jsonb_build_object('status','already_settled','settled',true); END IF;
  RETURN jsonb_build_object('status','already_paid_manual_review','settled',false);
 END IF;

 INSERT INTO public.mp_prod_settlement_evidence_v1(
  municipality_id,guide_id,receipt_id,provider_order_id,
  provider_payment_id,credited_amount,currency,original_pdf_key,
  original_pdf_sha256,status_detail,transaction_status_detail)
 VALUES(_municipality_id,g.id,r.id,_order_id,_payment_id,_amount,'BRL',
  g.original_pdf_key,g.original_pdf_sha256,_order_detail,_transaction_detail)
 ON CONFLICT(guide_id) DO NOTHING RETURNING * INTO evidence;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('status','settlement_conflict','settled',false); END IF;

 UPDATE public.payment_guides
 SET paid=true,status='compensada',paid_at=now(),
  bank_status='processed',bank_status_detail='accredited',
  bank_authenticated_at=now()
 WHERE id=g.id AND paid=false AND lower(coalesce(status,'')) NOT IN
   ('compensada','confirmed','confirmado','paid','pago');
 IF NOT FOUND THEN RAISE EXCEPTION 'Concurrent bank settlement conflict'; END IF;
 -- Existing after-update protocol officialization triggers execute atomically.
 RETURN jsonb_build_object('status','settled','settled',true);
END
$fn$;

REVOKE ALL ON FUNCTION public.mp_prod_webhook_connection_v1(uuid)
 FROM PUBLIC,anonymous,authenticated;
REVOKE ALL ON FUNCTION public.mp_prod_record_accredited_order_v1(
 uuid,text,text,text,text,text,text,text,text,text,text,text,
 numeric,numeric,numeric,numeric,boolean)
 FROM PUBLIC,anonymous,authenticated;
GRANT EXECUTE ON FUNCTION public.mp_prod_webhook_connection_v1(uuid)
 TO sigapro_prod_webhook_worker;
GRANT EXECUTE ON FUNCTION public.mp_prod_record_accredited_order_v1(
 uuid,text,text,text,text,text,text,text,text,text,text,text,
 numeric,numeric,numeric,numeric,boolean)
 TO sigapro_prod_webhook_worker;
COMMIT;
