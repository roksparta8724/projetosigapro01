-- =============================================================================
-- Migration: platform_branding para branding da plataforma SIGAPRO
-- Arquivo: supabase/migrations/20260410130000_platform_branding.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS platform_branding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_key text UNIQUE NOT NULL DEFAULT 'sigapro',
  header_logo_url text DEFAULT NULL,
  header_logo_object_key text DEFAULT NULL,
  header_logo_file_name text DEFAULT NULL,
  header_logo_mime_type text DEFAULT NULL,
  footer_logo_url text DEFAULT NULL,
  footer_logo_object_key text DEFAULT NULL,
  footer_logo_file_name text DEFAULT NULL,
  footer_logo_mime_type text DEFAULT NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid DEFAULT NULL
);

COMMENT ON TABLE platform_branding IS 'Branding institucional da plataforma SIGAPRO (master).';
