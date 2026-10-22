-- ONLY isolated Neon QA branch — DO NOT apply to production.
-- An independent Mercado Pago PIX sandbox order can be previewed beside a
-- boleto sandbox order without changing canonical DAM paid/bank_reference.
BEGIN;
CREATE TABLE IF NOT EXISTS public.qa_guide_pix_orders (
  guide_id uuid PRIMARY KEY REFERENCES public.payment_guides(id) ON DELETE RESTRICT,
  municipality_id uuid NOT NULL,
  guide_number text NOT NULL,
  order_id text NOT NULL,
  payment_id text,
  qr_code text NOT NULL,
  status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qa_guide_pix_unique_order UNIQUE(order_id),
  CONSTRAINT qa_guide_pix_unique_guide UNIQUE(municipality_id,guide_number)
);
ALTER TABLE public.qa_guide_pix_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.qa_guide_pix_orders FROM PUBLIC, anon, authenticated;
-- No direct table access. All calls use owner and test provider guards.

CREATE OR REPLACE FUNCTION public.qa_get_guide_pix_order_v1(
  _municipality_id uuid, _guide_code text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public SET row_security=off AS $$
DECLARE v_record public.qa_guide_pix_orders;
BEGIN
  IF NOT public.qa_boleto_access_v1(_municipality_id,_guide_code) THEN
    RAISE EXCEPTION 'Sem acesso à guia de homologação PIX';
  END IF;
  SELECT * INTO v_record FROM public.qa_guide_pix_orders
    WHERE municipality_id=_municipality_id AND guide_number=_guide_code;
  IF v_record.guide_id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'orderId',v_record.order_id,
    'paymentId',v_record.payment_id,
    'qrCode',v_record.qr_code,
    'status',v_record.status,
    'environment','test',
    'guideCode',v_record.guide_number);
END $$;

CREATE OR REPLACE FUNCTION public.qa_save_guide_pix_order_v1(
  _municipality_id uuid, _guide_code text, _order jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public SET row_security=off AS $$
DECLARE v_guide public.payment_guides; v_order_id text; v_qr text; v_total numeric;
BEGIN
  IF NOT public.qa_boleto_access_v1(_municipality_id,_guide_code) THEN
    RAISE EXCEPTION 'Sem acesso à guia de homologação PIX';
  END IF;
  SELECT * INTO STRICT v_guide FROM public.payment_guides
    WHERE municipality_id=_municipality_id AND guide_number=_guide_code FOR UPDATE;
  v_order_id := nullif(btrim(_order->>'orderId'),'');
  v_qr := nullif(btrim(_order->>'qrCode'),'');
  IF _order->>'environment' IS DISTINCT FROM 'test' OR
     _order->>'externalReference' IS DISTINCT FROM v_guide.guide_number || '-PIX-QA' OR
     (_order->>'amount') !~ '^[0-9]+(\.[0-9]{1,2})?$' OR
     length(coalesce(v_order_id,'')) NOT BETWEEN 6 AND 128 OR
     length(coalesce(v_qr,'')) NOT BETWEEN 60 AND 1500 OR
     left(v_qr,6) <> '000201' OR
     v_qr !~ '6304[0-9A-Fa-f]{4}$' THEN
    RAISE EXCEPTION 'Order PIX de homologação inválida';
  END IF;
  v_total := (_order->>'amount')::numeric;
  IF v_total IS DISTINCT FROM v_guide.amount THEN
    RAISE EXCEPTION 'Valor PIX diferente do valor da guia original';
  END IF;
  INSERT INTO public.qa_guide_pix_orders(
    guide_id,municipality_id,guide_number,order_id,payment_id,qr_code,status
  ) VALUES(
    v_guide.id,_municipality_id,_guide_code,v_order_id,
    nullif(_order->>'paymentId',''),v_qr, nullif(_order->>'status','')
  ) ON CONFLICT(guide_id) DO UPDATE SET
    payment_id=EXCLUDED.payment_id,
    qr_code=EXCLUDED.qr_code,
    status=EXCLUDED.status,
    updated_at=now()
  WHERE public.qa_guide_pix_orders.order_id=EXCLUDED.order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esta guia já possui outra order PIX; emissão duplicada bloqueada';
  END IF;
  RETURN public.qa_get_guide_pix_order_v1(_municipality_id,_guide_code);
END $$;
REVOKE ALL ON FUNCTION public.qa_get_guide_pix_order_v1(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.qa_save_guide_pix_order_v1(uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qa_get_guide_pix_order_v1(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qa_save_guide_pix_order_v1(uuid,text,jsonb) TO authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';
