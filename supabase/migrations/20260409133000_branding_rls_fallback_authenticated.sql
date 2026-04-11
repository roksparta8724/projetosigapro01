-- =============================================================================
-- Emergency RLS fallback: allow authenticated users to write branding/settings
-- File: supabase/migrations/20260409133000_branding_rls_fallback_authenticated.sql
-- =============================================================================
-- Use only if membership-based policies are not resolving in dev.
-- This allows any authenticated user to read/write these tables.
-- =============================================================================

ALTER TABLE IF EXISTS municipality_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS municipality_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'municipality_branding'
      AND policyname = 'municipality_branding_authenticated_all'
  ) THEN
    CREATE POLICY "municipality_branding_authenticated_all"
      ON public.municipality_branding
      FOR ALL
      TO authenticated
      USING (auth.uid() IS NOT NULL)
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'municipality_settings'
      AND policyname = 'municipality_settings_authenticated_all'
  ) THEN
    CREATE POLICY "municipality_settings_authenticated_all"
      ON public.municipality_settings
      FOR ALL
      TO authenticated
      USING (auth.uid() IS NOT NULL)
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;
