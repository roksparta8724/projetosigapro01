-- Minimum signature policy per municipality and permit type. No automatic policy activation.
-- Certified modes deliberately fail closed until the verified PDF issuance pipeline exists.
CREATE TABLE IF NOT EXISTS public.municipal_permit_signature_policy (
 municipality_id uuid NOT NULL REFERENCES public.municipalities(id),
 artifact_type text NOT NULL CHECK (artifact_type IN ('construction_permit','habite_se_permit')),
 minimum_mode text NOT NULL CHECK (minimum_mode IN ('internal_allowed','govbr_required','icp_brasil_required')),
 legal_reference text NOT NULL CHECK (length(btrim(legal_reference)) BETWEEN 5 AND 500),
 updated_by uuid NOT NULL REFERENCES public.profiles(id),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(municipality_id,artifact_type)
);
CREATE TABLE IF NOT EXISTS public.municipal_permit_signature_policy_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 municipality_id uuid NOT NULL REFERENCES public.municipalities(id),
 artifact_type text NOT NULL,
 previous_mode text,
 previous_reference text,
 minimum_mode text NOT NULL,
 legal_reference text NOT NULL,
 actor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.municipal_permit_signature_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.municipal_permit_signature_policy_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.municipal_permit_signature_policy,public.municipal_permit_signature_policy_audit FROM PUBLIC, anonymous, authenticated;

CREATE OR REPLACE FUNCTION public.get_municipal_permit_signature_policy_v1(_municipality_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public SET row_security TO off AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=public.current_profile_id() AND p.municipality_id=_municipality_id AND p.role='prefeitura_admin' AND p.account_status='active' AND p.deleted_at IS NULL) THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Somente a administração da Prefeitura pode consultar esta política.';
 END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('artifactType',artifact_type,'minimumMode',minimum_mode,'legalReference',legal_reference,'updatedAt',updated_at) ORDER BY artifact_type) FROM public.municipal_permit_signature_policy WHERE municipality_id=_municipality_id),'[]'::jsonb);
