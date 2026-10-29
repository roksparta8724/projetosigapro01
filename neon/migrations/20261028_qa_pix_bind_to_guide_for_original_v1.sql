-- QA EXCLUSIVE. Apply ONLY on Neon branch br-solitary-sound-b4xlbvs6.
-- DO NOT deploy to production. Binds an already-saved Mercado Pago sandbox order
-- to its own administrative guide, to enable immutable QA document archiving.
-- Never generates a charge, updates paid/status, or performs settlement.
BEGIN;
CREATE OR REPLACE FUNCTION public.qa_mp_pix_bind_to_guide_v1(
  _municipality_id uuid, _guide_code text, _order_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
SET row_security TO 'off'
AS $fn$
DECLARE g public.payment_guides; p public.mp_qa_pix_orders_v1;
BEGIN
  IF _municipality_id IS NULL OR _guide_code !~ '^DAM-PRE-QA-[A-Za-z0-9-]{8,100}$'
     OR _order_id !~ '^[A-Za-z0-9_-]{6,100}$' THEN
    RAISE EXCEPTION 'Identificação de PIX de homologação inválida';
  END IF;
  SELECT * INTO g FROM public.payment_guides
   WHERE municipality_id=_municipality_id AND guide_number=_guide_code
   FOR UPDATE;
  IF NOT FOUND OR NOT public.qa_boleto_access_v1(_municipality_id,_guide_code)
    OR g.process_id IS NULL OR g.municipality_id IS DISTINCT FROM _municipality_id
    OR COALESCE(g.paid,false) OR lower(COALESCE(g.status,'')) NOT IN ('pendente','pending')
    OR g.original_pdf_key IS NOT NULL OR g.document_snapshot IS NOT NULL
    OR g.collection_mode_snapshot IS DISTINCT FROM 'sigapro'
    OR (COALESCE(g.barcode,'') <> '' OR COALESCE(g.digitable_line,'') <> '')
  THEN RAISE EXCEPTION 'Guia de teste sem permissão ou incompatível com arquivamento'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.municipal_collection_configurations c
    WHERE c.municipality_id=_municipality_id AND c.mode='sigapro'
      AND c.environment='test' AND c.status='active'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.municipal_payment_provider_connections c
    WHERE c.municipality_id=_municipality_id AND c.provider='mercado_pago'
      AND c.environment='test' AND c.status='active'
  ) THEN RAISE EXCEPTION 'Conexão exclusiva de teste não configurada'; END IF;
  SELECT * INTO p FROM public.mp_qa_pix_orders_v1
    WHERE municipality_id=_municipality_id AND guide_id=g.id
      AND guide_number=_guide_code AND order_id=_order_id
    FOR UPDATE;
  IF NOT FOUND OR p.state <> 'issued' OR p.order_id IS DISTINCT FROM _order_id
    OR p.payment_id IS NULL OR p.payment_id=''
    OR p.provider_status NOT IN ('action_required','processed')
    OR p.amount IS DISTINCT FROM g.amount OR p.idempotency_key IS NULL
    OR COALESCE(p.qr_code,'') !~* '^000201.*BR\.GOV\.BCB\.PIX.*6304[0-9A-Fa-f]{4}$'
    OR length(p.qr_code)>3000
  THEN RAISE EXCEPTION 'Ordem PIX sem comprovação de teste compatível com a guia'; END IF;
  IF (g.bank_reference IS NOT NULL AND g.bank_reference <> p.order_id)
    OR (g.bank_payment_id IS NOT NULL AND g.bank_payment_id <> p.payment_id)
    OR (g.pix_code IS NOT NULL AND g.pix_code <> p.qr_code)
    OR (g.payment_provider IS NOT NULL AND g.payment_provider <> 'mercado_pago')
    OR (g.provider_environment IS NOT NULL AND g.provider_environment <> 'test')
  THEN RAISE EXCEPTION 'A guia está vinculada a outra cobrança; não sobrescrever'; END IF;
  UPDATE public.payment_guides
     SET payment_provider='mercado_pago',provider_environment='test',
         bank_reference=p.order_id, bank_payment_id=p.payment_id,
         bank_status=p.provider_status,bank_status_detail='pix_sandbox',
         pix_code=p.qr_code
   WHERE id=g.id AND municipality_id=_municipality_id
   RETURNING * INTO g;
  RETURN to_jsonb(g);
END
$fn$;
REVOKE ALL ON FUNCTION public.qa_mp_pix_bind_to_guide_v1(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.qa_mp_pix_bind_to_guide_v1(uuid,text,text) FROM anonymous;
GRANT EXECUTE ON FUNCTION public.qa_mp_pix_bind_to_guide_v1(uuid,text,text) TO authenticated;
COMMIT;
