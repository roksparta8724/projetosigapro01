-- Server-attested ICP sandbox session operations, never a permit issuance route.
CREATE OR REPLACE FUNCTION public.certified_icp_session_command_v1(_municipality_id uuid, _action text, _payload text, _epoch text, _mac text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
 SET row_security TO 'off'
AS $function$
DECLARE actor uuid; secret text; expected text; body jsonb; s private.certified_signature_sessions_v1%rowtype; context jsonb; cpf text; current_snapshot text; process_id uuid; request_id uuid; artifact_type text; slot text; state text; pdf_sha text; range_sha text;
BEGIN
 actor:=public.current_profile_id();
 IF actor IS NULL OR _municipality_id IS NULL OR _action IS NULL OR _action NOT IN ('begin','consume','reauthorize')
 OR _payload IS NULL OR length(_payload)>16000 OR _payload !~ '^[A-Za-z0-9+/=]+$' OR _epoch IS NULL OR _epoch !~ '^[0-9]{10,11}$' OR _mac IS NULL OR _mac !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Sessão certificada não autorizada.'; END IF;
 IF abs(extract(epoch FROM clock_timestamp())::bigint-_epoch::bigint)>120 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Comprovação de servidor expirada.'; END IF;
 SELECT key_hex INTO secret FROM sigapro_private.bank_charge_receipt_key WHERE singleton IS TRUE;
 IF secret IS NULL THEN RAISE EXCEPTION 'Comprovação de servidor indisponível.'; END IF;
 expected:=encode(extensions.hmac(convert_to(concat_ws(chr(10),'sigapro-certified-session-v1',_municipality_id::text,_action,_payload,_epoch),'UTF8'),extensions.hmac(convert_to('sigapro-certified-session-domain-v1','UTF8'),decode(secret,'hex'),'sha256'),'sha256'),'hex');
 IF expected IS DISTINCT FROM _mac THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Comprovação de servidor inválida.'; END IF;
 body:=convert_from(decode(_payload,'base64'),'UTF8')::jsonb;
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR body->>'profileId' IS DISTINCT FROM actor::text THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Identidade de assinatura incompatível.'; END IF;
 state:=body->>'state'; pdf_sha:=body->>'preparedPdfSha256'; range_sha:=body->>'byteRangeSha256';
 IF state IS NULL OR state !~ '^[A-Za-z0-9_-]{43}$' OR pdf_sha IS NULL OR pdf_sha !~ '^[a-f0-9]{64}$' OR range_sha IS NULL OR range_sha !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Vinculação de documento inválida.'; END IF;
 SELECT p.cpf INTO cpf FROM public.profiles p WHERE p.id=actor AND p.municipality_id=_municipality_id AND p.account_status='active' AND p.deleted_at IS NULL;
 IF cpf IS NULL OR regexp_replace(cpf,'[^0-9]','','g') !~ '^[0-9]{11}$' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='CPF do servidor não cadastrado ou inválido.'; END IF;
 IF _action='begin' THEN
  process_id:=(body->>'processId')::uuid; request_id:=(body->>'requestId')::uuid; artifact_type:=body->>'artifactType'; slot:=body->>'signerSlot';
  IF process_id IS NULL OR request_id IS NULL OR artifact_type IS NULL OR artifact_type NOT IN ('construction_permit','habite_se_permit') OR slot IS NULL OR slot NOT IN ('diretoria','secretaria') THEN RAISE EXCEPTION 'Solicitação de assinatura inválida.'; END IF;
 ELSE
  SELECT * INTO s FROM private.certified_signature_sessions_v1 x WHERE x.state_sha256=encode(extensions.digest(state,'sha256'),'hex') AND x.municipality_id=_municipality_id AND x.profile_id=actor AND x.mode='icp_brasil' AND x.environment='sandbox' AND x.prepared_pdf_sha256=pdf_sha AND x.byte_range_sha256=range_sha AND x.expires_at>clock_timestamp() FOR UPDATE;
  IF s.state_sha256 IS NULL OR (_action='consume' AND s.consumed_at IS NOT NULL) OR (_action='reauthorize' AND s.consumed_at IS NULL) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Sessão inválida, expirada ou já utilizada.'; END IF;
  process_id:=s.process_id; request_id:=s.request_id; artifact_type:=s.artifact_type; slot:=s.signer_slot;
 END IF;
 context:=public.get_process_artifact_signature_context_v1(process_id,slot);
 IF context->>'profile_id' IS DISTINCT FROM actor::text OR context->>'municipality_id' IS DISTINCT FROM _municipality_id::text OR context->>'process_id' IS DISTINCT FROM process_id::text OR context->>'signer_slot' IS DISTINCT FROM slot THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Competência municipal não confirmada.'; END IF;
 IF _action='begin' THEN
  PERFORM private.begin_certified_signature_session_v1(state,body->>'nonce',_municipality_id,process_id,request_id,actor,artifact_type,slot,'icp_brasil',pdf_sha,range_sha);
  RETURN jsonb_build_object('ok',true,'environment','sandbox','issuanceAuthorized',false);
 ELSIF _action='consume' THEN
  RETURN private.consume_certified_signature_session_v1(state,_municipality_id,actor,pdf_sha,range_sha);
 END IF;
 current_snapshot:=private.certified_signature_snapshot_v1(_municipality_id,process_id,request_id,actor,artifact_type,slot,'icp_brasil');
 IF current_snapshot IS DISTINCT FROM s.permit_snapshot_sha256 OR s.expires_at<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Versão do alvará alterada ou sessão expirada.'; END IF;
 RETURN jsonb_build_object('profileId',actor,'municipalityId',_municipality_id,'cpf',cpf);
END $function$;
REVOKE ALL ON FUNCTION public.certified_icp_session_command_v1(uuid,text,text,text,text) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.certified_icp_session_command_v1(uuid,text,text,text,text) TO authenticated;
