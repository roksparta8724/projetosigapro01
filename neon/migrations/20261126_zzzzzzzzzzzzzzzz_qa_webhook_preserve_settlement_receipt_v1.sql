-- Preserve the signed evidence backing a completed QA settlement.
-- No historical rows, privileges, provider credentials or paid guides are changed by this migration.
CREATE OR REPLACE FUNCTION public.mp_qa_webhook_ingest_v1(_municipality_id uuid, _order_id text, _request_id text, _notification_id text, _payload_sha256 text, _bank_fetch_ok boolean, _provider_status text, _external_reference text, _currency text, _provider_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
 v_guide_id uuid;guide_number text;guide_amount numeric;guide_status text;
 guide_paid boolean;guide_mode text;status text;receipt public.mp_webhook_order_events_v1%ROWTYPE; inserted_receipt uuid; response_status text;
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
 INTO v_guide_id,guide_amount,guide_number,guide_status,guide_paid,guide_mode
 FROM public.payment_guides g
 WHERE g.municipality_id=_municipality_id AND g.bank_reference=_order_id
 AND g.payment_provider='mercado_pago' AND g.provider_environment='test' LIMIT 1;
 IF NOT coalesce(_bank_fetch_ok,false) THEN
   status:='bank_fetch_failed';
 ELSIF v_guide_id IS NOT NULL
   AND guide_mode IS DISTINCT FROM 'municipal_system'
   AND guide_number=_external_reference
   AND coalesce(guide_paid,false)=false
   AND lower(coalesce(guide_status,'')) NOT IN ('confirmed','paid','pago','compensada','confirmado')
   AND lower(coalesce(_provider_status,''))='processed' AND _currency='BRL' AND _provider_amount IS NOT NULL
   AND _provider_amount>0 AND guide_amount=_provider_amount
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
  CASE WHEN status='verified_manual_review' THEN v_guide_id ELSE NULL END,status)
 ON CONFLICT(municipality_id,order_id,request_id) DO NOTHING
 RETURNING id INTO inserted_receipt;
 -- Settlement acquires this same receipt lock before the guide lock.
 -- Lock first, then check committed evidence in a separate statement.
 SELECT * INTO receipt FROM public.mp_webhook_order_events_v1 e
 WHERE e.municipality_id=_municipality_id AND e.order_id=_order_id AND e.request_id=_request_id
 FOR UPDATE;
 IF NOT FOUND OR receipt.payload_sha256 IS DISTINCT FROM _payload_sha256 THEN
  RAISE EXCEPTION 'Duplicate request ID conflicts with previously signed event payload';
 END IF;
 response_status:=status;
 IF inserted_receipt IS NULL THEN
  IF EXISTS(SELECT 1 FROM public.mp_qa_settlement_evidence_v1 x
     WHERE x.signed_receipt_id=receipt.id) THEN
   -- Preserve the entire observation that supported the immutable credit.
   -- A subsequent refund/non-credit observation must not be reported as credit.
   UPDATE public.mp_webhook_order_events_v1 e SET
    last_received_at=now(),attempt_count=least(1000000,e.attempt_count+1)
   WHERE e.id=receipt.id RETURNING * INTO receipt;
   IF coalesce(_bank_fetch_ok,false) AND _provider_status='processed'
     AND _external_reference=receipt.external_reference AND _currency=receipt.currency
     AND _provider_amount=receipt.provider_amount AND receipt.guide_id IS NOT NULL
     AND receipt.reconciliation_status='verified_manual_review'
   THEN response_status:='verified_manual_review';
   ELSE response_status:='unmatched_manual_review'; END IF;
  ELSE
   UPDATE public.mp_webhook_order_events_v1 e SET
    last_received_at=now(),attempt_count=least(1000000,e.attempt_count+1),
    provider_fetch_succeeded=coalesce(_bank_fetch_ok,false),
    provider_status=left(_provider_status,96),external_reference=left(_external_reference,160),
    currency=left(_currency,12),provider_amount=_provider_amount,
    guide_id=CASE WHEN status='verified_manual_review' THEN v_guide_id ELSE NULL END,
    reconciliation_status=status
   WHERE e.id=receipt.id RETURNING * INTO receipt;
  END IF;
 END IF;
 RETURN jsonb_build_object('receipt_id',receipt.id,'status',response_status,
   'attempts',receipt.attempt_count,'matched',receipt.guide_id IS NOT NULL AND response_status='verified_manual_review');
END
$function$;
