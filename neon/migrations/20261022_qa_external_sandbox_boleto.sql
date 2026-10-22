-- ONLY the isolated Neon QA branch! Never apply these routines to production.
-- A professional may test the Mercado Pago sandbox ONLY on their own
-- pending pre-protocol guide. Does not touch paid status or legacy guides.
BEGIN;

CREATE OR REPLACE FUNCTION public.qa_boleto_access_v1(_municipality_id uuid, _guide_code text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET row_security=off AS $$
DECLARE g public.payment_guides;
BEGIN
  IF public.current_profile_id() IS NULL OR NOT public.has_tenant_access(_municipality_id) THEN RETURN false; END IF;
  SELECT * INTO g FROM public.payment_guides WHERE municipality_id=_municipality_id AND guide_number=_guide_code;
  IF g.id IS NULL OR g.process_id IS NULL OR NOT public.has_process_access(g.process_id) THEN RETURN false; END IF;
  -- QA purpose is ONLY new pre-protocol testing, never an old payable DAM.
  IF g.guide_number NOT LIKE 'DAM-PRE-%' OR
    NOT EXISTS (SELECT 1 FROM public.processes pr
      WHERE pr.id=g.process_id AND pr.officialized_at IS NULL) THEN RETURN false; END IF;
  IF g.collection_mode_snapshot IS DISTINCT FROM 'sigapro' OR coalesce(g.paid,false) OR
    lower(coalesce(g.status,'')) IN ('compensada','paid','pago','confirmed','confirmado') OR
    g.document_snapshot IS NOT NULL OR g.original_pdf_key IS NOT NULL THEN RETURN false; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.municipal_collection_configurations c
    JOIN public.municipal_payment_provider_connections p ON p.municipality_id=c.municipality_id
    WHERE c.municipality_id=_municipality_id AND c.status='active' AND c.mode='sigapro'
      AND c.environment='test' AND p.provider='mercado_pago'
      AND p.environment='test' AND p.status='active'
  ) THEN RETURN false; END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.qa_authorize_payment_guide_charge_v1(
 _municipality_id uuid, _guide_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public SET row_security=off AS $$
DECLARE g public.payment_guides;
BEGIN
  IF NOT public.qa_boleto_access_v1(_municipality_id,_guide_code) THEN RETURN false; END IF;
  SELECT * INTO STRICT g FROM public.payment_guides WHERE municipality_id=_municipality_id AND guide_number=_guide_code;
  RETURN nullif(btrim(g.bank_reference),'') IS NULL;
END $$;

CREATE OR REPLACE FUNCTION public.qa_authorize_payment_guide_provider_sync_v1(
 _municipality_id uuid, _guide_code text, _bank_reference text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public SET row_security=off AS $$
DECLARE g public.payment_guides;
BEGIN
  IF NOT public.qa_boleto_access_v1(_municipality_id,_guide_code) THEN RETURN false; END IF;
  SELECT * INTO STRICT g FROM public.payment_guides WHERE municipality_id=_municipality_id AND guide_number=_guide_code;
  RETURN nullif(btrim(g.bank_reference),'') = nullif(btrim(_bank_reference),'')
    AND g.payment_provider='mercado_pago' AND g.provider_environment='test';
END $$;

CREATE OR REPLACE FUNCTION public.qa_persist_payment_guide_provider_charge_v1(
 _municipality_id uuid, _guide_code text, _charge jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public SET row_security=off AS $$
DECLARE g public.payment_guides; amount numeric; ref text; barcode text; digit_line text;
BEGIN
  IF NOT public.qa_boleto_access_v1(_municipality_id,_guide_code) THEN
    RAISE EXCEPTION 'Guia QA não autorizada para este profissional ou Prefeitura';
  END IF;
  SELECT * INTO STRICT g FROM public.payment_guides
    WHERE municipality_id=_municipality_id AND guide_number=_guide_code FOR UPDATE;
  ref := nullif(btrim(_charge->>'orderId'),'');
  IF ref IS NULL OR length(ref)>128 OR (_charge->>'externalReference') IS DISTINCT FROM g.guide_number
    OR (_charge->>'environment') IS DISTINCT FROM 'test'
    OR (_charge->>'amount') !~ '^[0-9]+(\.[0-9]{1,2})?$' THEN
    RAISE EXCEPTION 'Order do sandbox inválida para esta guia';
  END IF;
  amount := (_charge->>'amount')::numeric;
  IF amount IS DISTINCT FROM g.amount THEN RAISE EXCEPTION 'Valor do boleto diferente do valor original'; END IF;
  IF nullif(g.bank_reference,'') IS NOT NULL AND g.bank_reference <> ref THEN
    RAISE EXCEPTION 'Já existe outra order vinculada à guia';
  END IF;
  barcode := nullif(regexp_replace(coalesce(_charge->>'barcodeContent',''),'[^0-9]','','g'),'');
  digit_line := nullif(regexp_replace(coalesce(_charge->>'digitableLine',''),'[^0-9]','','g'),'');
  IF (barcode IS NOT NULL AND length(barcode) <> 44) OR
     (digit_line IS NOT NULL AND length(digit_line) NOT IN (47,48)) THEN
    RAISE EXCEPTION 'Dados bancários inválidos retornados pelo sandbox';
  END IF;

  UPDATE public.payment_guides SET
    bank_reference=ref,
    bank_payment_id=coalesce(nullif(_charge->>'paymentId',''),bank_payment_id),
    bank_status=coalesce(nullif(_charge->>'status',''),bank_status),
    bank_status_detail=coalesce(nullif(_charge->>'statusDetail',''),bank_status_detail),
    bank_authenticated_at=NULL, -- sandbox never compensates the municipal guide
    payment_provider='mercado_pago',
    provider_environment='test',
    barcode=coalesce(barcode,g.barcode),
    digitable_line=coalesce(digit_line,g.digitable_line),
    ticket_url=coalesce(nullif(_charge->>'ticketUrl',''),g.ticket_url),
    provider_charge_saved_at=now()
  WHERE id=g.id RETURNING * INTO g;
  RETURN to_jsonb(g);
END $$;

REVOKE ALL ON FUNCTION public.qa_boleto_access_v1(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.qa_authorize_payment_guide_charge_v1(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.qa_authorize_payment_guide_provider_sync_v1(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.qa_persist_payment_guide_provider_charge_v1(uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qa_authorize_payment_guide_charge_v1(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qa_authorize_payment_guide_provider_sync_v1(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qa_persist_payment_guide_provider_charge_v1(uuid,text,jsonb) TO authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';
