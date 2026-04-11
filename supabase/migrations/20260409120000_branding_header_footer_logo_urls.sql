-- =============================================================================
-- Migration: header_logo_url e footer_logo_url em municipality_branding
-- Arquivo: supabase/migrations/20260409120000_branding_header_footer_logo_urls.sql
-- =============================================================================
-- Adiciona colunas dedicadas por variante de logo.
-- A coluna logo_url existente é preservada para retrocompatibilidade.
-- =============================================================================

-- Colunas de URL separadas por variante
ALTER TABLE municipality_branding
  ADD COLUMN IF NOT EXISTS header_logo_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS footer_logo_url TEXT DEFAULT NULL;

-- Object keys separados por variante (para exclusão/substituição precisa no R2)
ALTER TABLE municipality_branding
  ADD COLUMN IF NOT EXISTS header_logo_object_key TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS footer_logo_object_key TEXT DEFAULT NULL;

-- Metadados de storage (se ainda não existirem)
ALTER TABLE municipality_branding
  ADD COLUMN IF NOT EXISTS logo_storage_provider TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS logo_bucket TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS logo_object_key TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS logo_file_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS logo_mime_type TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS logo_file_size BIGINT DEFAULT NULL;

-- Retrocompatibilidade: se logo_url existe mas header/footer estão nulos,
-- copia logo_url para ambos como valor inicial
UPDATE municipality_branding
SET
  header_logo_url = logo_url,
  footer_logo_url = logo_url
WHERE
  logo_url IS NOT NULL
  AND logo_url <> ''
  AND (header_logo_url IS NULL OR header_logo_url = '');

COMMENT ON COLUMN municipality_branding.header_logo_url IS
  'URL pública do logo do cabeçalho no R2. Pode diferir do footer.';
COMMENT ON COLUMN municipality_branding.footer_logo_url IS
  'URL pública do logo do rodapé no R2. Pode diferir do cabeçalho.';
COMMENT ON COLUMN municipality_branding.header_logo_object_key IS
  'Object key no R2 do logo do cabeçalho (para delete/replace).';
COMMENT ON COLUMN municipality_branding.footer_logo_object_key IS
  'Object key no R2 do logo do rodapé (para delete/replace).';
