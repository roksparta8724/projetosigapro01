-- QA finance hardening: only the server can reserve/save PIX from provider data.
-- Existing v1 implementations remain internal; direct authenticated calls revoked.
-- No guide/payment rows, webhook data or production configuration modified.
BEGIN;
CREATE OR REPLACE FUNCTION public.qa_mp_pix_verify_proof_v1(
 _action text,_municipality_id uuid,_guide_code text,_key uuid,_amount numeric,
 _order_id text,_payment_id text,_status text,_qr_code text,
 _proof_epoch bigint,_proof_mac text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public,sigapro_private,extensions SET row_security TO off
AS $qa$
DECLARE secret_hex text; fields text[]; expected text;
BEGIN
 IF _action NOT IN ('reserve','save') OR _proof_epoch IS NULL OR
  abs(extract(epoch FROM clock_timestamp())::bigint-_proof_epoch)>300 OR
  _proof_mac IS NULL OR _proof_mac !~ '^[a-f0-9]{64}$' OR
  _municipality_id IS NULL OR _guide_code IS NULL OR _key IS NULL OR
  _amount IS NULL OR _amount<=0 OR _amount>999999999999.99 THEN
  RETURN false;
 END IF;
 SELECT key_hex INTO secret_hex FROM sigapro_private.bank_charge_receipt_key WHERE singleton IS TRUE;
 IF secret_hex IS NULL OR secret_hex !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
 fields:=ARRAY[
  'sigapro-qa-pix-v1',_action,_municipality_id::text,_guide_code,_key::text,
  (_amount::numeric(14,2))::text,
  coalesce(_order_id,''),coalesce(_payment_id,''),coalesce(_status,''),
  coalesce(_qr_code,''),_proof_epoch::text
 ];
 IF EXISTS (SELECT 1 FROM unnest(fields) f WHERE
  position(chr(10) in f)>0 OR position(chr(13) in f)>0) THEN RETURN false; END IF;
 expected:=encode(extensions.hmac(convert_to(array_to_string(fields,chr(10)),'UTF8'),decode(secret_hex,'hex'),'sha256'),'hex');
 RETURN expected=_proof_mac;
END $qa$;

CREATE OR REPLACE FUNCTION public.qa_mp_pix_reserve_v2(
 _municipality_id uuid,_guide_code text,_key uuid,_proof_epoch bigint,_proof_mac text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public SET row_security TO off AS $qa$
DECLARE g public.payment_guides;
BEGIN
 SELECT * INTO g FROM public.payment_guides
 WHERE municipality_id=_municipality_id AND guide_number=_guide_code;
 IF NOT FOUND OR NOT public.qa_mp_pix_verify_proof_v1(
  'reserve',_municipality_id,_guide_code,_key,g.amount,'','','','',_proof_epoch,_proof_mac)
 THEN RAISE EXCEPTION 'Comprovação bancária da reserva PIX obrigatória'; END IF;
 RETURN public.qa_mp_pix_reserve_v1(_municipality_id,_guide_code,_key);
END $qa$;

CREATE OR REPLACE FUNCTION public.qa_mp_pix_save_v2(
 _municipality_id uuid,_guide_code text,_key uuid,_order_id text,
 _payment_id text,_status text,_qr_code text,_amount numeric,
 _proof_epoch bigint,_proof_mac text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public SET row_security TO off AS $qa$
BEGIN
 IF NOT public.qa_mp_pix_verify_proof_v1(
  'save',_municipality_id,_guide_code,_key,_amount,_order_id,
  _payment_id,_status,_qr_code,_proof_epoch,_proof_mac)
 THEN RAISE EXCEPTION 'Comprovação bancária do PIX obrigatória'; END IF;
 RETURN public.qa_mp_pix_save_v1(_municipality_id,_guide_code,_key,
  _order_id,_payment_id,_status,_qr_code,_amount);
END $qa$;

REVOKE ALL ON FUNCTION public.qa_mp_pix_verify_proof_v1(text,uuid,text,uuid,numeric,text,text,text,text,bigint,text) FROM PUBLIC,anonymous,authenticated;
REVOKE ALL ON FUNCTION public.qa_mp_pix_reserve_v1(uuid,text,uuid) FROM PUBLIC,anonymous,authenticated;
REVOKE ALL ON FUNCTION public.qa_mp_pix_save_v1(uuid,text,uuid,text,text,text,text,numeric) FROM PUBLIC,anonymous,authenticated;
REVOKE ALL ON FUNCTION public.qa_mp_pix_reserve_v2(uuid,text,uuid,bigint,text) FROM PUBLIC,anonymous,authenticated;
REVOKE ALL ON FUNCTION public.qa_mp_pix_save_v2(uuid,text,uuid,text,text,text,text,numeric,bigint,text) FROM PUBLIC,anonymous,authenticated;
GRANT EXECUTE ON FUNCTION public.qa_mp_pix_reserve_v2(uuid,text,uuid,bigint,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qa_mp_pix_save_v2(uuid,text,uuid,text,text,text,text,numeric,bigint,text) TO authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';