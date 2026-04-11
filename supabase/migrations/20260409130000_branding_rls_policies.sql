-- =============================================================================
-- Migration: RLS policies for municipality_branding and municipality_settings
-- File: supabase/migrations/20260409130000_branding_rls_policies.sql
-- =============================================================================
-- Permite leitura/gravação para usuários autenticados vinculados ao município
-- via profiles.municipality_id ou tenant_memberships. Ajuste conforme seu modelo.
-- =============================================================================

-- Enable RLS (idempotente)
ALTER TABLE IF EXISTS municipality_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS municipality_settings ENABLE ROW LEVEL SECURITY;

-- Helper predicate: user pertence ao município
-- Usado via subquery inline nas policies

-- municipality_branding
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'municipality_branding'
      AND policyname = 'municipality_branding_select_authenticated'
  ) THEN
    CREATE POLICY "municipality_branding_select_authenticated"
      ON public.municipality_branding
      FOR SELECT
      TO authenticated
      USING (
        municipality_id IN (
          SELECT municipality_id FROM public.profiles
          WHERE user_id = auth.uid() AND deleted_at IS NULL
          UNION
          SELECT tenant_id FROM public.tenant_memberships
          WHERE user_id = auth.uid() AND deleted_at IS NULL AND is_active = true
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'municipality_branding'
      AND policyname = 'municipality_branding_write_authenticated'
  ) THEN
    CREATE POLICY "municipality_branding_write_authenticated"
      ON public.municipality_branding
      FOR INSERT
      TO authenticated
      WITH CHECK (
        municipality_id IN (
          SELECT municipality_id FROM public.profiles
          WHERE user_id = auth.uid() AND deleted_at IS NULL
          UNION
          SELECT tenant_id FROM public.tenant_memberships
          WHERE user_id = auth.uid() AND deleted_at IS NULL AND is_active = true
        )
      );

    CREATE POLICY "municipality_branding_update_authenticated"
      ON public.municipality_branding
      FOR UPDATE
      TO authenticated
      USING (
        municipality_id IN (
          SELECT municipality_id FROM public.profiles
          WHERE user_id = auth.uid() AND deleted_at IS NULL
          UNION
          SELECT tenant_id FROM public.tenant_memberships
          WHERE user_id = auth.uid() AND deleted_at IS NULL AND is_active = true
        )
      )
      WITH CHECK (
        municipality_id IN (
          SELECT municipality_id FROM public.profiles
          WHERE user_id = auth.uid() AND deleted_at IS NULL
          UNION
          SELECT tenant_id FROM public.tenant_memberships
          WHERE user_id = auth.uid() AND deleted_at IS NULL AND is_active = true
        )
      );
  END IF;
END $$;

-- municipality_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'municipality_settings'
      AND policyname = 'municipality_settings_select_authenticated'
  ) THEN
    CREATE POLICY "municipality_settings_select_authenticated"
      ON public.municipality_settings
      FOR SELECT
      TO authenticated
      USING (
        municipality_id IN (
          SELECT municipality_id FROM public.profiles
          WHERE user_id = auth.uid() AND deleted_at IS NULL
          UNION
          SELECT tenant_id FROM public.tenant_memberships
          WHERE user_id = auth.uid() AND deleted_at IS NULL AND is_active = true
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'municipality_settings'
      AND policyname = 'municipality_settings_write_authenticated'
  ) THEN
    CREATE POLICY "municipality_settings_write_authenticated"
      ON public.municipality_settings
      FOR INSERT
      TO authenticated
      WITH CHECK (
        municipality_id IN (
          SELECT municipality_id FROM public.profiles
          WHERE user_id = auth.uid() AND deleted_at IS NULL
          UNION
          SELECT tenant_id FROM public.tenant_memberships
          WHERE user_id = auth.uid() AND deleted_at IS NULL AND is_active = true
        )
      );

    CREATE POLICY "municipality_settings_update_authenticated"
      ON public.municipality_settings
      FOR UPDATE
      TO authenticated
      USING (
        municipality_id IN (
          SELECT municipality_id FROM public.profiles
          WHERE user_id = auth.uid() AND deleted_at IS NULL
          UNION
          SELECT tenant_id FROM public.tenant_memberships
          WHERE user_id = auth.uid() AND deleted_at IS NULL AND is_active = true
        )
      )
      WITH CHECK (
        municipality_id IN (
          SELECT municipality_id FROM public.profiles
          WHERE user_id = auth.uid() AND deleted_at IS NULL
          UNION
          SELECT tenant_id FROM public.tenant_memberships
          WHERE user_id = auth.uid() AND deleted_at IS NULL AND is_active = true
        )
      );
  END IF;
END $$;
