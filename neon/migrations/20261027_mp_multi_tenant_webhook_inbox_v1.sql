-- SIGAPRO · tenant-isolated Mercado Pago order notifications (2026-10-27)
-- Each municipality keeps its own provider token, webhook signature, and order history.
-- Financial rows are NEVER updated by this migration or webhook inbox.
BEGIN;
CREATE TABLE IF NOT EXISTS public.mp_webhook_order_events_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 municipality_id uuid NOT NULL REFERENCES public.municipalities(id) ON DELETE RESTRICT,
 order_id text NOT NULL,
 request_id text NOT NULL,
 notification_id text NOT NULL,
 payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
 signature_verified boolean NOT NULL DEFAULT true CHECK (signature_verified),
 provider_fetch_succeeded boolean NOT NULL DEFAULT false,
 provider_status text,
 external_reference text,
 currency text,
 provider_amount numeric(16,2),
 guide_id uuid REFERENCES public.payment_guides(id) ON DELETE RESTRICT,
 reconciliation_status text NOT NULL CHECK (reconciliation_status IN
  ('verified_manual_review','unmatched_manual_review','bank_fetch_failed')),
 first_received_at timestamptz NOT NULL DEFAULT now(),
 last_received_at timestamptz NOT NULL DEFAULT now(),
 attempt_count integer NOT NULL DEFAULT 1 CHECK(attempt_count BETWEEN 1 AND 1000000),
 UNIQUE (municipality_id,order_id,request_id),
 CHECK (length(order_id) BETWEEN 6 AND 100),
 CHECK (length(request_id) BETWEEN 8 AND 128),
 CHECK (length(notification_id) BETWEEN 1 AND 128)
);
CREATE INDEX IF NOT EXISTS idx_mp_webhook_events_municipality_received
 ON public.mp_webhook_order_events_v1 (municipality_id,first_received_at DESC);
ALTER TABLE public.mp_webhook_order_events_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mp_webhook_order_events_v1 FROM PUBLIC,anonymous,authenticated;

CREATE OR REPLACE FUNCTION public.mp_qa_webhook_connection_v1(_municipality_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public' SET row_security TO 'off'
AS $fn$
DECLARE connection record;
BEGIN
 IF _municipality_id IS NULL THEN RAISE EXCEPTION 'Municipality required'; END IF;
 SELECT p.municipality_id,p.provider,p.environment,p.status,p.credentials_ciphertext,
  p.webhook_secret_ciphertext
 INTO connection FROM public.municipal_payment_provider_connections p
 WHERE p.municipality_id=_municipality_id AND p.provider='mercado_pago'
 AND p.environment='test' AND p.status='active' LIMIT 1;
 IF NOT FOUND OR connection.credentials_ciphertext IS NULL THEN RETURN NULL; END IF;
 RETURN jsonb_build_object(
  'municipality_id',connection.municipality_id,
  'environment',connection.environment,'provider',connection.provider,
  'access_token_ciphertext',connection.credentials_ciphertext,
  'webhook_secret_ciphertext',connection.webhook_secret_ciphertext);
END
$fn$;

CREATE OR REPLACE FUNCTION public.mp_qa_webhook_ingest_v1(
 _municipality_id uuid,_order_id text,_request_id text,_notification_id text,
 _payload_sha256 text,_bank_fetch_ok boolean,_provider_status text,
 _external_reference text,_currency text,_provider_amount numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public' SET row_security TO 'off'
AS $fn$
DECLARE g record; status text; receipt record;
BEGIN
 IF _municipality_id IS NULL OR _order_id !~ '^[A-Za-z0-9_-]{6,100}$'
  OR _request_id !~ '^[A-Za-z0-9_-]{8,128}$'
  OR length(coalesce(_notification_id,'')) NOT BETWEEN 1 AND 128
  OR _payload_sha256 !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'Invalid signed notification metadata'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.municipal_payment_provider_connections p
  WHERE p.municipality_id=_municipality_id
   AND p.provider='mercado_pago' AND p.environment='test' AND p.status='active')
 THEN RAISE EXCEPTION 'Active test provider not found'; END IF;
 SELECT g.id,g.amount,g.guide_number,g.status,g.paid,g.collection_mode_snapshot
 INTO g FROM public.payment_guides g
 WHERE g.municipality_id=_municipality_id AND g.bank_reference=_order_id
 AND g.payment_provider='mercado_pago' AND g.provider_environment='test' LIMIT 1;
 IF NOT coalesce(_bank_fetch_ok,false) THEN
   status:='bank_fetch_failed';
 ELSIF g.id IS NOT NULL
   AND g.collection_mode_snapshot IS DISTINCT FROM 'municipal_system'
   AND g.guide_number=_external_reference
   AND coalesce(g.paid,false)=false
   AND lower(coalesce(g.status,'')) NOT IN ('confirmed','paid','pago','compensada','confirmado')
   AND _currency='BRL' AND _provider_amount IS NOT NULL
   AND _provider_amount>0 AND round(g.amount,2)=round(_provider_amount,2)
 THEN status:='verified_manual_review';
 ELSE status:='unmatched_manual_review';
 END IF;
 INSERT INTO public.mp_webhook_order_events_v1
 (municipality_id,order_id,request_id,notification_id,payload_sha256,
  signature_verified,provider_fetch_succeeded,provider_status,
  external_reference,currency,provider_amount,guide_id,reconciliation_status)
 VALUES (_municipality_id,_order_id,_request_id,_notification_id,_payload_sha256,
  true,coalesce(_bank_fetch_ok,false),left(_provider_status,96),
  left(_external_reference,160),left(_currency,12),_provider_amount,
  CASE WHEN status='verified_manual_review' THEN g.id ELSE NULL END,status)
 ON CONFLICT(municipality_id,order_id,request_id) DO UPDATE SET
  last_received_at=now(),
  attempt_count=least(1000000,public.mp_webhook_order_events_v1.attempt_count+1),
  provider_fetch_succeeded=excluded.provider_fetch_succeeded,
  provider_status=excluded.provider_status,
  external_reference=excluded.external_reference,
  currency=excluded.currency,
  provider_amount=excluded.provider_amount,
  guide_id=excluded.guide_id,
  reconciliation_status=excluded.reconciliation_status
 RETURNING id,reconciliation_status,attempt_count,guide_id INTO receipt;
 RETURN jsonb_build_object('receipt_id',receipt.id,'status',receipt.reconciliation_status,
   'attempts',receipt.attempt_count,'matched',receipt.guide_id IS NOT NULL);
END
$fn$;

-- Function execution must NOT be inherited by anonymous or authenticated web users.
REVOKE ALL ON FUNCTION public.mp_qa_webhook_connection_v1(uuid) FROM PUBLIC,anonymous,authenticated;
REVOKE ALL ON FUNCTION public.mp_qa_webhook_ingest_v1(uuid,text,text,text,text,boolean,text,text,text,numeric)
 FROM PUBLIC,anonymous,authenticated;
DO $grant$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sigapro_qa_webhook_worker') THEN
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.mp_qa_webhook_connection_v1(uuid) TO sigapro_qa_webhook_worker';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.mp_qa_webhook_ingest_v1(uuid,text,text,text,text,boolean,text,text,text,numeric) TO sigapro_qa_webhook_worker';
 END IF;
END
$grant$;
COMMIT;
