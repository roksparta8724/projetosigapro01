-- QA EXCLUSIVE, Neon branch br-solitary-sound-b4xlbvs6 only.
-- Read-only authorized access to an existing sandbox PIX after immutable PDF
-- archiving; reserve/issue permissions MUST NOT be widened.
BEGIN;
CREATE OR REPLACE FUNCTION public.qa_mp_pix_read_existing_v1(
  _municipality_id uuid, _guide_code text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
SET row_security TO 'off'
AS $fn$
DECLARE g public.payment_guides; p public.mp_qa_pix_orders_v1;
BEGIN
 IF public.current_profile_id() IS NULL
   OR _municipality_id IS NULL
   OR _guide_code !~ '^DAM-PRE-QA-[A-Za-z0-9-]{8,100}$'
   OR NOT public.has_tenant_access(_municipality_id)
 THEN RAISE EXCEPTION 'Leitura PIX QA não autorizada'; END IF;
 SELECT * INTO g FROM public.payment_guides
   WHERE municipality_id=_municipality_id AND guide_number=_guide_code;
 IF NOT FOUND OR g.process_id IS NULL OR
   NOT public.has_process_access(g.process_id) OR
   g.collection_mode_snapshot IS DISTINCT FROM 'sigapro' OR
   g.provider_environment IS DISTINCT FROM 'test' OR
   g.payment_provider IS DISTINCT FROM 'mercado_pago'
 THEN RAISE EXCEPTION 'Leitura PIX QA não autorizada para esta guia'; END IF;
 SELECT * INTO p FROM public.mp_qa_pix_orders_v1
   WHERE municipality_id=_municipality_id AND guide_id=g.id
     AND guide_number=_guide_code;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN to_jsonb(p);
END
$fn$;
REVOKE ALL ON FUNCTION public.qa_mp_pix_read_existing_v1(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.qa_mp_pix_read_existing_v1(uuid,text) FROM anonymous;
GRANT EXECUTE ON FUNCTION public.qa_mp_pix_read_existing_v1(uuid,text) TO authenticated;
COMMIT;
