-- QA EXCLUSIVE — NEVER run on an official SIGAPRO Neon branch.
-- Neon QA: br-solitary-sound-b4xlbvs6.
-- No historical guide is rewritten, no payment is simulated.
-- Only a tenant-pinned webhook worker may invoke this function, and only
-- after a fresh Mercado Pago GET proves accredited order + transaction.
BEGIN;

CREATE TABLE IF NOT EXISTS public.mp_qa_settlement_evidence_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id uuid NOT NULL REFERENCES public.municipalities(id) ON DELETE RESTRICT,
  guide_id uuid NOT NULL UNIQUE REFERENCES public.payment_guides(id) ON DELETE RESTRICT,
  provider_order_id text NOT NULL,
  provider_payment_id text NOT NULL,
  amount numeric(16,2) NOT NULL CHECK(amount>0),
  currency text NOT NULL DEFAULT 'BRL' CHECK(currency='BRL'),
  signed_receipt_id uuid NOT NULL REFERENCES public.mp_webhook_order_events_v1(id) ON DELETE RESTRICT,
  original_pdf_key text NOT NULL,
  original_pdf_sha256 text NOT NULL CHECK(original_pdf_sha256 ~ '^[a-f0-9]{64}$'),
  status_detail text NOT NULL CHECK(status_detail='accredited'),
  transaction_status_detail text NOT NULL CHECK(transaction_status_detail='accredited'),
  verified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(municipality_id,provider_order_id),
  UNIQUE(municipality_id,provider_payment_id)
);
ALTER TABLE public.mp_qa_settlement_evidence_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mp_qa_settlement_evidence_v1 FROM PUBLIC,anonymous,authenticated;

