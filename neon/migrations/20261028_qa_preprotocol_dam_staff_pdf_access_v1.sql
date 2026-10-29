-- QA ONLY: repair pre-protocol DAM/Pix recovery for authorized MUNICIPAL
-- staff. No production branch, no financial data updates, no new orders.
-- The creator's existing access remains untouched. Never weaken the
-- officialized-process authorization or cross-municipality boundaries.
BEGIN;

CREATE OR REPLACE FUNCTION public.qa_pending_dam_municipal_staff_access_v1(
 _guide public.payment_guides
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
SET row_security TO 'off'
AS $fn$
DECLARE actor uuid:=public.current_profile_id();
BEGIN
 IF actor IS NULL OR _guide.id IS NULL OR _guide.municipality_id IS NULL
    OR _guide.process_id IS NULL OR public.is_master()
    OR NOT public.has_tenant_access(_guide.municipality_id)
    OR coalesce(public.current_role_code(),'') NOT IN
      ('prefeitura_admin','prefeitura_supervisor','financeiro')
    OR _guide.guide_kind IS DISTINCT FROM 'protocolo'
    OR _guide.guide_number NOT LIKE 'DAM-PRE-QA-%'
    OR _guide.provider_environment IS DISTINCT FROM 'test'
    OR _guide.payment_provider IS DISTINCT FROM 'mercado_pago'
    OR _guide.collection_mode_snapshot IS DISTINCT FROM 'sigapro'
 THEN RETURN false; END IF;
 RETURN EXISTS(
  SELECT 1 FROM public.processes pr
  WHERE pr.id=_guide.process_id
    AND pr.municipality_id=_guide.municipality_id
    AND pr.tenant_id=_guide.municipality_id
    AND pr.officialized_at IS NULL
    AND pr.status='pagamento_pendente'
 );
END $fn$;
REVOKE ALL ON FUNCTION public.qa_pending_dam_municipal_staff_access_v1(public.payment_guides)
 FROM PUBLIC,anonymous,authenticated;

CREATE OR REPLACE FUNCTION public.assert_dam_document_archiver_v2(
 _guide public.payment_guides
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $fn$
DECLARE actor uuid;
BEGIN
 actor:=public.current_profile_id();
 IF actor IS NULL OR _guide.municipality_id IS NULL OR _guide.process_id IS NULL
 THEN RAISE EXCEPTION 'Acesso ao documento DAM não autorizado'; END IF;
 IF public.is_master() THEN RETURN; END IF;
 IF NOT public.has_tenant_access(_guide.municipality_id) OR
    NOT (public.has_process_access(_guide.process_id)
         OR public.qa_pending_dam_municipal_staff_access_v1(_guide))
 THEN RAISE EXCEPTION 'Sem acesso à guia desta Prefeitura'; END IF;
 IF public.is_internal_municipality_role() THEN RETURN; END IF;
 IF coalesce(public.current_role_code(),'')='profissional_externo'
    AND EXISTS(SELECT 1 FROM public.processes pr
      WHERE pr.id=_guide.process_id AND pr.municipality_id=_guide.municipality_id
        AND pr.created_by_profile_id=actor)
 THEN RETURN; END IF;
 RAISE EXCEPTION 'Sem permissão para arquivar este documento DAM';
END $fn$;
REVOKE ALL ON FUNCTION public.assert_dam_document_archiver_v2(public.payment_guides)
 FROM PUBLIC,anonymous,authenticated;

CREATE OR REPLACE FUNCTION public.authorize_payment_guide_original_read_v1(
 _guide_id uuid,_municipality_id uuid,_process_id uuid,_object_key text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $fn$
DECLARE g public.payment_guides;
BEGIN
 IF public.current_profile_id() IS NULL THEN RETURN false; END IF;
 SELECT * INTO g FROM public.payment_guides
 WHERE id=_guide_id AND municipality_id=_municipality_id AND process_id=_process_id;
 IF NOT FOUND THEN RETURN false; END IF;
 IF NOT (public.is_master() OR
   (public.has_tenant_access(g.municipality_id)
    AND (public.has_process_access(g.process_id)
     OR public.qa_pending_dam_municipal_staff_access_v1(g))))
 THEN RETURN false; END IF;
 RETURN g.original_pdf_key IS NOT NULL AND g.original_pdf_key=_object_key;
END $fn$;
REVOKE ALL ON FUNCTION public.authorize_payment_guide_original_read_v1(uuid,uuid,uuid,text)
 FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.authorize_payment_guide_original_read_v1(uuid,uuid,uuid,text)
 TO authenticated;

CREATE OR REPLACE FUNCTION public.qa_mp_pix_read_existing_v1(
 _municipality_id uuid,_guide_code text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
SET row_security TO 'off'
AS $fn$
DECLARE g public.payment_guides; p public.mp_qa_pix_orders_v1;
BEGIN
 IF public.current_profile_id() IS NULL OR _municipality_id IS NULL
 OR _guide_code !~ '^DAM-PRE-QA-[A-Za-z0-9-]{8,100}$'
 OR NOT public.has_tenant_access(_municipality_id)
 THEN RAISE EXCEPTION 'Leitura PIX QA não autorizada'; END IF;
 SELECT * INTO g FROM public.payment_guides
 WHERE municipality_id=_municipality_id AND guide_number=_guide_code;
 IF NOT FOUND OR g.process_id IS NULL OR
   NOT (public.has_process_access(g.process_id)
    OR public.qa_pending_dam_municipal_staff_access_v1(g)) OR
   g.collection_mode_snapshot IS DISTINCT FROM 'sigapro' OR
   g.provider_environment IS DISTINCT FROM 'test' OR
   g.payment_provider IS DISTINCT FROM 'mercado_pago'
 THEN RAISE EXCEPTION 'Leitura PIX QA não autorizada para esta guia'; END IF;
 SELECT * INTO p FROM public.mp_qa_pix_orders_v1
 WHERE municipality_id=_municipality_id AND guide_id=g.id
 AND guide_number=_guide_code;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN to_jsonb(p);
END $fn$;
REVOKE ALL ON FUNCTION public.qa_mp_pix_read_existing_v1(uuid,text)
 FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.qa_mp_pix_read_existing_v1(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.qa_authorize_guide_reconciliation_v1(
 _municipality_id uuid,_guide_code text,_bank_reference text
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
SET row_security TO 'off'
AS $fn$
DECLARE g public.payment_guides;
BEGIN
 IF public.current_profile_id() IS NULL OR _municipality_id IS NULL
 OR _guide_code !~ '^DAM-PRE-[A-Za-z0-9-]{8,100}$'
 OR NOT public.has_tenant_access(_municipality_id)
 THEN RETURN false; END IF;
 SELECT * INTO g FROM public.payment_guides
 WHERE municipality_id=_municipality_id AND guide_number=_guide_code;
 IF NOT FOUND OR g.process_id IS NULL OR
   NOT (public.has_process_access(g.process_id)
    OR public.qa_pending_dam_municipal_staff_access_v1(g)) OR
   g.collection_mode_snapshot IS DISTINCT FROM 'sigapro' OR
   g.provider_environment IS DISTINCT FROM 'test' OR
   g.payment_provider IS DISTINCT FROM 'mercado_pago' OR
   g.bank_reference IS DISTINCT FROM _bank_reference OR
   g.bank_payment_id IS NULL OR
   g.document_snapshot IS NULL OR
   g.original_pdf_key IS NULL OR g.original_pdf_sha256 IS NULL OR
   g.original_pdf_sha256 !~ '^[a-f0-9]{64}$' OR
   g.original_pdf_key IS DISTINCT FROM
    ('municipalities/'||g.municipality_id||'/processes/'||
     g.process_id||'/dam-originals/'||g.id||'/'||g.original_pdf_sha256||'.pdf') OR
   coalesce(g.paid,false) OR
   lower(coalesce(g.status,'')) IN
     ('compensada','paid','pago','confirmed','confirmado') OR
   NOT EXISTS (SELECT 1 FROM public.processes pr
    WHERE pr.id=g.process_id AND pr.municipality_id=g.municipality_id
     AND pr.tenant_id=g.municipality_id) OR
   NOT EXISTS (SELECT 1 FROM public.mp_qa_pix_orders_v1 o
    WHERE o.guide_id=g.id AND o.municipality_id=g.municipality_id
    AND o.order_id=g.bank_reference AND o.payment_id=g.bank_payment_id
    AND o.amount=g.amount AND o.state='issued' AND o.qr_code=g.pix_code)
 THEN RETURN false; END IF;
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION public.qa_authorize_guide_reconciliation_v1(uuid,text,text)
 FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.qa_authorize_guide_reconciliation_v1(uuid,text,text)
 TO authenticated;

COMMIT;
