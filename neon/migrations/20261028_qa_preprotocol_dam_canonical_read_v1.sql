-- QA ONLY / isolated Neon branch br-solitary-sound-b4xlbvs6.
-- The public guide RPC used SECURITY INVOKER, so payment_guides RLS excluded
-- municipal staff from an un-officialized pre-protocol, even after the QA
-- DAM storage authorization was repaired. Scope reads to the exact guide,
-- municipality, linked process and authenticated role. No data writes.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_payment_guide_original_v1(
 _municipality_id uuid,_guide_code text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
SET row_security TO 'off'
AS $fn$
DECLARE g public.payment_guides;
BEGIN
 IF public.current_profile_id() IS NULL OR _municipality_id IS NULL
    OR coalesce(btrim(_guide_code),'')=''
 THEN RETURN NULL; END IF;
 SELECT * INTO g FROM public.payment_guides
 WHERE municipality_id=_municipality_id AND guide_number=_guide_code;
 IF NOT FOUND OR g.process_id IS NULL THEN RETURN NULL; END IF;
 IF NOT (
   public.is_master()
   OR (
      public.has_tenant_access(g.municipality_id)
      AND (
       public.has_process_access(g.process_id)
       OR public.qa_pending_dam_municipal_staff_access_v1(g)
      )
   )
 ) THEN RETURN NULL; END IF;
 -- Never disclose a foreign, orphan or mislinked process; source of truth
 -- for an official guide is the exact tenant+process pair.
 IF NOT EXISTS(SELECT 1 FROM public.processes pr
   WHERE pr.id=g.process_id AND pr.municipality_id=g.municipality_id
      AND pr.tenant_id=g.municipality_id)
 THEN RETURN NULL; END IF;
 RETURN to_jsonb(g)||jsonb_build_object('status',CASE
  WHEN coalesce(g.paid,false) OR lower(coalesce(g.status,'')) IN
   ('compensada','paid','pago','confirmed','confirmado')
  THEN 'compensada' ELSE g.status END);
END $fn$;
REVOKE ALL ON FUNCTION public.get_payment_guide_original_v1(uuid,text)
 FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.get_payment_guide_original_v1(uuid,text)
 TO authenticated;
COMMIT;
