-- SIGAPRO Municipal — integração bancária canônica no Neon.
-- PREPARAÇÃO SOMENTE: esta migration não é aplicada automaticamente.
-- Dados bancários são sempre retornados por provedor/convênio oficial.
-- O SIGAPRO nunca fabrica linha digitável, código de barras ou autenticação.

begin;

alter table if exists public.payment_guides
  add column if not exists barcode text,
  add column if not exists digitable_line text,
  add column if not exists bank_reference text,
  add column if not exists bank_payment_id text,
  add column if not exists bank_status text,
  add column if not exists bank_status_detail text,
  add column if not exists bank_authenticated_at timestamptz,
  add column if not exists payment_provider text,
  add column if not exists provider_environment text;

comment on column public.payment_guides.barcode is
  'Conteudo de codigo de barras oficial retornado pelo banco/provedor. Nunca completar ou fabricar localmente.';
comment on column public.payment_guides.digitable_line is
  'Linha digitavel oficial retornada pelo banco/provedor (normalmente 47 ou 48 digitos).';
comment on column public.payment_guides.bank_reference is
  'Identificador externo da order/cobranca para conciliacao e auditoria.';
comment on column public.payment_guides.bank_payment_id is
  'Identificador do pagamento retornado pelo provedor.';
comment on column public.payment_guides.bank_status is
  'Status bruto da order/pagamento informado pelo provedor.';
comment on column public.payment_guides.bank_status_detail is
  'Detalhe bruto do status informado pelo provedor.';
comment on column public.payment_guides.bank_authenticated_at is
  'Data/hora em que o provedor confirmou a compensacao/credito.';
comment on column public.payment_guides.payment_provider is
  'Provedor responsavel pela cobranca, por exemplo mercado_pago ou bank_direct.';
comment on column public.payment_guides.provider_environment is
  'Ambiente da cobranca: test ou production.';

commit;

notify pgrst, 'reload schema';
