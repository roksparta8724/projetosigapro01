-- QA PIX single-use provider POST claim. No official/production rows changed.
BEGIN;
ALTER TABLE public.mp_qa_pix_orders_v1 ADD COLUMN IF NOT EXISTS provider_post_started_at timestamptz;
CREATE OR REPLACE FUNCTION public.qa_mp_pix_reserve_v2(
 _municipality_id uuid,_guide_code text,_key uuid,_proof_epoch bigint,_proof_mac text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public SET row_security TO off AS $fn$
DECLARE g public.payment_guides; r jsonb; did_claim boolean:=false;
BEGIN
 SELECT * INTO g FROM public.payment_guides
 WHERE municipality_id=_municipality_id AND guide_number=_guide_code;
 IF NOT FOUND OR NOT public.qa_mp_pix_verify_proof_v1(
  'reserve',_municipality_id,_guide_code,_key,g.amount,'','','','',_proof_epoch,_proof_mac)
 THEN RAISE EXCEPTION 'Comprovação bancária da reserva PIX obrigatória'; END IF;
 r:=public.qa_mp_pix_reserve_v1(_municipality_id,_guide_code,_key);
 UPDATE public.mp_qa_pix_orders_v1 p
 SET provider_post_started_at=clock_timestamp(),updated_at=now()
 WHERE p.guide_id=(r->>'guide_id')::uuid
 AND p.municipality_id=_municipality_id
 AND p.provider_post_started_at IS NULL AND p.order_id IS NULL
 RETURNING true INTO did_claim;
 RETURN r || jsonb_build_object('may_post',coalesce(did_claim,false));
END $fn$;
COMMIT;
NOTIFY pgrst,'reload schema';