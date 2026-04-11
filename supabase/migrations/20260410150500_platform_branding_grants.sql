-- =============================================================================
-- Grants for platform_branding (ensure PostgREST exposure for authenticated)
-- =============================================================================

grant usage on schema public to authenticated;

grant select, insert, update, delete
  on table public.platform_branding
  to authenticated;
