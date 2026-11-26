-- Keep the legacy activation RPC for manual and sandbox use only.
-- A missing, stale or unrelated test cannot activate a Mercado Pago connection.
-- Production Mercado Pago activation remains exclusive to the signed v2 RPC.
CREATE OR REPLACE FUNCTION public.activate_municipal_payment_connection_v1(_municipality_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','extensions' SET row_security TO 'off'
AS $function$
DECLARE
  connection public.municipal_payment_provider_connections;
BEGIN
  IF public.is_municipal_payment_admin(_municipality_id) IS DISTINCT FROM TRUE OR _municipality_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Sem permissão para administrar pagamentos desta Prefeitura';
  END IF;
  SELECT * INTO connection FROM public.municipal_payment_provider_connections
    WHERE municipality_id=_municipality_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conexão municipal ainda não cadastrada'; END IF;
  IF connection.provider='bank_direct' THEN
    RAISE EXCEPTION 'Banco/convênio cadastrado, mas ainda sem adaptador homologado para emissão automática';
  ELSIF connection.provider='mercado_pago' THEN
    IF connection.environment IS DISTINCT FROM 'test' THEN
      RAISE EXCEPTION 'A ativação de produção exige comprovação segura do servidor';
    END IF;
    IF connection.last_test_status IS DISTINCT FROM 'ok'
       OR connection.credentials_ciphertext IS NULL
       OR connection.last_tested_at IS NULL
       OR connection.last_tested_at < clock_timestamp() - interval '24 hours'
       OR connection.last_tested_at > clock_timestamp() + interval '5 minutes'
       OR connection.verified_test_digest IS DISTINCT FROM
          encode(extensions.digest(connection.credentials_ciphertext,'sha256'),'hex')||':'||
          encode(extensions.digest(coalesce(connection.webhook_secret_ciphertext,''),'sha256'),'hex')
    THEN RAISE EXCEPTION 'Teste novamente as credenciais atuais antes de ativar o Mercado Pago'; END IF;
  ELSIF connection.provider IS DISTINCT FROM 'manual' THEN
    RAISE EXCEPTION 'Provedor ainda não homologado';
  END IF;
  UPDATE public.municipal_payment_provider_connections SET
    status='active',updated_by=public.current_profile_id(),updated_at=clock_timestamp()
    WHERE municipality_id=_municipality_id;
  RETURN public.get_municipal_payment_connection_v1(_municipality_id);
END $function$;
REVOKE ALL ON FUNCTION public.activate_municipal_payment_connection_v1(uuid) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.activate_municipal_payment_connection_v1(uuid) TO authenticated;
