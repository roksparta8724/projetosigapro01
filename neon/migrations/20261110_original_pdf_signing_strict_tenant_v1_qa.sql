-- SIGAPRO QA: presigned DAM original requires canonical SHA path and exact municipality/process.
-- No data rewrites; source of truth is the bank-issued original.
BEGIN;
CREATE OR REPLACE FUNCTION public.authorize_payment_guide_original_read_v1(_guide_id uuid, _municipality_id uuid, _process_id uuid, _object_key text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE g public.payment_guides;
BEGIN
 IF public.current_profile_id() IS NULL THEN RETURN false; END IF;
 SELECT * INTO g FROM public.payment_guides
 WHERE id=_guide_id AND municipality_id=_municipality_id AND process_id=_process_id;
 IF NOT FOUND THEN RETURN false; END IF;
 -- Integrity of the exact municipality and process is mandatory for a signed DAM URL.
 IF NOT EXISTS (
   SELECT 1 FROM public.processes p
   WHERE p.id=g.process_id
     AND p.municipality_id=g.municipality_id
     AND p.tenant_id=g.municipality_id
 ) THEN RETURN false; END IF;
 -- The stored object must be the immutable SHA-addressed original for THIS guide.
 IF g.original_pdf_sha256 IS NULL
   OR g.original_pdf_sha256 !~ '^[a-f0-9]{64}$'
   OR g.original_pdf_key IS NULL
   OR g.original_pdf_key IS DISTINCT FROM
      ('municipalities/'||g.municipality_id||'/processes/'||
       g.process_id||'/dam-originals/'||g.id||'/'||g.original_pdf_sha256||'.pdf')
 THEN RETURN false; END IF;
 IF NOT (public.is_master() OR
   (public.has_tenant_access(g.municipality_id)
    AND (public.has_process_access(g.process_id)
     OR public.qa_pending_dam_municipal_staff_access_v1(g))))
 THEN RETURN false; END IF;
 RETURN g.original_pdf_key IS NOT NULL AND g.original_pdf_key=_object_key;
END $function$;
COMMIT;
