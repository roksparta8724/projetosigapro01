-- Only pending guides accept a new charge; persist the signed charge timestamp required by settlement.
CREATE OR REPLACE FUNCTION public.authorize_payment_guide_charge_v1(_municipality_id uuid, _guide_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
DECLARE g public.payment_guides;
BEGIN
 SELECT * INTO STRICT g FROM public.payment_guides WHERE municipality_id=_municipality_id AND guide_number=_guide_code;
 PERFORM public.assert_dam_writer_v1(g);
 RETURN g.paid IS FALSE AND lower(coalesce(g.status,'')) IN ('pendente','pending','aguardando_pagamento')
 AND g.document_snapshot IS NULL AND g.original_pdf_key IS NULL
 AND nullif(btrim(g.bank_reference),'') IS NULL
 AND EXISTS(SELECT 1 FROM public.municipal_payment_provider_connections c
            WHERE c.municipality_id=_municipality_id AND c.provider='mercado_pago'
            AND c.environment IN ('test','production') AND c.status='active'
            AND nullif(btrim(c.credentials_ciphertext),'') IS NOT NULL
            AND c.last_test_status='ok');
END $function$;

CREATE OR REPLACE FUNCTION public.persist_payment_guide_provider_charge_v2(_municipality_id uuid, _guide_code text, _charge jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'sigapro_private', 'extensions'
 SET row_security TO 'off'
AS $function$
DECLARE g public.payment_guides;
 receipt_key text;
 receipt_stamp bigint;
 signed_fields text[];
 signed_message text;
 receipt_expected text;
 registered_provider public.municipal_payment_provider_connections;
BEGIN
 SELECT * INTO STRICT g FROM public.payment_guides
 WHERE municipality_id=_municipality_id AND guide_number=_guide_code FOR UPDATE;
 PERFORM public.assert_dam_writer_v1(g);
 IF coalesce(g.paid,false) OR lower(coalesce(g.status,'')) IN ('paid','compensada','confirmed','confirmado','pago') THEN RETURN to_jsonb(g); END IF;
 IF g.paid IS DISTINCT FROM false OR lower(coalesce(g.status,'')) NOT IN ('pendente','pending','aguardando_pagamento') THEN RAISE EXCEPTION 'Guia não está pendente e não admite nova cobrança bancária.'; END IF;
 IF g.document_snapshot IS NOT NULL OR g.original_pdf_key IS NOT NULL THEN RETURN to_jsonb(g); END IF;
 SELECT * INTO registered_provider FROM public.municipal_payment_provider_connections c WHERE c.municipality_id=_municipality_id;
 IF registered_provider.municipality_id IS NULL OR registered_provider.provider<>'mercado_pago'
 OR registered_provider.status<>'active' OR registered_provider.environment NOT IN ('test','production')
 OR registered_provider.last_test_status<>'ok' OR nullif(btrim(registered_provider.credentials_ciphertext),'') IS NULL
 THEN RAISE EXCEPTION 'Provedor bancário municipal não está ativo e validado'; END IF;
 IF _charge IS NULL OR jsonb_typeof(_charge)<>'object'
 OR (_charge->>'externalReference') IS DISTINCT FROM g.guide_number
 OR nullif(btrim(_charge->>'orderId'),'') IS NULL
 OR coalesce(_charge->>'environment','')<>registered_provider.environment
 OR coalesce(_charge->>'amount','') !~ '^[0-9]+([.][0-9]{1,2})?$'
 OR (_charge->>'amount')::numeric IS DISTINCT FROM g.amount
 THEN RAISE EXCEPTION 'Cobrança bancária divergente da guia oficial'; END IF;
 IF nullif(g.bank_reference,'') IS NOT NULL AND g.bank_reference<>_charge->>'orderId'
 THEN RAISE EXCEPTION 'Guia já possui outra cobrança bancária'; END IF;
 IF EXISTS (SELECT 1 FROM public.payment_guides other
 WHERE other.municipality_id=g.municipality_id AND other.bank_reference=_charge->>'orderId' AND other.id<>g.id)
 THEN RAISE EXCEPTION 'Referência bancária já associada a outra guia'; END IF;
 IF coalesce(_charge->>'__receipt_epoch','') !~ '^[0-9]{10,11}$'
 OR coalesce(_charge->>'__receipt_mac','') !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'Comprovação assinada do provedor obrigatória'; END IF;
 receipt_stamp:=(_charge->>'__receipt_epoch')::bigint;
 IF abs(extract(epoch from clock_timestamp())::bigint-receipt_stamp)>300
 THEN RAISE EXCEPTION 'Comprovação bancária expirada'; END IF;
 SELECT key_hex INTO receipt_key FROM sigapro_private.bank_charge_receipt_key WHERE singleton IS TRUE;
 IF receipt_key IS NULL THEN RAISE EXCEPTION 'Chave de comprovação bancária não configurada no servidor'; END IF;
 signed_fields:=ARRAY[
 'sigapro-charge-v1',g.municipality_id::text,g.guide_number,
 coalesce(_charge->>'externalReference',''),coalesce(_charge->>'amount',''),
 coalesce(_charge->>'orderId',''),coalesce(_charge->>'environment',''),
 coalesce(_charge->>'paymentId',''),coalesce(_charge->>'status',''),
 coalesce(_charge->>'statusDetail',''),coalesce(_charge->>'authenticatedAt',''),
 coalesce(_charge->>'barcodeContent',''),coalesce(_charge->>'digitableLine',''),
 coalesce(_charge->>'ticketUrl',''),_charge->>'__receipt_epoch'];
 IF EXISTS(SELECT 1 FROM unnest(signed_fields) f WHERE position(chr(10) in f)>0 OR position(chr(13) in f)>0)
 THEN RAISE EXCEPTION 'Comprovação bancária contém caracteres inválidos'; END IF;
 signed_message:=array_to_string(signed_fields,chr(10));
 receipt_expected:=encode(extensions.hmac(convert_to(signed_message,'UTF8'),decode(receipt_key,'hex'),'sha256'),'hex');
 IF receipt_expected IS DISTINCT FROM _charge->>'__receipt_mac' THEN
 RAISE EXCEPTION 'Comprovação bancária não corresponde ao retorno verificado pelo servidor'; END IF;
 UPDATE public.payment_guides SET
   bank_reference=_charge->>'orderId',
   bank_payment_id=coalesce(nullif(_charge->>'paymentId',''),bank_payment_id),
   bank_status=coalesce(nullif(_charge->>'status',''),bank_status),
   bank_status_detail=coalesce(nullif(_charge->>'statusDetail',''),bank_status_detail),
   bank_authenticated_at=coalesce(nullif(_charge->>'authenticatedAt','')::timestamptz,bank_authenticated_at),
   payment_provider='mercado_pago',provider_environment=_charge->>'environment',
   barcode=coalesce(nullif(_charge->>'barcodeContent',''),barcode),
   digitable_line=coalesce(nullif(_charge->>'digitableLine',''),digitable_line),
   ticket_url=coalesce(nullif(_charge->>'ticketUrl',''),ticket_url),
   provider_charge_saved_at=coalesce(provider_charge_saved_at,clock_timestamp())
 WHERE id=g.id RETURNING * INTO g;
 RETURN to_jsonb(g);
END $function$;

CREATE OR REPLACE FUNCTION public.qa_boleto_access_v1(_municipality_id uuid, _guide_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
DECLARE g public.payment_guides;
BEGIN
  IF public.current_profile_id() IS NULL OR NOT public.has_tenant_access(_municipality_id) THEN RETURN false; END IF;
  SELECT * INTO g FROM public.payment_guides WHERE municipality_id=_municipality_id AND guide_number=_guide_code;
  IF g.id IS NULL OR g.process_id IS NULL OR NOT public.has_process_access(g.process_id) THEN RETURN false; END IF;
  -- QA purpose is ONLY new pre-protocol testing, never an old payable DAM.
  IF g.guide_number NOT LIKE 'DAM-PRE-%' OR
    NOT EXISTS (SELECT 1 FROM public.processes pr
      WHERE pr.id=g.process_id AND pr.officialized_at IS NULL) THEN RETURN false; END IF;
  IF g.collection_mode_snapshot IS DISTINCT FROM 'sigapro' OR g.paid IS DISTINCT FROM false OR
    lower(coalesce(g.status,'')) NOT IN ('pendente','pending','aguardando_pagamento') OR
    g.document_snapshot IS NOT NULL OR g.original_pdf_key IS NOT NULL THEN RETURN false; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.municipal_collection_configurations c
    JOIN public.municipal_payment_provider_connections p ON p.municipality_id=c.municipality_id
    WHERE c.municipality_id=_municipality_id AND c.status='active' AND c.mode='sigapro'
      AND c.environment='test' AND p.provider='mercado_pago'
      AND p.environment='test' AND p.status='active'
  ) THEN RETURN false; END IF;
  RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.qa_persist_payment_guide_provider_charge_v1(_municipality_id uuid, _guide_code text, _charge jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  v_guide public.payment_guides;
  v_charge_amount numeric;
  v_order_reference text;
  v_provider_barcode text;
  v_provider_digitable_line text;
BEGIN
  IF NOT public.qa_boleto_access_v1(_municipality_id,_guide_code) THEN
    RAISE EXCEPTION 'Guia QA não autorizada para este profissional ou Prefeitura';
  END IF;
  SELECT * INTO STRICT v_guide FROM public.payment_guides
    WHERE municipality_id=_municipality_id AND guide_number=_guide_code FOR UPDATE;
  IF v_guide.paid IS DISTINCT FROM false OR lower(coalesce(v_guide.status,'')) NOT IN ('pendente','pending','aguardando_pagamento') OR v_guide.document_snapshot IS NOT NULL OR v_guide.original_pdf_key IS NOT NULL THEN
    RAISE EXCEPTION 'Guia não está pendente ou já possui documento original.';
  END IF;
  v_order_reference := nullif(btrim(_charge->>'orderId'),'');
  IF v_order_reference IS NULL OR length(v_order_reference)>128 OR (_charge->>'externalReference') IS DISTINCT FROM v_guide.guide_number
    OR (_charge->>'environment') IS DISTINCT FROM 'test'
    OR (_charge->>'amount') !~ '^[0-9]+(\.[0-9]{1,2})?$' THEN
    RAISE EXCEPTION 'Order do sandbox inválida para esta guia';
  END IF;
  v_charge_amount := (_charge->>'amount')::numeric;
  IF v_charge_amount IS DISTINCT FROM v_guide.amount THEN RAISE EXCEPTION 'Valor do boleto diferente do valor original'; END IF;
  IF nullif(v_guide.bank_reference,'') IS NOT NULL AND v_guide.bank_reference <> v_order_reference THEN
    RAISE EXCEPTION 'Já existe outra order vinculada à guia';
  END IF;
  v_provider_barcode := nullif(regexp_replace(coalesce(_charge->>'barcodeContent',''),'[^0-9]','','g'),'');
  v_provider_digitable_line := nullif(regexp_replace(coalesce(_charge->>'digitableLine',''),'[^0-9]','','g'),'');
  IF (v_provider_barcode IS NOT NULL AND length(v_provider_barcode) <> 44) OR
     (v_provider_digitable_line IS NOT NULL AND length(v_provider_digitable_line) NOT IN (47,48)) THEN
    RAISE EXCEPTION 'Dados bancários inválidos retornados pelo sandbox';
  END IF;

  UPDATE public.payment_guides SET
    bank_reference=v_order_reference,
    bank_payment_id=coalesce(nullif(_charge->>'paymentId',''),bank_payment_id),
    bank_status=coalesce(nullif(_charge->>'status',''),bank_status),
    bank_status_detail=coalesce(nullif(_charge->>'statusDetail',''),bank_status_detail),
    bank_authenticated_at=NULL, -- sandbox never compensates the municipal guide
    payment_provider='mercado_pago',
    provider_environment='test',
    barcode=coalesce(v_provider_barcode,v_guide.barcode),
    digitable_line=coalesce(v_provider_digitable_line,v_guide.digitable_line),
    ticket_url=coalesce(nullif(_charge->>'ticketUrl',''),v_guide.ticket_url),
    provider_charge_saved_at=coalesce(provider_charge_saved_at,clock_timestamp())
  WHERE id=v_guide.id RETURNING * INTO v_guide;
  RETURN to_jsonb(v_guide);
END $function$;
