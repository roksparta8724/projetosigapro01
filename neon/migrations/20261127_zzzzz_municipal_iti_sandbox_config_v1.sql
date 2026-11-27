-- QA credential registry: no production policy or credentials are provisioned.
CREATE TABLE IF NOT EXISTS private.municipal_iti_sandbox_configuration_v1(
 municipality_id uuid PRIMARY KEY REFERENCES public.municipalities(id),
 ciphertext text NOT NULL CHECK(length(ciphertext) BETWEEN 40 AND 16000),
 revision uuid NOT NULL DEFAULT gen_random_uuid(),
 updated_by uuid NOT NULL REFERENCES public.profiles(id),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE private.municipal_iti_sandbox_configuration_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.municipal_iti_sandbox_configuration_v1 FROM PUBLIC,anonymous,authenticated;
CREATE OR REPLACE FUNCTION public.municipal_iti_sandbox_config_command_v1(_municipality_id uuid,_action text,_payload text,_epoch text,_mac text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,private SET row_security TO off AS $fn$
DECLARE actor uuid; k text; expected text; body jsonb; c private.municipal_iti_sandbox_configuration_v1%rowtype; ctx jsonb;
BEGIN
 actor:=public.current_profile_id();
 IF actor IS NULL OR _municipality_id IS NULL OR _action IS NULL OR _action NOT IN ('get','save','resolve') OR _payload IS NULL OR length(_payload)>24000 OR _payload !~ '^[A-Za-z0-9+/=]+$' OR _epoch IS NULL OR _epoch !~ '^[0-9]{10,11}$' OR _mac IS NULL OR _mac !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Operação não autorizada.'; END IF;
 IF abs(extract(epoch FROM clock_timestamp())::bigint-_epoch::bigint)>120 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Comprovação expirada.'; END IF;
 SELECT key_hex INTO k FROM sigapro_private.bank_charge_receipt_key WHERE singleton IS TRUE;
 IF k IS NULL THEN RAISE EXCEPTION 'Comprovação indisponível.'; END IF;
 expected:=encode(extensions.hmac(convert_to(concat_ws(chr(10),'sigapro-iti-config-v1',_municipality_id::text,_action,_payload,_epoch),'UTF8'),extensions.hmac(convert_to('sigapro-iti-config-command-v1','UTF8'),decode(k,'hex'),'sha256'),'sha256'),'hex');
 IF expected IS DISTINCT FROM _mac THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Comprovação inválida.'; END IF;
 body:=convert_from(decode(_payload,'base64'),'UTF8')::jsonb;
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Configuração inválida.'; END IF;
 IF _action='resolve' THEN
  ctx:=public.get_process_artifact_signature_context_v1((body->>'processId')::uuid,body->>'signerSlot');
  IF ctx->>'municipality_id' IS DISTINCT FROM _municipality_id::text OR ctx->>'profile_id' IS DISTINCT FROM actor::text OR body->>'signerSlot' NOT IN ('diretoria','secretaria') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Competência não autorizada.'; END IF;
  PERFORM private.certified_signature_snapshot_v1(_municipality_id,(body->>'processId')::uuid,(body->>'requestId')::uuid,actor,body->>'artifactType',body->>'signerSlot','icp_brasil');
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=actor AND p.municipality_id=_municipality_id AND p.role='prefeitura_admin' AND p.account_status='active' AND p.deleted_at IS NULL) AND NOT coalesce(public.is_master(),false) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Gestão municipal não autorizada.'; END IF;
 END IF;
 IF _action='save' THEN
  IF coalesce(body->>'ciphertext','') !~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' OR length(body->>'ciphertext')>16000 THEN RAISE EXCEPTION 'Credenciais inválidas.'; END IF;
  INSERT INTO private.municipal_iti_sandbox_configuration_v1(municipality_id,ciphertext,updated_by) VALUES(_municipality_id,body->>'ciphertext',actor)
  ON CONFLICT(municipality_id) DO UPDATE SET ciphertext=excluded.ciphertext,revision=gen_random_uuid(),updated_by=actor,updated_at=clock_timestamp();
 END IF;
 SELECT * INTO c FROM private.municipal_iti_sandbox_configuration_v1 WHERE municipality_id=_municipality_id;
 IF c.municipality_id IS NULL THEN RETURN jsonb_build_object('configured',false); END IF;
 IF _action='resolve' THEN RETURN jsonb_build_object('configured',true,'ciphertext',c.ciphertext,'revision',c.revision); END IF;
 RETURN jsonb_build_object('configured',true,'revision',c.revision,'updatedAt',c.updated_at);
END $fn$;
REVOKE ALL ON FUNCTION public.municipal_iti_sandbox_config_command_v1(uuid,text,text,text,text) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.municipal_iti_sandbox_config_command_v1(uuid,text,text,text,text) TO authenticated;
