-- SIGAPRO QA ONLY. Durable PIX sandbox order receipts for hosted Preview.
-- No municipal payment_guides are updated by this feature.
-- No public or authenticated role may read, write or enumerate these rows.
CREATE TABLE IF NOT EXISTS public.qa_pix_sandbox_orders_v1 (
  guide_id uuid PRIMARY KEY REFERENCES public.payment_guides(id) ON DELETE RESTRICT,
  municipality_id uuid NOT NULL,
  guide_number text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  idempotency_key uuid NOT NULL UNIQUE,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','issued')),
  bank_order_id text,
  bank_payment_id text,
  qr_code text,
  provider_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.qa_pix_sandbox_orders_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.qa_pix_sandbox_orders_v1 FROM PUBLIC;
REVOKE ALL ON TABLE public.qa_pix_sandbox_orders_v1 FROM anonymous;
REVOKE ALL ON TABLE public.qa_pix_sandbox_orders_v1 FROM authenticated;

CREATE OR REPLACE FUNCTION public.qa_pix_sandbox_order_v1(
  _municipality_id uuid,
  _guide_code text,
  _idem uuid,
  _action text,
  _order_id text DEFAULT NULL,
  _payment_id text DEFAULT NULL,
  _qr_code text DEFAULT NULL,
  _provider_status text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE g public.payment_guides; rec public.qa_pix_sandbox_orders_v1;
BEGIN
  IF session_user NOT IN ('sigapro_qa_webhook_worker','neondb_owner') THEN
    RAISE EXCEPTION 'QA_PIX_WORKER_ONLY' USING ERRCODE='42501';
  END IF;
  IF _action NOT IN ('get','reserve','record') OR _idem IS NULL THEN
    RAISE EXCEPTION 'QA_PIX_INVALID_ACTION' USING ERRCODE='22023';
  END IF;
  SELECT * INTO g FROM public.payment_guides
    WHERE municipality_id=_municipality_id AND guide_number=_guide_code
    FOR UPDATE;
  IF g.id IS NULL OR coalesce(g.paid,false) OR
     lower(coalesce(g.status,'')) IN ('pago','paid','compensada','confirmed','confirmado') OR
     g.collection_mode_snapshot IS DISTINCT FROM 'sigapro' OR
     g.provider_environment IS DISTINCT FROM 'test' OR
     g.payment_provider IS DISTINCT FROM 'mercado_pago' OR
     nullif(g.bank_reference,'') IS NULL OR g.amount <= 0 THEN
    RAISE EXCEPTION 'QA_PIX_GUIDE_NOT_ELIGIBLE' USING ERRCODE='42501';
  END IF;
  IF _action='reserve' THEN
    INSERT INTO public.qa_pix_sandbox_orders_v1
      (guide_id,municipality_id,guide_number,amount,idempotency_key)
    VALUES (g.id,g.municipality_id,g.guide_number,g.amount,_idem)
    ON CONFLICT(guide_id) DO NOTHING;
  END IF;
  SELECT * INTO rec FROM public.qa_pix_sandbox_orders_v1 WHERE guide_id=g.id FOR UPDATE;
  IF rec.guide_id IS NULL THEN RETURN NULL; END IF;
  IF rec.idempotency_key IS DISTINCT FROM _idem OR
     rec.municipality_id IS DISTINCT FROM g.municipality_id OR
     rec.guide_number IS DISTINCT FROM g.guide_number OR
     rec.amount IS DISTINCT FROM g.amount THEN
    RAISE EXCEPTION 'QA_PIX_RESERVATION_MISMATCH' USING ERRCODE='42501';
  END IF;
  IF _action='record' THEN
    IF coalesce(length(_order_id),0) < 4 OR length(_order_id)>120 OR
       _order_id !~ '^[A-Za-z0-9_-]+$' OR
       (_payment_id IS NOT NULL AND length(_payment_id)>120) OR
       (_qr_code IS NOT NULL AND length(_qr_code)>4096) OR
       (_provider_status IS NOT NULL AND length(_provider_status)>80) OR
       (rec.bank_order_id IS NOT NULL AND rec.bank_order_id IS DISTINCT FROM _order_id) THEN
      RAISE EXCEPTION 'QA_PIX_ORDER_INTEGRITY' USING ERRCODE='22023';
    END IF;
    UPDATE public.qa_pix_sandbox_orders_v1
      SET bank_order_id=_order_id,
          bank_payment_id=coalesce(_payment_id,bank_payment_id),
          qr_code=coalesce(_qr_code,qr_code),
          provider_status=coalesce(_provider_status,provider_status),
          state=CASE WHEN nullif(_qr_code,'') IS NOT NULL THEN 'issued' ELSE state END,
          updated_at=now()
    WHERE guide_id=g.id RETURNING * INTO rec;
  END IF;
  RETURN jsonb_build_object(
    'state',rec.state,'amount',rec.amount::text,
    'guideCode',rec.guide_number,'municipalityId',rec.municipality_id::text,
    'orderId',rec.bank_order_id,'paymentId',rec.bank_payment_id,
    'qrCode',rec.qr_code,'status',rec.provider_status
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.qa_pix_sandbox_order_v1(uuid,text,uuid,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qa_pix_sandbox_order_v1(uuid,text,uuid,text,text,text,text,text)
  TO sigapro_qa_webhook_worker;
