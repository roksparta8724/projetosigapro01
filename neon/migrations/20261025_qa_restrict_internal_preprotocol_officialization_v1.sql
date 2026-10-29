-- SIGAPRO MUNICIPAL — isolated Neon QA branch only.
-- A preprotocol must not be officialized by directly calling the privileged
-- helper. officialize_preprotocol_v1 checks for a paid protocol guide but
-- does not authenticate or authorize the *caller*.
--
-- Two SECURITY DEFINER routines owned by neondb_owner already invoke it:
--   confirm_preprotocol_payment_v1 (municipal protocol authorization)
--   trg_officialize_preprotocol_after_payment_v1 (AFTER guide compensation)
-- They must retain EXECUTE as the database function owner. No RPC body or
-- historical process/guide data is changed.
DO $qa$
DECLARE _helper_oid oid;
BEGIN
  IF current_database() <> 'sigapro_migration_stage_20260923' THEN
    RAISE EXCEPTION 'Refused: not the isolated SIGAPRO QA database';
  END IF;

  _helper_oid := to_regprocedure('public.officialize_preprotocol_v1(uuid,uuid)');
  IF _helper_oid IS NULL THEN
    RAISE EXCEPTION 'Officialization helper not installed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid=_helper_oid
      AND prosecdef=true
      AND proowner='neondb_owner'::regrole::oid
  ) THEN
    RAISE EXCEPTION 'Unexpected officialization helper ownership';
  END IF;

  IF (
    SELECT count(DISTINCT p.proname)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.prokind='f'
      AND p.prosecdef=true
      AND p.proowner='neondb_owner'::regrole::oid
      AND p.proname IN (
        'confirm_preprotocol_payment_v1',
        'trg_officialize_preprotocol_after_payment_v1'
      )
      AND position('public.officialize_preprotocol_v1(' in pg_get_functiondef(p.oid)) > 0
  ) <> 2 THEN
    RAISE EXCEPTION 'Expected internal payment confirmation paths not installed';
  END IF;
END $qa$;

REVOKE EXECUTE ON FUNCTION public.officialize_preprotocol_v1(uuid,uuid)
FROM PUBLIC, anonymous, authenticated;

NOTIFY pgrst, 'reload schema';
