-- Isolated QA only: the Habite-se inspection auto-transition is an
-- INTERNAL database trigger helper, not a user-callable RPC.
--
-- It is SECURITY DEFINER and can move processes, finish dispatches, and add
-- audit rows; it contains no current_profile_id / has_process_access guard
-- on a direct invocation and accepts an arbitrary actor_profile_id.
-- Three SECURITY DEFINER trigger functions call it after approved document,
-- requirement or analysis-sheet updates. The trigger owners retain EXECUTE.
-- Do not rewrite approvals, processes, documents, payments, or signatures.
DO $qa$
DECLARE _proc oid;
BEGIN
  IF current_database() <> 'sigapro_migration_stage_20260923' THEN
    RAISE EXCEPTION 'QA-only Habite-se RPC hardening refused on non-QA database';
  END IF;

  _proc := to_regprocedure(
    'public.try_advance_habite_se_to_inspection_v1(uuid,uuid)'
  );
  IF _proc IS NULL THEN RAISE EXCEPTION 'Habite-se transition helper not installed'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid=_proc AND p.prosecdef AND p.prokind='f'
  ) THEN
    RAISE EXCEPTION 'Habite-se transition helper has unexpected privileges';
  END IF;

  IF (
    SELECT COUNT(DISTINCT p.proname)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f' AND p.prosecdef
      AND p.proname IN (
        'trg_try_advance_habite_se_from_analysis_sheet_v1',
        'trg_try_advance_habite_se_from_document_v1',
        'trg_try_advance_habite_se_from_requirement_v1'
      )
      AND position(
        'public.try_advance_habite_se_to_inspection_v1'
        in pg_get_functiondef(p.oid)
      ) > 0
  ) <> 3 THEN
    RAISE EXCEPTION 'Automatic Habite-se triggers not present: abort';
  END IF;
END $qa$;

REVOKE EXECUTE ON FUNCTION
  public.try_advance_habite_se_to_inspection_v1(uuid,uuid)
FROM PUBLIC, anonymous, authenticated;

NOTIFY pgrst, 'reload schema';
