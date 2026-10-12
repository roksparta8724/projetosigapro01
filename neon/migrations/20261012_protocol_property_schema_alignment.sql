-- SIGAPRO: align Neon property schema with create_external_process_v2.
-- Root cause fixed in production on 2026-10-12:
-- create_external_process_v2 persists constructionStandard into properties,
-- but the Neon production schema was missing the target column.
-- Idempotent and safe to re-run.

begin;

alter table public.properties
  add column if not exists construction_standard text;

comment on column public.properties.construction_standard is
  'Padrao construtivo informado no protocolo, usado nas regras financeiras e de aprovacao.';

commit;
