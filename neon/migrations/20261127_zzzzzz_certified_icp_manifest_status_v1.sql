-- Read-only recovery of already recorded sandbox evidence after a lost HTTP reply.
-- Never repeats OAuth, signs, writes objects, or changes an official permit.
CREATE OR REPLACE FUNCTION public.certified_icp_manifest_status_v1(_municipality_id uuid,_payload text,_epoch text,_mac text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,private SET row_security TO off AS $fn$
DECLARE actor uuid; k text; expected text; b jsonb; s private.certified_signature_sessions_v1%rowtype; ctx jsonb; proof jsonb;
BEGIN
 actor:=public.current_profile_id();
 IF actor IS NULL OR _municipality_id IS NULL OR _payload IS NULL OR length(_payload)>16000 OR _payload !~ '^[A-Za-z0-9+/=]+$' OR _epoch IS NULL OR _epoch !~ '^[0-9]{10,11}$' OR _mac IS NULL OR _mac !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Consulta não autorizada.'; END IF;
 IF abs(extract(epoch FROM clock_timestamp())::bigint-_epoch::bigint)>120 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Comprovação expirada.'; END IF;
 SELECT key_hex INTO k FROM sigapro_private.bank_charge_receipt_key WHERE singleton IS TRUE;
 IF k IS NULL THEN RAISE EXCEPTION 'Comprovação indisponível.'; END IF;
 expected:=encode(extensions.hmac(convert_to(concat_ws(chr(10),'sigapro-certified-manifest-status-v1',_municipality_id::text,_payload,_epoch),'UTF8'),extensions.hmac(convert_to('sigapro-certified-manifest-status-domain-v1','UTF8'),decode(k,'hex'),'sha256'),'sha256'),'hex');
 IF expected IS DISTINCT FROM _mac THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Comprovação inválida.'; END IF;
 b:=convert_from(decode(_payload,'base64'),'UTF8')::jsonb;
 IF jsonb_typeof(b) IS DISTINCT FROM 'object' OR b->>'profileId' IS DISTINCT FROM actor::text OR b->>'municipalityId' IS DISTINCT FROM _municipality_id::text OR coalesce(b->>'state','') !~ '^[A-Za-z0-9_-]{43}$' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Vinculação inválida.'; END IF;
 SELECT * INTO s FROM private.certified_signature_sessions_v1 x WHERE x.state_sha256=encode(extensions.digest(b->>'state','sha256'),'hex') AND x.municipality_id=_municipality_id AND x.profile_id=actor AND x.environment='sandbox' AND x.mode='icp_brasil' AND x.prepared_pdf_sha256=b->>'preparedPdfSha256' AND x.byte_range_sha256=b->>'byteRangeSha256' AND x.expires_at>clock_timestamp();
 IF s.state_sha256 IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Sessão inválida ou expirada.'; END IF;
 ctx:=public.get_process_artifact_signature_context_v1(s.process_id,s.signer_slot);
 IF ctx->>'profile_id' IS DISTINCT FROM actor::text OR ctx->>'municipality_id' IS DISTINCT FROM _municipality_id::text OR ctx->>'process_id' IS DISTINCT FROM s.process_id::text OR ctx->>'signer_slot' IS DISTINCT FROM s.signer_slot THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Competência não confirmada.'; END IF;
 IF private.certified_signature_snapshot_v1(_municipality_id,s.process_id,s.request_id,actor,s.artifact_type,s.signer_slot,'icp_brasil') IS DISTINCT FROM s.permit_snapshot_sha256 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Versão alterada.'; END IF;
 SELECT a.archive_metadata INTO proof FROM private.certified_icp_sandbox_archive_v1 a WHERE a.state_sha256=s.state_sha256 AND s.consumed_at IS NOT NULL;
 IF proof IS NULL THEN RETURN jsonb_build_object('manifestRecorded',false,'environment','sandbox','issuanceAuthorized',false); END IF;
 RETURN proof||jsonb_build_object('manifestRecorded',true);
END $fn$;
REVOKE ALL ON FUNCTION public.certified_icp_manifest_status_v1(uuid,text,text,text) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.certified_icp_manifest_status_v1(uuid,text,text,text) TO authenticated;
