alter table if exists public.tenant_settings
  add column if not exists diretoria_responsavel text,
  add column if not exists diretoria_telefone text,
  add column if not exists diretoria_email text;
