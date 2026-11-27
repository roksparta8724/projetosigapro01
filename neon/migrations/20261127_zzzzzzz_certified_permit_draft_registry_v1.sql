-- Immutable private registry for archived QA permit drafts. No issuance,
-- no new public RPC, no changes to existing signature or payment state.
CREATE TABLE IF NOT EXISTS private.certified_permit_draft_registry_v1 (
 municipality_id uuid NOT NULL REFERENCES public.municipalities(id),
 process_id uuid NOT NULL REFERENCES public.processes(id),
 request_id uuid NOT NULL REFERENCES public.process_signature_requests(id),
 artifact_type text NOT NULL CHECK(artifact_type IN ('construction_permit','habite_se_permit')),
 snapshot_sha256 text NOT NULL CHECK(snapshot_sha256 ~ '^[a-f0-9]{64}$'),
 render_payload_sha256 text NOT NULL CHECK(render_payload_sha256 ~ '^[a-f0-9]{64}$'),
 original_sha256 text NOT NULL CHECK(original_sha256 ~ '^[a-f0-9]{64}$'),
 original_size integer NOT NULL CHECK(original_size BETWEEN 64 AND 33554432),
 prepared_pdf_sha256 text NOT NULL CHECK(prepared_pdf_sha256 ~ '^[a-f0-9]{64}$'),
 prepared_size integer NOT NULL CHECK(prepared_size BETWEEN 64 AND 33554432 AND prepared_size>original_size),
 byte_range_sha256 text NOT NULL CHECK(byte_range_sha256 ~ '^[a-f0-9]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(municipality_id,process_id,request_id,artifact_type,snapshot_sha256,render_payload_sha256)
);
ALTER TABLE private.certified_permit_draft_registry_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.certified_permit_draft_registry_v1 FROM PUBLIC,anonymous,authenticated;
-- A registry row is only a nonofficial QA archive record. The trusted worker
-- must validate actual bytes, request authority and current snapshot before
-- inserting. The table never grants a signing or issuance authorization.
CREATE OR REPLACE FUNCTION private.guard_certified_permit_draft_registry_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path TO pg_catalog,public,private AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Registro de minuta imutável.'; END IF;
 IF NOT EXISTS (
 SELECT 1 FROM public.process_signature_requests r
 JOIN public.processes p ON p.id=r.process_id
 WHERE r.id=NEW.request_id AND r.process_id=NEW.process_id
 AND r.municipality_id=NEW.municipality_id
 AND coalesce(p.municipality_id,p.tenant_id)=NEW.municipality_id
 AND p.archived_at IS NULL AND r.status='pending' AND r.signer_slot='diretoria'
 AND r.artifact_key=CASE NEW.artifact_type WHEN 'construction_permit' THEN 'construction-permit' ELSE 'habite-se-permit' END
 ) THEN RAISE EXCEPTION 'Minuta incompatível com a solicitação pendente.'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_certified_permit_draft_registry_v1() FROM PUBLIC,anonymous,authenticated;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='private.certified_permit_draft_registry_v1'::regclass AND tgname='certified_permit_draft_immutable_v1') THEN
 CREATE TRIGGER certified_permit_draft_immutable_v1 BEFORE INSERT OR UPDATE OR DELETE ON private.certified_permit_draft_registry_v1 FOR EACH ROW EXECUTE FUNCTION private.guard_certified_permit_draft_registry_v1();
 END IF;
END $$;