END $$;
CREATE OR REPLACE FUNCTION public.set_municipal_permit_signature_policy_v1(_municipality_id uuid,_artifact_type text,_minimum_mode text,_legal_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public SET row_security TO off AS $$
DECLARE actor uuid; old_row public.municipal_permit_signature_policy%rowtype;
BEGIN
 SELECT p.id INTO actor FROM public.profiles p WHERE p.id=public.current_profile_id() AND p.municipality_id=_municipality_id AND p.role='prefeitura_admin' AND p.account_status='active' AND p.deleted_at IS NULL;
 IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Somente a administração da Prefeitura pode registrar esta política.'; END IF;
 IF _artifact_type IS NULL OR _artifact_type NOT IN ('construction_permit','habite_se_permit') OR _minimum_mode IS NULL OR _minimum_mode NOT IN ('internal_allowed','govbr_required','icp_brasil_required') OR _legal_reference IS NULL OR length(btrim(_legal_reference)) NOT BETWEEN 5 AND 500 THEN
  RAISE EXCEPTION 'Informe o tipo de alvará, modalidade e referência do ato normativo aplicável.';
 END IF;
 PERFORM 1 FROM public.municipalities WHERE id=_municipality_id FOR UPDATE;
 SELECT * INTO old_row FROM public.municipal_permit_signature_policy WHERE municipality_id=_municipality_id AND artifact_type=_artifact_type;
 IF old_row.minimum_mode IS DISTINCT FROM _minimum_mode OR old_row.legal_reference IS DISTINCT FROM btrim(_legal_reference) THEN
  INSERT INTO public.municipal_permit_signature_policy(municipality_id,artifact_type,minimum_mode,legal_reference,updated_by)
   VALUES(_municipality_id,_artifact_type,_minimum_mode,btrim(_legal_reference),actor)
   ON CONFLICT(municipality_id,artifact_type) DO UPDATE SET minimum_mode=excluded.minimum_mode,legal_reference=excluded.legal_reference,updated_by=excluded.updated_by,updated_at=clock_timestamp();
  INSERT INTO public.municipal_permit_signature_policy_audit(municipality_id,artifact_type,previous_mode,previous_reference,minimum_mode,legal_reference,actor_profile_id)
   VALUES(_municipality_id,_artifact_type,old_row.minimum_mode,old_row.legal_reference,_minimum_mode,btrim(_legal_reference),actor);
 END IF;
 RETURN public.get_municipal_permit_signature_policy_v1(_municipality_id);
END $$;
REVOKE ALL ON FUNCTION public.get_municipal_permit_signature_policy_v1(uuid), public.set_municipal_permit_signature_policy_v1(uuid,text,text,text) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.get_municipal_permit_signature_policy_v1(uuid),public.set_municipal_permit_signature_policy_v1(uuid,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION private.guard_required_permit_certificate_v1(_process_id uuid,_artifact_type text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,private SET row_security TO off AS $$
DECLARE municipality uuid; required_mode text;
BEGIN
 IF _artifact_type NOT IN ('construction_permit','habite_se_permit') THEN RETURN; END IF;
 SELECT coalesce(p.municipality_id,p.tenant_id) INTO municipality FROM public.processes p WHERE p.id=_process_id;
 IF municipality IS NULL THEN RAISE EXCEPTION 'Processo sem município confirmado.'; END IF;
 -- Serialize policy changes with signature/issuance decisions, without writing municipal records.
 PERFORM 1 FROM public.municipalities WHERE id=municipality FOR SHARE;
 SELECT minimum_mode INTO required_mode FROM public.municipal_permit_signature_policy WHERE municipality_id=municipality AND artifact_type=_artifact_type;
 IF required_mode IN ('govbr_required','icp_brasil_required') THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='A política municipal exige assinatura certificada. A emissão está bloqueada até a integração oficial e validação do PDF certificado.';
 END IF;
END $$;
REVOKE ALL ON FUNCTION private.guard_required_permit_certificate_v1(uuid,text) FROM PUBLIC, anonymous, authenticated;

CREATE OR REPLACE FUNCTION private.enforce_permit_signature_policy_insert_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,private SET row_security TO off AS $$
DECLARE block public.signature_blocks%rowtype;
BEGIN
 SELECT * INTO block FROM public.signature_blocks WHERE id=NEW.signature_block_id;
 IF block.artifact_type IN ('construction_permit','habite_se_permit') THEN
  PERFORM private.guard_required_permit_certificate_v1(block.process_id,block.artifact_type);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.enforce_permit_signature_policy_insert_v1() FROM PUBLIC, anonymous, authenticated;

CREATE OR REPLACE FUNCTION private.enforce_permit_signature_policy_transition_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,private SET row_security TO off AS $$
BEGIN
 -- Existing issued records remain readable and unchanged by this migration.
 IF TG_OP='UPDATE' THEN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
 END IF;
 IF TG_TABLE_NAME='process_construction_permits' AND NEW.status IN ('manual_signature','signed') THEN
  PERFORM private.guard_required_permit_certificate_v1(NEW.process_id,'construction_permit');
 ELSIF TG_TABLE_NAME='process_habite_se_permits' AND NEW.status='emitido' THEN
  PERFORM private.guard_required_permit_certificate_v1(NEW.process_id,'habite_se_permit');
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.enforce_permit_signature_policy_transition_v1() FROM PUBLIC, anonymous, authenticated;
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.signatures'::regclass AND tgname='trg_municipal_permit_signature_policy_v1') THEN
  CREATE TRIGGER trg_municipal_permit_signature_policy_v1 BEFORE INSERT ON public.signatures FOR EACH ROW EXECUTE FUNCTION private.enforce_permit_signature_policy_insert_v1();
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.process_construction_permits'::regclass AND tgname='trg_municipal_permit_transition_policy_v1') THEN
  CREATE TRIGGER trg_municipal_permit_transition_policy_v1 BEFORE INSERT OR UPDATE OF status ON public.process_construction_permits FOR EACH ROW EXECUTE FUNCTION private.enforce_permit_signature_policy_transition_v1();
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.process_habite_se_permits'::regclass AND tgname='trg_municipal_permit_transition_policy_v1') THEN
  CREATE TRIGGER trg_municipal_permit_transition_policy_v1 BEFORE INSERT OR UPDATE OF status ON public.process_habite_se_permits FOR EACH ROW EXECUTE FUNCTION private.enforce_permit_signature_policy_transition_v1();
 END IF;
END $$;
