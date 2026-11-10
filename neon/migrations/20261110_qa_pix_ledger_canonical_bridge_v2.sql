-- SIGAPRO QA-only: fix the hosted PIX reserve -> provider order -> canonical guide
-- -> signed webhook bridge. Do not execute in production and do not copy QA rows.
-- This only provisions issuance metadata; it NEVER marks a guide paid.
--
-- Previous QA implementation required bank_reference BEFORE the order was
-- issued and wrote a ledger that mp_qa_webhook_settle_v1 never read.
-- Both contradictions made the hosted payment journey impossible.
CREATE OR REPLACE FUNCTION public.qa_pix_sandbox_order_v1(
  _municipality_id uuid, _guide_code text, _idem uuid, _action text,
  _order_id text DEFAULT NULL, _payment_id text DEFAULT NULL,
  _qr_code text DEFAULT NULL, _provider_status text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'pg_catalog','public' SET row_security = 'off'
AS $function$
DECLARE
  g public.payment_guides%rowtype;
  rec public.qa_pix_sandbox_orders_v1%rowtype;
  mirrored public.mp_qa_pix_orders_v1%rowtype;
  can_bind boolean;
BEGIN
  -- Worker uses a separate, non-BYPASSRLS Neon login. Never grant this
  -- endpoint to authenticated users, anonymous visitors or app admins.
  IF session_user IS DISTINCT FROM 'sigapro_qa_webhook_worker' THEN
    RAISE EXCEPTION 'QA_PIX_WORKER_ONLY' USING ERRCODE='42501';
  END IF;
  IF _municipality_id IS NULL OR _idem IS NULL OR
     _guide_code !~ '^DAM-PRE-QA-[A-Za-z0-9-]{8,100}$' OR
     _action NOT IN ('get','reserve','record') THEN
    RAISE EXCEPTION 'QA_PIX_INVALID_ACTION' USING ERRCODE='22023';
  END IF;
  SELECT * INTO g FROM public.payment_guides
  WHERE municipality_id=_municipality_id AND guide_number=_guide_code
  FOR UPDATE;
  IF NOT FOUND OR g.process_id IS NULL OR
     NOT EXISTS(SELECT 1 FROM public.processes p WHERE p.id=g.process_id
       AND p.tenant_id=g.municipality_id AND p.municipality_id=g.municipality_id)
     OR coalesce(g.paid,false) OR
     lower(coalesce(g.status,'')) IN ('compensada','confirmed','confirmado','paid','pago')
     OR g.collection_mode_snapshot IS DISTINCT FROM 'sigapro' OR
     g.amount IS NULL OR g.amount<=0 OR g.amount>999999999999.99 THEN
    RAISE EXCEPTION 'QA_PIX_GUIDE_NOT_ELIGIBLE' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(
     SELECT 1 FROM public.municipal_collection_configurations c
     WHERE c.municipality_id=_municipality_id AND c.mode='sigapro'
       AND c.environment='test' AND c.status='active'
  ) OR NOT EXISTS(
     SELECT 1 FROM public.municipal_payment_provider_connections p
     WHERE p.municipality_id=_municipality_id AND p.provider='mercado_pago'
       AND p.environment='test' AND p.status='active'
  ) THEN
    RAISE EXCEPTION 'QA_PIX_TEST_PROVIDER_NOT_ACTIVE' USING ERRCODE='42501';
  END IF;
  SELECT * INTO rec FROM public.qa_pix_sandbox_orders_v1
  WHERE guide_id=g.id FOR UPDATE;
  SELECT * INTO mirrored FROM public.mp_qa_pix_orders_v1
  WHERE guide_id=g.id FOR UPDATE;
  -- A prior boleto or distinct legacy PIX must never be overwritten.
  IF (g.payment_provider IS NOT NULL AND g.payment_provider<>'mercado_pago') OR
     (g.provider_environment IS NOT NULL AND g.provider_environment<>'test') OR
     nullif(g.barcode,'') IS NOT NULL OR
     nullif(g.digitable_line,'') IS NOT NULL OR
     (g.bank_reference IS NOT NULL AND
        (rec.guide_id IS NULL OR g.bank_reference IS DISTINCT FROM rec.bank_order_id))
  THEN RAISE EXCEPTION 'QA_PIX_GUIDE_ALREADY_LINKED' USING ERRCODE='42501';
  END IF;

  IF _action='reserve' THEN
    IF g.original_pdf_key IS NOT NULL OR g.document_snapshot IS NOT NULL THEN
      RAISE EXCEPTION 'QA_PIX_DOCUMENT_ALREADY_FROZEN' USING ERRCODE='42501';
    END IF;
    INSERT INTO public.qa_pix_sandbox_orders_v1
      (guide_id,municipality_id,guide_number,amount,idempotency_key)
    VALUES(g.id,g.municipality_id,g.guide_number,g.amount,_idem)
    ON CONFLICT(guide_id) DO NOTHING;
    INSERT INTO public.mp_qa_pix_orders_v1
      (guide_id,municipality_id,guide_number,amount,idempotency_key)
    VALUES(g.id,g.municipality_id,g.guide_number,g.amount,_idem)
    ON CONFLICT(guide_id) DO NOTHING;
  END IF;

  SELECT * INTO rec FROM public.qa_pix_sandbox_orders_v1
   WHERE guide_id=g.id FOR UPDATE;
  SELECT * INTO mirrored FROM public.mp_qa_pix_orders_v1
   WHERE guide_id=g.id FOR UPDATE;
  IF rec.guide_id IS NULL THEN
    IF _action='get' AND mirrored.guide_id IS NULL THEN RETURN NULL; END IF;
    RAISE EXCEPTION 'QA_PIX_LEGACY_ORDER_REQUIRES_REVIEW' USING ERRCODE='42501';
  END IF;
  IF mirrored.guide_id IS NULL OR rec.idempotency_key IS DISTINCT FROM _idem
    OR mirrored.idempotency_key IS DISTINCT FROM _idem
    OR rec.amount IS DISTINCT FROM g.amount
    OR mirrored.amount IS DISTINCT FROM g.amount
    OR mirrored.municipality_id IS DISTINCT FROM _municipality_id
    OR rec.municipality_id IS DISTINCT FROM _municipality_id
    OR rec.guide_number IS DISTINCT FROM g.guide_number
    OR mirrored.guide_number IS DISTINCT FROM g.guide_number
    OR mirrored.order_id IS DISTINCT FROM rec.bank_order_id
    OR (mirrored.payment_id IS NOT NULL
        AND mirrored.payment_id IS DISTINCT FROM rec.bank_payment_id)
  THEN RAISE EXCEPTION 'QA_PIX_TWO_LEDGERS_DIVERGED' USING ERRCODE='42501';
  END IF;

  IF _action='record' THEN
    IF _order_id !~ '^[A-Za-z0-9_-]{6,100}$' OR
       (_payment_id IS NOT NULL AND _payment_id !~ '^[A-Za-z0-9_-]{1,100}$') OR
       length(coalesce(_provider_status,''))>80 OR
       length(coalesce(_qr_code,''))>3000 OR
       (rec.bank_order_id IS NOT NULL AND rec.bank_order_id IS DISTINCT FROM _order_id) OR
       (mirrored.order_id IS NOT NULL AND mirrored.order_id IS DISTINCT FROM _order_id) OR
       (rec.bank_payment_id IS NOT NULL AND _payment_id IS NOT NULL
         AND rec.bank_payment_id IS DISTINCT FROM _payment_id) OR
       (rec.qr_code IS NOT NULL AND _qr_code IS NOT NULL
         AND rec.qr_code IS DISTINCT FROM _qr_code) OR
       (mirrored.qr_code IS NOT NULL AND _qr_code IS NOT NULL
         AND mirrored.qr_code IS DISTINCT FROM _qr_code)
    THEN RAISE EXCEPTION 'QA_PIX_PROVIDER_ORDER_CONFLICT' USING ERRCODE='22023';
    END IF;
    can_bind:=nullif(_qr_code,'') IS NOT NULL OR nullif(rec.qr_code,'') IS NOT NULL;
    IF can_bind AND (
       coalesce(nullif(_qr_code,''),nullif(rec.qr_code,'')) !~*
          '^000201.*BR\.GOV\.BCB\.PIX.*6304[0-9a-f]{4}$' OR
       nullif(coalesce(_payment_id,rec.bank_payment_id),'') IS NULL OR
       coalesce(_provider_status,rec.provider_status) NOT IN
          ('action_required','processed','pending')
    ) THEN
      RAISE EXCEPTION 'QA_PIX_UNVERIFIED_PROVIDER_QR' USING ERRCODE='22023';
    END IF;
    IF g.document_snapshot IS NOT NULL OR g.original_pdf_key IS NOT NULL THEN
      IF g.bank_reference IS DISTINCT FROM _order_id OR
         g.bank_payment_id IS DISTINCT FROM coalesce(_payment_id,rec.bank_payment_id)
      THEN RAISE EXCEPTION 'QA_PIX_FROZEN_DOCUMENT_CONFLICT' USING ERRCODE='42501'; END IF;
    END IF;
    UPDATE public.qa_pix_sandbox_orders_v1
     SET bank_order_id=_order_id,
         bank_payment_id=coalesce(nullif(_payment_id,''),bank_payment_id),
         qr_code=coalesce(nullif(_qr_code,''),qr_code),
         provider_status=coalesce(nullif(_provider_status,''),provider_status),
         state=CASE WHEN can_bind THEN 'issued' ELSE 'pending' END,
         updated_at=now()
     WHERE guide_id=g.id RETURNING * INTO rec;
    UPDATE public.mp_qa_pix_orders_v1
     SET order_id=rec.bank_order_id,payment_id=rec.bank_payment_id,
         qr_code=rec.qr_code,provider_status=rec.provider_status,
         state=rec.state,updated_at=now()
     WHERE guide_id=g.id RETURNING * INTO mirrored;
    -- Bind only a provider-issued order with valid QR and paymentId, before
    -- freezing the original PDF. A signed webhook remains the ONLY settler.
    IF rec.state='issued' AND g.original_pdf_key IS NULL AND g.document_snapshot IS NULL THEN
      UPDATE public.payment_guides SET
        payment_provider='mercado_pago',provider_environment='test',
        bank_reference=rec.bank_order_id,bank_payment_id=rec.bank_payment_id,
        bank_status=rec.provider_status,bank_status_detail='pix_sandbox',
        pix_code=rec.qr_code,provider_charge_saved_at=coalesce(provider_charge_saved_at,now())
      WHERE id=g.id AND municipality_id=_municipality_id
        AND (bank_reference IS NULL OR bank_reference=rec.bank_order_id)
        AND (bank_payment_id IS NULL OR bank_payment_id=rec.bank_payment_id)
        AND (pix_code IS NULL OR pix_code=rec.qr_code);
      IF NOT FOUND THEN
        RAISE EXCEPTION 'QA_PIX_CANONICAL_GUIDE_BIND_FAILED' USING ERRCODE='42501';
      END IF;
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'state',rec.state,'amount',rec.amount::text,
    'guideCode',rec.guide_number,'municipalityId',rec.municipality_id::text,
    'orderId',rec.bank_order_id,'paymentId',rec.bank_payment_id,
    'qrCode',rec.qr_code,'status',rec.provider_status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.qa_pix_sandbox_order_v1(
  uuid,text,uuid,text,text,text,text,text
) FROM PUBLIC,authenticated,anonymous;
GRANT EXECUTE ON FUNCTION public.qa_pix_sandbox_order_v1(
  uuid,text,uuid,text,text,text,text,text
) TO sigapro_qa_webhook_worker;
