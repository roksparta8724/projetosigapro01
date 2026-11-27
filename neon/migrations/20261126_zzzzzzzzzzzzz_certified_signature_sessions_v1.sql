-- Private, one-use authorization registry. No public RPC or permit issuance.
CREATE TABLE IF NOT EXISTS private.certified_signature_sessions_v1 (
 state_sha256 text PRIMARY KEY CHECK (state_sha256 ~ '^[a-f0-9]{64}$'),
 nonce_sha256 text NOT NULL CHECK (nonce_sha256 ~ '^[a-f0-9]{64}$'),
 municipality_id uuid NOT NULL REFERENCES public.municipalities(id),
 process_id uuid NOT NULL REFERENCES public.processes(id),
 request_id uuid NOT NULL REFERENCES public.process_signature_requests(id),
 profile_id uuid NOT NULL REFERENCES public.profiles(id),
 artifact_type text NOT NULL CHECK (artifact_type IN ('construction_permit','habite_se_permit')),
 signer_slot text NOT NULL CHECK (signer_slot IN ('diretoria','secretaria')),
 mode text NOT NULL CHECK (mode IN ('govbr','icp_brasil')),
 environment text NOT NULL CHECK (environment='sandbox'),
 permit_snapshot_sha256 text NOT NULL CHECK (permit_snapshot_sha256 ~ '^[a-f0-9]{64}$'),
 prepared_pdf_sha256 text NOT NULL CHECK (prepared_pdf_sha256 ~ '^[a-f0-9]{64}$'),
 byte_range_sha256 text NOT NULL CHECK (byte_range_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 CHECK (expires_at>created_at AND expires_at<=created_at+interval '10 minutes'),
 CHECK (consumed_at IS NULL OR consumed_at>=created_at)
);
ALTER TABLE private.certified_signature_sessions_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.certified_signature_sessions_v1 FROM PUBLIC, anonymous, authenticated;
CREATE INDEX IF NOT EXISTS certified_signature_sessions_expiry_v1 ON private.certified_signature_sessions_v1(expires_at);

CREATE OR REPLACE FUNCTION private.certified_signature_snapshot_v1(_municipality uuid,_process uuid,_request uuid,_profile uuid,_type text,_slot text,_mode text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,private SET row_security TO off AS $$
DECLARE req public.process_signature_requests%rowtype; snapshot jsonb; minimum_mode text;
BEGIN
 IF _type NOT IN ('construction_permit','habite_se_permit') OR _slot NOT IN ('diretoria','secretaria') OR _mode NOT IN ('govbr','icp_brasil') THEN RAISE EXCEPTION 'Modalidade ou documento inválido.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=_profile AND p.municipality_id=_municipality AND p.account_status='active' AND p.deleted_at IS NULL) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Identidade municipal não autorizada.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.processes p WHERE p.id=_process AND coalesce(p.municipality_id,p.tenant_id)=_municipality AND p.archived_at IS NULL) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Processo municipal não autorizado.'; END IF;
 PERFORM 1 FROM public.municipalities WHERE id=_municipality FOR SHARE;
 SELECT * INTO req FROM public.process_signature_requests WHERE id=_request AND process_id=_process AND municipality_id=_municipality AND signer_slot=_slot AND status='pending' AND artifact_key=CASE WHEN _type='construction_permit' THEN 'construction-permit' ELSE 'habite-se-permit' END FOR SHARE;
 IF req.id IS NULL OR (req.assigned_profile_id IS NOT NULL AND req.assigned_profile_id<>_profile) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Solicitação de assinatura não autorizada ou encerrada.'; END IF;
 SELECT p.minimum_mode INTO minimum_mode FROM public.municipal_permit_signature_policy p WHERE p.municipality_id=_municipality AND p.artifact_type=_type;
 IF minimum_mode IS NULL OR (minimum_mode='icp_brasil_required' AND _mode<>'icp_brasil') THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Política normativa não autoriza esta modalidade.'; END IF;
 IF _type='construction_permit' THEN
  SELECT jsonb_build_object('number',permit_number,'data',form_data,'status',status,'updated',updated_at,'request',req.artifact_hash,'policy',minimum_mode) INTO snapshot FROM public.process_construction_permits WHERE process_id=_process AND municipality_id=_municipality AND ((_slot='diretoria' AND status='awaiting_director') OR (_slot='secretaria' AND status='signed')) FOR SHARE;
 ELSE
  SELECT jsonb_build_object('number',permit_number,'data',form_data,'status',status,'updated',updated_at,'request',req.artifact_hash,'policy',minimum_mode) INTO snapshot FROM public.process_habite_se_permits WHERE process_id=_process AND municipality_id=_municipality AND ((_slot='diretoria' AND status='aguardando_diretor') OR (_slot='secretaria' AND status='emitido')) FOR SHARE;
 END IF;
 IF snapshot IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Versão do alvará não está apta à assinatura.'; END IF;
 RETURN encode(extensions.digest(snapshot::text,'sha256'),'hex');
END $$;
REVOKE ALL ON FUNCTION private.certified_signature_snapshot_v1(uuid,uuid,uuid,uuid,text,text,text) FROM PUBLIC, anonymous, authenticated;

CREATE OR REPLACE FUNCTION private.begin_certified_signature_session_v1(_state text,_nonce text,_municipality uuid,_process uuid,_request uuid,_profile uuid,_type text,_slot text,_mode text,_pdf_sha text,_range_sha text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,private SET row_security TO off AS $$
DECLARE snapshot text; started timestamptz:=clock_timestamp();
BEGIN
 -- Server must first resolve the authenticated signer context using existing RPC.
 -- This registry is a private worker primitive, not an authorization endpoint.
 IF _state IS NULL OR _state !~ '^[A-Za-z0-9_-]{43}$' OR _nonce IS NULL OR _nonce !~ '^[A-Za-z0-9_-]{43}$' OR _state=_nonce THEN RAISE EXCEPTION 'Correlação OAuth inválida.'; END IF;
 snapshot:=private.certified_signature_snapshot_v1(_municipality,_process,_request,_profile,_type,_slot,_mode);
 INSERT INTO private.certified_signature_sessions_v1(state_sha256,nonce_sha256,municipality_id,process_id,request_id,profile_id,artifact_type,signer_slot,mode,environment,permit_snapshot_sha256,prepared_pdf_sha256,byte_range_sha256,created_at,expires_at)
 VALUES(encode(extensions.digest(_state,'sha256'),'hex'),encode(extensions.digest(_nonce,'sha256'),'hex'),_municipality,_process,_request,_profile,_type,_slot,_mode,'sandbox',snapshot,_pdf_sha,_range_sha,started,started+interval '5 minutes');
END $$;
REVOKE ALL ON FUNCTION private.begin_certified_signature_session_v1(text,text,uuid,uuid,uuid,uuid,text,text,text,text,text) FROM PUBLIC, anonymous, authenticated;

CREATE OR REPLACE FUNCTION private.consume_certified_signature_session_v1(_state text,_municipality uuid,_profile uuid,_pdf_sha text,_range_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,private SET row_security TO off AS $$
DECLARE s private.certified_signature_sessions_v1%rowtype; current_snapshot text;
BEGIN
 IF _state IS NULL OR _state !~ '^[A-Za-z0-9_-]{43}$' THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Sessão de assinatura inválida.'; END IF;
 SELECT * INTO s FROM private.certified_signature_sessions_v1 WHERE state_sha256=encode(extensions.digest(_state,'sha256'),'hex') AND municipality_id=_municipality AND profile_id=_profile AND consumed_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE;
 IF s.state_sha256 IS NULL OR s.prepared_pdf_sha256 IS DISTINCT FROM _pdf_sha OR s.byte_range_sha256 IS DISTINCT FROM _range_sha THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Sessão de assinatura inválida, expirada ou já utilizada.'; END IF;
 current_snapshot:=private.certified_signature_snapshot_v1(s.municipality_id,s.process_id,s.request_id,s.profile_id,s.artifact_type,s.signer_slot,s.mode);
 IF current_snapshot IS DISTINCT FROM s.permit_snapshot_sha256 OR s.expires_at<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Versão do alvará alterada ou sessão expirada.'; END IF;
 UPDATE private.certified_signature_sessions_v1 SET consumed_at=clock_timestamp() WHERE state_sha256=s.state_sha256;
 RETURN jsonb_build_object('municipalityId',s.municipality_id,'processId',s.process_id,'requestId',s.request_id,'profileId',s.profile_id,'artifactType',s.artifact_type,'signerSlot',s.signer_slot,'mode',s.mode,'environment',s.environment,'nonceSha256',s.nonce_sha256,'preparedPdfSha256',s.prepared_pdf_sha256,'byteRangeSha256',s.byte_range_sha256);
END $$;
REVOKE ALL ON FUNCTION private.consume_certified_signature_session_v1(text,uuid,uuid,text,text) FROM PUBLIC, anonymous, authenticated;
