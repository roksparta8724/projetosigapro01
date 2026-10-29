-- SIGAPRO isolated QA: durable tenant-scoped PIX reservations (no production migration).
-- Each guide may have at most one provider order. No automatic settlement.
BEGIN;
CREATE TABLE IF NOT EXISTS public.mp_qa_pix_orders_v1(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 municipality_id uuid NOT NULL REFERENCES public.municipalities(id),
 guide_id uuid NOT NULL UNIQUE REFERENCES public.payment_guides(id),
 guide_number text NOT NULL,
 amount numeric(14,2) NOT NULL CHECK (amount>0),
 idempotency_key uuid NOT NULL,
 order_id text UNIQUE,
 payment_id text,
 qr_code text,
 provider_status text,
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','issued')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(municipality_id,guide_number)
);
ALTER TABLE public.mp_qa_pix_orders_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mp_qa_pix_orders_v1 FROM PUBLIC,anonymous,authenticated;

CREATE OR REPLACE FUNCTION public.qa_mp_pix_reserve_v1(_municipality_id uuid,_guide_code text,_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public SET row_security TO off AS $fn$
DECLARE g public.payment_guides; r public.mp_qa_pix_orders_v1;
BEGIN
 IF NOT public.qa_boleto_access_v1(_municipality_id,_guide_code) THEN
  RAISE EXCEPTION 'Guia de teste não autorizada para esta Prefeitura';
 END IF;
 SELECT * INTO g FROM public.payment_guides
 WHERE municipality_id=_municipality_id AND guide_number=_guide_code FOR UPDATE;
 IF NOT FOUND OR g.amount<=0 OR coalesce(g.paid,false) OR
  lower(coalesce(g.status,'')) IN ('paid','pago','confirmed','confirmado','compensada') OR
  g.collection_mode_snapshot='municipal_system' THEN
  RAISE EXCEPTION 'Guia não elegível para cobrança PIX isolada';
 END IF;
 SELECT * INTO r FROM public.mp_qa_pix_orders_v1 WHERE guide_id=g.id FOR UPDATE;
 IF FOUND THEN
  IF r.idempotency_key<>_key OR r.amount<>g.amount OR
   (nullif(g.bank_reference,'') IS NOT NULL AND g.bank_reference IS DISTINCT FROM r.order_id) THEN
   RAISE EXCEPTION 'Guia já vinculada a outra cobrança';
  END IF;
 ELSE
  IF nullif(g.bank_reference,'') IS NOT NULL OR nullif(g.barcode,'') IS NOT NULL OR
   nullif(g.digitable_line,'') IS NOT NULL THEN
   RAISE EXCEPTION 'Guia com boleto ou outra cobrança: PIX paralelo bloqueado';
  END IF;
  INSERT INTO public.mp_qa_pix_orders_v1(municipality_id,guide_id,guide_number,amount,idempotency_key)
  VALUES(_municipality_id,g.id,g.guide_number,g.amount,_key) RETURNING * INTO r;
 END IF;
 RETURN to_jsonb(r);
END $fn$;

CREATE OR REPLACE FUNCTION public.qa_mp_pix_save_v1(
 _municipality_id uuid,_guide_code text,_key uuid,_order_id text,
 _payment_id text,_status text,_qr_code text,_amount numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public SET row_security TO off AS $fn$
DECLARE g public.payment_guides; r public.mp_qa_pix_orders_v1;
BEGIN
 IF NOT public.qa_boleto_access_v1(_municipality_id,_guide_code) THEN
  RAISE EXCEPTION 'Guia de teste não autorizada';
 END IF;
 SELECT * INTO g FROM public.payment_guides
 WHERE municipality_id=_municipality_id AND guide_number=_guide_code FOR UPDATE;
 SELECT * INTO r FROM public.mp_qa_pix_orders_v1
 WHERE guide_id=g.id AND municipality_id=_municipality_id FOR UPDATE;
 IF NOT FOUND OR g.id IS NULL OR r.idempotency_key<>_key OR
  g.amount IS DISTINCT FROM _amount OR coalesce(g.paid,false) OR
  g.collection_mode_snapshot='municipal_system' OR
  lower(coalesce(g.status,'')) IN ('paid','pago','confirmed','confirmado','compensada') OR
  (g.bank_reference IS NOT NULL AND g.bank_reference IS DISTINCT FROM _order_id) OR
  (r.order_id IS NOT NULL AND r.order_id IS DISTINCT FROM _order_id) THEN
  RAISE EXCEPTION 'Ordem PIX não corresponde à guia de teste reservada';
 END IF;
 IF _order_id !~ '^[A-Za-z0-9_-]{6,100}$' OR length(coalesce(_payment_id,''))>128 OR
  length(coalesce(_status,''))>80 OR length(coalesce(_qr_code,''))>2048 OR
  (coalesce(_qr_code,'')<>'' AND _qr_code !~* '^000201.*BR\.GOV\.BCB\.PIX.*6304[0-9a-f]{4}$') THEN
  RAISE EXCEPTION 'Metadados PIX inválidos';
 END IF;
 IF r.qr_code IS NOT NULL AND r.qr_code IS DISTINCT FROM _qr_code AND coalesce(_qr_code,'')<>'' THEN
  RAISE EXCEPTION 'QR PIX já vinculado a outra transação';
 END IF;
 UPDATE public.mp_qa_pix_orders_v1
 SET order_id=_order_id,payment_id=nullif(_payment_id,''),provider_status=_status,
  qr_code=coalesce(nullif(_qr_code,''),qr_code),
  state=CASE WHEN coalesce(nullif(_qr_code,''),qr_code) IS NOT NULL THEN 'issued' ELSE 'pending' END,
  updated_at=now() WHERE id=r.id RETURNING * INTO r;
 -- Preview PIX remains in a separate tenant-scoped QA ledger.
 -- Never mutate canonical payment_guides or paid flags from this test endpoint.
 RETURN to_jsonb(r);
END $fn$;

CREATE OR REPLACE FUNCTION public.qa_mp_pix_get_v1(_municipality_id uuid,_guide_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public SET row_security TO off AS $fn$
DECLARE r public.mp_qa_pix_orders_v1;
BEGIN
 IF NOT public.qa_boleto_access_v1(_municipality_id,_guide_code) THEN
  RAISE EXCEPTION 'Guia de teste não autorizada';
 END IF;
 SELECT * INTO r FROM public.mp_qa_pix_orders_v1
 WHERE municipality_id=_municipality_id AND guide_number=_guide_code;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN to_jsonb(r);
END $fn$;

REVOKE ALL ON FUNCTION public.qa_mp_pix_get_v1(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qa_mp_pix_get_v1(uuid,text) TO authenticated;

REVOKE ALL ON FUNCTION public.qa_mp_pix_reserve_v1(uuid,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.qa_mp_pix_save_v1(uuid,text,uuid,text,text,text,text,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qa_mp_pix_reserve_v1(uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qa_mp_pix_save_v1(uuid,text,uuid,text,text,text,text,numeric) TO authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';