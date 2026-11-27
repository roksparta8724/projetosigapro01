-- Preserve historical municipal bank credit and route subsequent conflicting observations to review.
CREATE OR REPLACE FUNCTION public.mp_prod_record_accredited_order_v1(_municipality_id uuid, _order_id text, _payment_id text, _request_id text, _notification_id text, _payload_sha256 text, _external_reference text, _currency text, _order_status text, _order_detail text, _transaction_status text, _transaction_detail text, _amount numeric, _paid_amount numeric, _transaction_amount numeric, _transaction_paid_amount numeric, _no_refunds_or_chargebacks boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
DECLARE r public.mp_prod_signed_order_receipts_v1;
        g public.payment_guides;
        evidence public.mp_prod_settlement_evidence_v1;
        is_credit boolean;
        review_marker text;
        credited_receipt boolean;
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
 
 IF g.provider_charge_saved_at IS NULL OR
    g.bank_reference IS NULL OR g.bank_payment_id IS NULL
 THEN RETURN jsonb_build_object('status','charge_not_persisted','settled',false); END IF;

 is_credit:=coalesce((
   _order_status='processed' AND _order_detail='accredited'
   AND _transaction_status='processed' AND _transaction_detail='accredited'
   AND coalesce(_no_refunds_or_chargebacks,false)
   AND _paid_amount IS NOT NULL AND _transaction_amount IS NOT NULL
   AND _transaction_paid_amount IS NOT NULL AND _paid_amount>0
   AND _amount=_paid_amount AND _amount=_transaction_amount
   AND _amount=_transaction_paid_amount),false);

 INSERT INTO public.mp_prod_signed_order_receipts_v1(
  municipality_id,guide_id,order_id,payment_id,request_id,notification_id,
  payload_sha256,signature_verified,provider_fetch_succeeded,
  provider_status,provider_status_detail,transaction_status,
  transaction_status_detail,currency,provider_amount,verified_paid_amount)
 VALUES(_municipality_id,g.id,_order_id,_payment_id,_request_id,
  _notification_id,_payload_sha256,true,true,_order_status,_order_detail,
  _transaction_status,_transaction_detail,'BRL',_amount,
  CASE WHEN is_credit THEN _paid_amount ELSE NULL END)
 ON CONFLICT(municipality_id,order_id,request_id) DO NOTHING
 RETURNING * INTO r;
 IF NOT FOUND THEN
  SELECT * INTO r FROM public.mp_prod_signed_order_receipts_v1 x
  WHERE x.municipality_id=_municipality_id AND x.order_id=_order_id AND x.request_id=_request_id FOR UPDATE;
  IF NOT FOUND OR r.payload_sha256 IS DISTINCT FROM _payload_sha256 OR r.guide_id IS DISTINCT FROM g.id
    OR r.payment_id IS DISTINCT FROM _payment_id THEN
   RETURN jsonb_build_object('status','receipt_conflict','settled',false);
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.mp_prod_settlement_evidence_v1 e WHERE e.receipt_id=r.id)
  INTO credited_receipt;
  IF NOT credited_receipt THEN
   UPDATE public.mp_prod_signed_order_receipts_v1 x SET
    provider_status=_order_status,provider_status_detail=_order_detail,
    transaction_status=_transaction_status,transaction_status_detail=_transaction_detail,
    verified_paid_amount=CASE WHEN is_credit THEN _paid_amount ELSE NULL END,last_verified_at=now()
   WHERE x.id=r.id RETURNING * INTO r;
  END IF;
 END IF;

 -- A later non-credit observation cannot revoke a historical municipal credit
 -- or alter its evidence. Create a deduplicated internal review entry instead.
 IF NOT is_credit AND EXISTS(SELECT 1 FROM public.mp_prod_settlement_evidence_v1 e WHERE e.guide_id=g.id) THEN
  review_marker:='[recebimento:'||r.id::text||':'||encode(sha256(convert_to(jsonb_build_array(_order_status,_order_detail,_transaction_status,_transaction_detail,_paid_amount,_transaction_amount,_transaction_paid_amount,_no_refunds_or_chargebacks)::text,'UTF8')),'hex')||']';
  IF NOT EXISTS(SELECT 1 FROM public.process_audit_entries a WHERE a.process_id=g.process_id AND a.title='Revisão de recebimento bancário' AND a.detail LIKE review_marker||'%') THEN
   INSERT INTO public.process_audit_entries(tenant_id,municipality_id,process_id,category,title,detail,visible_to_external)
   VALUES(g.municipality_id,g.municipality_id,g.process_id,'financeiro','Revisão de recebimento bancário',review_marker||' O banco retornou uma observação incompatível com crédito já registrado. Conferência pelo financeiro necessária. Guia e comprovante preservados.',false);
  END IF;
  RETURN jsonb_build_object('status','credited_bank_review_required','settled',false);
 END IF;
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

 IF lower(coalesce(g.status,'')) NOT IN ('pendente','pending','aguardando_pagamento') OR g.paid IS DISTINCT FROM false THEN
  RETURN jsonb_build_object('status','guide_not_payable_manual_review','settled',false);
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
 WHERE id=g.id AND paid=false AND lower(coalesce(status,'')) IN ('pendente','pending','aguardando_pagamento');
 IF NOT FOUND THEN RAISE EXCEPTION 'Concurrent bank settlement conflict'; END IF;
 
 RETURN jsonb_build_object('status','settled','settled',true);
END
$function$;
