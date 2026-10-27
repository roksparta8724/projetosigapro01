-- SIGAPRO 2026-10-27: HABITE-SE INTERNAL TRANSITION MUST NOT BE A PUBLIC RPC.
-- Audited on Neon QA and on the official production branch before committing.
-- No process, payment guide, signature or municipal document is modified.
BEGIN;
DO $guard$
DECLARE fn regprocedure;
BEGIN
  fn:=to_regprocedure('public.try_advance_habite_se_to_inspection_v1(uuid,uuid)');
  IF fn IS NULL OR NOT EXISTS(
    SELECT 1 FROM pg_proc p WHERE p.oid=fn AND p.prokind='f' AND p.prosecdef
  ) THEN RAISE EXCEPTION 'Habite-se internal transition missing or changed: stop'; END IF;
  IF (
    SELECT count(DISTINCT p.proname) FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace AND p.prosecdef
      AND p.proname IN (
       'trg_try_advance_habite_se_from_analysis_sheet_v1',
       'trg_try_advance_habite_se_from_document_v1',
       'trg_try_advance_habite_se_from_requirement_v1'
      )
      AND position('public.try_advance_habite_se_to_inspection_v1' IN pg_get_functiondef(p.oid))>0
  )<>3 THEN RAISE EXCEPTION 'Three internal Habite-se event handlers are not intact: stop'; END IF;
  IF to_regprocedure('public.complete_habite_se_process_v1(uuid)') IS NULL
   OR to_regprocedure('public.request_habite_se_secretary_signature_v1(uuid,text,text)') IS NULL
   OR to_regprocedure('public.validate_habite_se_submission_v1(uuid,jsonb)') IS NULL
  THEN RAISE EXCEPTION 'Habite-se operational RPC contracts changed: stop'; END IF;
END $guard$;
-- Called internally by SECURITY DEFINER trigger handlers, never from web clients.
REVOKE EXECUTE ON FUNCTION public.try_advance_habite_se_to_inspection_v1(uuid,uuid)
  FROM PUBLIC, anonymous, authenticated;
-- Operational functions retain authenticated access and their own profile guards.
GRANT EXECUTE ON FUNCTION public.complete_habite_se_process_v1(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_habite_se_process_v1(uuid) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.request_habite_se_secretary_signature_v1(uuid,text,text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.request_habite_se_secretary_signature_v1(uuid,text,text) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.validate_habite_se_submission_v1(uuid,jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_habite_se_submission_v1(uuid,jsonb) FROM PUBLIC, anonymous;
NOTIFY pgrst, 'reload schema';
COMMIT;
