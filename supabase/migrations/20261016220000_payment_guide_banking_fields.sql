-- SIGAPRO Municipal
-- Preparacao para integracao bancária real das guias.
-- Esta migration NAO gera codigo de barras. O valor deve vir do convenio/API
-- oficial do banco arrecadador e ser persistido apenas depois de validado.

alter table if exists public.payment_guides
  add column if not exists barcode text,
  add column if not exists digitable_line text,
  add column if not exists bank_reference text;

comment on column public.payment_guides.barcode is
  'Codigo de barras oficial (44 digitos) retornado pelo banco/convenio. Nunca gerar localmente sem especificacao bancaria.';
comment on column public.payment_guides.digitable_line is
  'Linha digitavel oficial (47 ou 48 digitos) retornada pelo banco/convenio.';
comment on column public.payment_guides.bank_reference is
  'Identificador externo da cobranca no banco/provedor para conciliacao e auditoria.';
