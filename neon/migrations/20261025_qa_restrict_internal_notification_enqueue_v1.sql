-- SIGAPRO MUNICIPAL: isolated QA database only.
-- SECURITY: enqueue_notification_v1 is a privileged INTERNAL dispatcher.
-- Its SECURITY DEFINER body can INSERT arbitrary notification text, targets
-- and caller-supplied source_profile_id. It previously granted direct EXECUTE
-- to anonymous/browser roles and permitted arbitrary recipients with no JWT.
-- Independent SQL QA transaction proved anonymous inserts a notification.
-- All nine existing server-side wrapper/trigger callers are SECURITY DEFINER
-- and owned by neondb_owner, so revoking browser RPC access preserves them.
-- This migration neither deletes existing notifications nor modifies queues.
DO $qa$
DECLARE
  helper_oid oid;
  caller_count integer;
BEGIN
  IF current_database() <> 'sigapro_migration_stage_20260923' THEN
    RAISE EXCEPTION 'Refused: not isolated Neon QA';
  END IF;
  helper_oid := to_regprocedure('public.enqueue_notification_v1(uuid,text,text,text,uuid,text,text,text,uuid,text,jsonb)');
  IF helper_oid IS NULL THEN
    RAISE EXCEPTION 'Notification dispatcher signature differs';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_proc p WHERE p.oid=helper_oid
      AND p.prosecdef AND p.proowner='neondb_owner'::regrole::oid
  ) THEN
    RAISE EXCEPTION 'Notification dispatcher is not internal owner';
  END IF;

  SELECT count(*)
    INTO caller_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prokind='f'
    AND p.proname <> 'enqueue_notification_v1'
    AND p.prosecdef
    AND p.proowner='neondb_owner'::regrole::oid
    AND position('public.enqueue_notification_v1(' in pg_get_functiondef(p.oid))>0;
  IF caller_count<>9 THEN
    RAISE EXCEPTION 'Notification wrapper/trigger topology changed: %', caller_count;
  END IF;
END $qa$;

REVOKE EXECUTE ON FUNCTION public.enqueue_notification_v1(
  uuid,text,text,text,uuid,text,text,text,uuid,text,jsonb
) FROM PUBLIC, anonymous, authenticated;

NOTIFY pgrst, 'reload schema';
