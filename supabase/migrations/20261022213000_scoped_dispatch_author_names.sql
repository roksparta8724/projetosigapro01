-- SIGAPRO: read-only, RLS-safe author names for institutional dispatch history.
-- Only an authenticated internal municipal user with process access receives
-- the creator's name. No personal profile document, email, phone or roles
-- are exposed to external users. Existing dispatches stay immutable.
CREATE OR REPLACE FUNCTION public.list_visible_dispatch_authors_v1()
RETURNS TABLE (
  dispatch_id uuid,
  author_profile_id uuid,
  author_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog, public
SET row_security TO 'off'
AS $$
  SELECT
    dispatch.id AS dispatch_id,
    author.id AS author_profile_id,
    COALESCE(NULLIF(BTRIM(author.full_name), ''), NULLIF(BTRIM(author.email), '')) AS author_name
  FROM public.interdepartmental_dispatches AS dispatch
  JOIN public.profiles AS author
    ON author.id = dispatch.created_by_profile_id
  WHERE public.current_profile_id() IS NOT NULL
    AND (public.is_master() OR public.is_internal_municipality_role())
    AND public.has_process_access(dispatch.process_id);
$$;

REVOKE ALL ON FUNCTION public.list_visible_dispatch_authors_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_visible_dispatch_authors_v1() FROM anon;
GRANT EXECUTE ON FUNCTION public.list_visible_dispatch_authors_v1() TO authenticated;
