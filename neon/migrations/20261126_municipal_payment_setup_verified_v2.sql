-- Municipal self-service banking: bind test evidence to exact encrypted configuration.
-- Production requires server HMAC and a separate explicit activation. No payment is created.
ALTER TABLE public.municipal_payment_provider_connections ADD COLUMN IF NOT EXISTS verified_test_digest text;

CREATE OR REPLACE FUNCTION public.verify_municipal_payment_setup_v2(
 _municipality_id uuid,_environment text,_credential_digest text,_webhook_digest text,
 _ok boolean,_boleto boolean,_pix boolean,_epoch bigint,_mac text,_action text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','extensions','sigapro_private'
SET row_security TO 'off' AS $function$
DECLARE c public.municipal_payment_provider_connections; k text; expected text;
BEGIN
 IF NOT public.is_municipal_payment_admin(_municipality_id) OR _municipality_id IS NULL
 OR _environment NOT IN ('test','production') OR _action NOT IN ('test','activate')
 OR _ok IS NULL OR _boleto IS NULL OR _pix IS NULL OR _epoch IS NULL
 OR abs(extract(epoch FROM clock_timestamp())::bigint-_epoch)>300
 THEN RAISE EXCEPTION 'Comprovação bancária inválida ou expirada'; END IF;
 SELECT * INTO c FROM public.municipal_payment_provider_connections WHERE municipality_id=_municipality_id FOR UPDATE;
 IF NOT FOUND OR c.provider<>'mercado_pago' OR c.environment IS DISTINCT FROM _environment
 OR c.credentials_ciphertext IS NULL
 OR encode(extensions.digest(c.credentials_ciphertext,'sha256'),'hex') IS DISTINCT FROM _credential_digest
 OR encode(extensions.digest(coalesce(c.webhook_secret_ciphertext,''),'sha256'),'hex') IS DISTINCT FROM _webhook_digest
 THEN RAISE EXCEPTION 'A configuração bancária mudou. Salve e teste novamente.'; END IF;
 IF _environment='production' THEN
   IF c.webhook_secret_ciphertext IS NULL THEN RAISE EXCEPTION 'Webhook de produção não configurado'; END IF;
   SELECT key_hex INTO k FROM sigapro_private.bank_charge_receipt_key WHERE singleton IS TRUE;
   IF k IS NULL OR coalesce(_mac,'') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Comprovação segura do servidor obrigatória'; END IF;
   expected:=encode(extensions.hmac(convert_to(array_to_string(ARRAY['sigapro-bank-setup-v2',_action,_municipality_id::text,_environment,_credential_digest,_webhook_digest,
       CASE WHEN _ok THEN '1' ELSE '0' END,CASE WHEN _boleto THEN '1' ELSE '0' END,CASE WHEN _pix THEN '1' ELSE '0' END,_epoch::text],E'\n'),'UTF8'),decode(k,'hex'),'sha256'),'hex');
   IF expected IS DISTINCT FROM _mac THEN RAISE EXCEPTION 'Comprovação bancária inválida'; END IF;
 END IF;
 RETURN true;
END $function$;
REVOKE ALL ON FUNCTION public.verify_municipal_payment_setup_v2(uuid,text,text,text,boolean,boolean,boolean,bigint,text,text) FROM PUBLIC,anonymous,authenticated;

CREATE OR REPLACE FUNCTION public.mark_municipal_payment_test_v2(
 _municipality_id uuid,_environment text,_credential_digest text,_webhook_digest text,
 _ok boolean,_boleto boolean,_pix boolean,_epoch bigint,_mac text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public' SET row_security TO 'off' AS $function$
BEGIN
 PERFORM public.verify_municipal_payment_setup_v2(_municipality_id,_environment,_credential_digest,_webhook_digest,_ok,_boleto,_pix,_epoch,_mac,'test');
 IF _ok AND NOT (_boleto OR _pix) THEN RAISE EXCEPTION 'Nenhum meio de pagamento confirmado'; END IF;
 UPDATE public.municipal_payment_provider_connections SET
 last_tested_at=clock_timestamp(),last_test_status=CASE WHEN _ok THEN 'ok' ELSE 'error' END,
 last_test_message=CASE WHEN _ok THEN format('Conexão técnica validada. Boleto: %s · PIX: %s.',CASE WHEN _boleto THEN 'sim' ELSE 'não' END,CASE WHEN _pix THEN 'sim' ELSE 'não' END) ELSE 'O provedor não confirmou a credencial ou os meios de pagamento.' END,
 verified_test_digest=CASE WHEN _ok THEN _credential_digest||':'||_webhook_digest ELSE NULL END,
 status=CASE WHEN _ok THEN 'configured' ELSE 'error' END,updated_at=clock_timestamp()
 WHERE municipality_id=_municipality_id;
 RETURN public.get_municipal_payment_connection_v1(_municipality_id);
END $function$;
REVOKE ALL ON FUNCTION public.mark_municipal_payment_test_v2(uuid,text,text,text,boolean,boolean,boolean,bigint,text) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.mark_municipal_payment_test_v2(uuid,text,text,text,boolean,boolean,boolean,bigint,text) TO authenticated;
-- An old client cannot mark a real connection tested without server evidence.
REVOKE ALL ON FUNCTION public.mark_municipal_payment_test_v1(uuid,boolean,text) FROM PUBLIC,anonymous,authenticated;

CREATE OR REPLACE FUNCTION public.activate_municipal_payment_connection_v2(
 _municipality_id uuid,_environment text,_credential_digest text,_webhook_digest text,
 _ok boolean,_boleto boolean,_pix boolean,_epoch bigint,_mac text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public' SET row_security TO 'off' AS $function$
BEGIN
 IF _environment IS DISTINCT FROM 'production' OR _ok IS DISTINCT FROM true
 OR _boleto IS DISTINCT FROM false OR _pix IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'Ativação de produção inválida'; END IF;
 PERFORM public.verify_municipal_payment_setup_v2(_municipality_id,_environment,_credential_digest,_webhook_digest,_ok,_boleto,_pix,_epoch,_mac,'activate');
 UPDATE public.municipal_payment_provider_connections SET status='active',updated_by=public.current_profile_id(),updated_at=clock_timestamp()
 WHERE municipality_id=_municipality_id AND last_test_status='ok' AND last_tested_at>=clock_timestamp()-interval '24 hours'
 AND verified_test_digest=_credential_digest||':'||_webhook_digest;
 IF NOT FOUND THEN RAISE EXCEPTION 'Teste novamente as credenciais atuais antes de ativar a produção.'; END IF;
 RETURN public.get_municipal_payment_connection_v1(_municipality_id);
END $function$;
REVOKE ALL ON FUNCTION public.activate_municipal_payment_connection_v2(uuid,text,text,text,boolean,boolean,boolean,bigint,text) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.activate_municipal_payment_connection_v2(uuid,text,text,text,boolean,boolean,boolean,bigint,text) TO authenticated;