CREATE OR REPLACE FUNCTION public.mp_qa_webhook_settle_v1(
  _receipt_id uuid,_municipality_id uuid,_order_id text,_payment_id text,
  _paid_amount numeric,_status_detail text,_transaction_status text,
  _transaction_detail text,_transaction_amount numeric,
  _transaction_paid_amount numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public' SET row_security TO 'off'
AS $fn$
DECLARE e public.mp_webhook_order_events_v1;
        g public.payment_guides; o public.mp_qa_pix_orders_v1;
        audit public.mp_qa_settlement_evidence_v1;
BEGIN
  -- Never permit direct browser calls: EXECUTE granted only to a dedicated
  -- QA worker, which verifies signed notification and tenant-specific token.
  IF _receipt_id IS NULL OR _municipality_id IS NULL OR
     _order_id !~ '^[A-Za-z0-9_-]{6,100}$' OR
     _payment_id !~ '^[A-Za-z0-9_-]{6,100}$' THEN
    RETURN jsonb_build_object('status','manual_review','matched',false);
  END IF;

  SELECT * INTO e FROM public.mp_webhook_order_events_v1
    WHERE id=_receipt_id AND municipality_id=_municipality_id
      AND order_id=_order_id AND signature_verified=true
      AND provider_fetch_succeeded=true
      AND provider_status='processed'
      AND currency='BRL'
      AND reconciliation_status='verified_manual_review'
      AND guide_id IS NOT NULL
    FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','manual_review','matched',false); END IF;

  IF _status_detail IS DISTINCT FROM 'accredited'
    OR _transaction_status IS DISTINCT FROM 'processed'
    OR _transaction_detail IS DISTINCT FROM 'accredited'
    OR _paid_amount IS NULL OR _transaction_amount IS NULL
    OR _transaction_paid_amount IS NULL OR _paid_amount<=0
    OR _paid_amount IS DISTINCT FROM _transaction_amount
    OR _paid_amount IS DISTINCT FROM _transaction_paid_amount
    OR _paid_amount IS DISTINCT FROM e.provider_amount
  THEN RETURN jsonb_build_object('status','manual_review','matched',true); END IF;

  SELECT * INTO g FROM public.payment_guides
    WHERE id=e.guide_id AND municipality_id=_municipality_id
      AND bank_reference=_order_id AND bank_payment_id=_payment_id
      AND payment_provider='mercado_pago' AND provider_environment='test'
      AND collection_mode_snapshot='sigapro'
      AND guide_number=e.external_reference AND amount=_paid_amount
      AND process_id IS NOT NULL
    FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','manual_review','matched',false); END IF;

  -- A provider order can never settle a different municipality's process.
  IF NOT EXISTS (SELECT 1 FROM public.processes p
    WHERE p.id=g.process_id AND p.municipality_id=g.municipality_id
      AND p.tenant_id=g.municipality_id)
  THEN RETURN jsonb_build_object('status','manual_review','matched',false); END IF;

  SELECT * INTO o FROM public.mp_qa_pix_orders_v1
    WHERE municipality_id=_municipality_id AND guide_id=g.id
      AND order_id=_order_id AND payment_id=_payment_id AND amount=g.amount
      AND state='issued' AND qr_code=g.pix_code
      AND g.pix_code IS NOT NULL AND length(g.pix_code)>30;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','manual_review','matched',false); END IF;

  -- Never reconstruct or officialize a paid document without its immutable
  -- original. The user must have uploaded the PDF and attached its SHA.
  IF g.original_pdf_key IS NULL OR g.original_pdf_sha256 IS NULL
    OR g.document_snapshot IS NULL OR
    coalesce(g.document_snapshot #>> '{guia,nonPayablePreview}','false')='true'
    OR g.original_pdf_sha256 !~ '^[a-f0-9]{64}$'
    OR g.original_pdf_key IS DISTINCT FROM
      ('municipalities/'||g.municipality_id||'/processes/'||
       g.process_id||'/dam-originals/'||g.id||'/'||g.original_pdf_sha256||'.pdf')
  THEN RETURN jsonb_build_object('status','awaiting_original_pdf','matched',true); END IF;

  -- Repeated and concurrent signed webhooks must be idempotent.
  IF coalesce(g.paid,false) OR lower(coalesce(g.status,'')) IN
      ('compensada','paid','pago','confirmed','confirmado') THEN
    IF EXISTS (SELECT 1 FROM public.mp_qa_settlement_evidence_v1 x
      WHERE x.guide_id=g.id AND x.municipality_id=_municipality_id
        AND x.provider_order_id=_order_id AND x.provider_payment_id=_payment_id)
    THEN RETURN jsonb_build_object('status','already_settled_qa','matched',true); END IF;
    RETURN jsonb_build_object('status','manual_review','matched',true);
  END IF;

  INSERT INTO public.mp_qa_settlement_evidence_v1
    (municipality_id,guide_id,provider_order_id,provider_payment_id,amount,
     signed_receipt_id,original_pdf_key,original_pdf_sha256,
     status_detail,transaction_status_detail)
  VALUES (_municipality_id,g.id,_order_id,_payment_id,_paid_amount,
    e.id,g.original_pdf_key,g.original_pdf_sha256,_status_detail,_transaction_detail)
  ON CONFLICT(guide_id) DO NOTHING RETURNING * INTO audit;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','manual_review','matched',true);
  END IF;

  -- The existing pre-protocol officialization trigger runs atomically here.
  -- Any trigger error rolls back the evidence insert and the payment change.
  UPDATE public.payment_guides SET
    paid=true,status='compensada',paid_at=now(),
    bank_status='processed',bank_status_detail='accredited',
    bank_authenticated_at=now()
  WHERE id=g.id AND paid=false AND status NOT IN
    ('compensada','paid','pago','confirmed','confirmado');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'QA settlement race: payment guide changed';
  END IF;

  RETURN jsonb_build_object('status','settled_qa','matched',true);
END
$fn$;

REVOKE ALL ON FUNCTION public.mp_qa_webhook_settle_v1(
 uuid,uuid,text,text,numeric,text,text,text,numeric,numeric
) FROM PUBLIC,anonymous,authenticated;
GRANT EXECUTE ON FUNCTION public.mp_qa_webhook_settle_v1(
 uuid,uuid,text,text,numeric,text,text,text,numeric,numeric
) TO sigapro_qa_webhook_worker;
COMMIT;
