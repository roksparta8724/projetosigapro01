-- =============================================================================
-- Migration: header/footer logo mime types in municipality_branding
-- File: supabase/migrations/20260409123500_branding_logo_mime_types.sql
-- =============================================================================
-- Adds per-variant mime type columns (and keeps backward-compatible logo_mime_type).
-- Safe to run multiple times.
-- =============================================================================

ALTER TABLE municipality_branding
  ADD COLUMN IF NOT EXISTS header_logo_file_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS header_logo_mime_type TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS footer_logo_file_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS footer_logo_mime_type TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

COMMENT ON COLUMN municipality_branding.header_logo_file_name IS
  'Nome do arquivo do logo do cabeçalho no R2.';
COMMENT ON COLUMN municipality_branding.header_logo_mime_type IS
  'Mime type do logo do cabeçalho no R2.';
COMMENT ON COLUMN municipality_branding.footer_logo_file_name IS
  'Nome do arquivo do logo do rodapé no R2.';
COMMENT ON COLUMN municipality_branding.footer_logo_mime_type IS
  'Mime type do logo do rodapé no R2.';
COMMENT ON COLUMN municipality_branding.updated_at IS
  'Data de atualização do branding institucional.';
