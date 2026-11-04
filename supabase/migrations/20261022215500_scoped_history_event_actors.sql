-- SIGAPRO read-only process history actor names, scoped by the same DB process RLS.
-- A future staff role must be explicitly authorized by is_internal_municipality_role().
-- Does NOT modify historical records or grant access to profile details.
CREATE OR REPLACE FUNCTION public.list_visible_process_event_authors_v1()
RETURNS TABLE(event_kind text, event_id uuid, actor_profile_id uuid, actor_name text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO pg_catalog, public
SET row_security TO 'off'
AS $$
  SELECT
    events.event_kind,
    events.event_id,
    actor.id,
    COALESCE(NULLIF(BTRIM(actor.full_name), ''), NULLIF(BTRIM(actor.email), ''))
  FROM (
    SELECT 'movement'::text AS event_kind, m.id AS event_id, m.process_id,
           m.actor_profile_id AS profile_id, m.actor_user_id AS user_id
      FROM public.process_movements m
    UNION ALL
    SELECT 'audit'::text, a.id, a.process_id, a.actor_profile_id, a.actor_user_id
      FROM public.process_audit_entries a
    UNION ALL
    SELECT 'reopen'::text, r.id, r.process_id, r.actor_profile_id, r.actor_user_id
      FROM public.process_reopen_history r
  ) events
  JOIN public.profiles actor ON (
    actor.id = events.profile_id OR
    (events.profile_id IS NULL AND events.user_id IS NOT NULL AND actor.user_id = events.user_id)
  )
  WHERE public.current_profile_id() IS NOT NULL
    AND (public.is_master() OR public.is_internal_municipality_role())
    AND public.has_process_access(events.process_id);
$$;

REVOKE ALL ON FUNCTION public.list_visible_process_event_authors_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_visible_process_event_authors_v1() TO authenticated;
