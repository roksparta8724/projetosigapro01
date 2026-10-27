-- SIGAPRO: provider-attested bank charge write. REVIEWED ON CLONED PRODUCTION.
-- No historical rows are modified; the server secret must be provisioned separately.
-- The private signing key table is NEVER exposed to anonymous/authenticated.
BEGIN;
CREATE SCHEMA IF NOT EXISTS sigapro_private;
REVOKE ALL ON SCHEMA sigapro_private FROM PUBLIC, authenticated, anonymous;
CREATE TABLE IF NOT EXISTS sigapro_private.bank_charge_receipt_key (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 key_hex text NOT NULL CHECK(key_hex ~ '^[a-f0-9]{64}$')
);
REVOKE ALL ON sigapro_private.bank_charge_receipt_key FROM PUBLIC, authenticated, anonymous;
CREATE OR REPLACE FUNCTION public.assert_dam_writer_v1(_guide payment_guides)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
DECLARE actor uuid;
BEGIN
 actor:=public.current_profile_id();
 IF actor IS NULL OR NOT(
    public.is_master() OR (
     public.has_tenant_access(_guide.municipality_id)
     AND public.has_process_access(_guide.process_id)
     AND (
       public.is_internal_municipality_role()
       OR (coalesce(public.current_role_code(),'')='profissional_externo'
           AND _guide.guide_kind='protocolo'
           AND EXISTS(SELECT 1 FROM public.processes p WHERE p.id=_guide.process_id
             AND p.municipality_id=_guide.municipality_id
             AND p.created_by_profile_id=actor AND p.officialized_at IS NULL))
     )
    )
 ) THEN RAISE EXCEPTION 'Sem permissão para emissão financeira desta Prefeitura'; END IF;
 IF coalesce(_guide.collection_mode_snapshot,'')='municipal_system' OR (
   _guide.collection_mode_snapshot IS NULL AND EXISTS(
    SELECT 1 FROM public.municipal_collection_configurations c
    WHERE c.municipality_id=_guide.municipality_id
      AND c.status='active' AND c.mode='municipal_system')
 ) THEN RAISE EXCEPTION 'Arrecadação própria municipal: SIGAPRO não pode emitir cobrança paralela'; END IF;
END $function$
;
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
 RETURN NOT(coalesce(g.paid,false) OR lower(coalesce(g.status,'')) IN ('paid','compensada','confirmed','confirmado','pago'))
 AND g.document_snapshot IS NULL AND g.original_pdf_key IS NULL
 AND nullif(btrim(g.bank_reference),'') IS NULL
 AND EXISTS(SELECT 1 FROM public.municipal_payment_provider_connections c
            WHERE c.municipality_id=_municipality_id AND c.provider='mercado_pago'
            AND c.environment IN ('test','production') AND c.status='active'
            AND nullif(btrim(c.credentials_ciphertext),'') IS NOT NULL
            AND c.last_test_status='ok');
END $function$
;
CREATE OR REPLACE FUNCTION public.authorize_payment_guide_provider_sync_v1(_municipality_id uuid, _guide_code text, _bank_reference text)
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
 RETURN nullif(btrim(g.bank_reference),'') IS NOT NULL
 AND g.bank_reference=nullif(btrim(_bank_reference),'')
 AND g.payment_provider='mercado_pago'
 AND g.provider_environment IN ('test','production')
 AND NOT(coalesce(g.paid,false) OR lower(coalesce(g.status,'')) IN ('paid','compensada','confirmed','confirmado','pago'))
 AND EXISTS(SELECT 1 FROM public.municipal_payment_provider_connections c
            WHERE c.municipality_id=_municipality_id AND c.provider='mercado_pago'
            AND c.environment=g.provider_environment AND c.status='active'
            AND nullif(btrim(c.credentials_ciphertext),'') IS NOT NULL
            AND c.last_test_status='ok');
END $function$
;
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
   ticket_url=coalesce(nullif(_charge->>'ticketUrl',''),ticket_url)
 WHERE id=g.id RETURNING * INTO g;
 RETURN to_jsonb(g);
END $function$
;
REVOKE ALL ON FUNCTION public.assert_dam_writer_v1(public.payment_guides) FROM PUBLIC, authenticated, anonymous;
REVOKE ALL ON FUNCTION public.authorize_payment_guide_charge_v1(uuid,text) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.authorize_payment_guide_charge_v1(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.authorize_payment_guide_provider_sync_v1(uuid,text,text) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.authorize_payment_guide_provider_sync_v1(uuid,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.persist_payment_guide_provider_charge_v2(uuid,text,jsonb) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.persist_payment_guide_provider_charge_v2(uuid,text,jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
