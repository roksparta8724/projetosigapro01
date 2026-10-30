-- SIGAPRO — cobrança bancária imutável por guia.
-- A emissão, linha digitável, código de barras e IDs do provedor passam a ser
-- patrimônio do registro oficial da guia, não estado temporário do navegador.

alter table public.payment_guides
  add column if not exists bank_reference text,
  add column if not exists bank_payment_id text,
  add column if not exists bank_status text,
  add column if not exists bank_status_detail text,
  add column if not exists bank_authenticated_at timestamptz,
  add column if not exists payment_provider text,
  add column if not exists provider_environment text,
  add column if not exists barcode text,
  add column if not exists digitable_line text,
  add column if not exists ticket_url text,
  add column if not exists provider_charge_saved_at timestamptz;

create or replace function public.persist_payment_guide_provider_charge_v1(
  _guide_code text,
  _order_id text default null,
  _payment_id text default null,
  _status text default null,
  _status_detail text default null,
  _authenticated_at timestamptz default null,
  _payment_provider text default 'mercado_pago',
  _provider_environment text default null,
  _barcode text default null,
  _digitable_line text default null,
  _ticket_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _guide public.payment_guides%rowtype;
begin
  if public.current_profile_id() is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  select g.*
    into _guide
  from public.payment_guides g
  where g.guide_number = nullif(btrim(_guide_code),'')
  order by g.created_at desc
  limit 1
  for update;

  if _guide.id is null then
    raise exception 'Guia nao encontrada';
  end if;

  if _guide.process_id is null or not public.has_process_access(_guide.process_id) then
    raise exception 'Sem acesso a guia';
  end if;

  update public.payment_guides
     set bank_reference = coalesce(nullif(btrim(_order_id),''), bank_reference),
         bank_payment_id = coalesce(nullif(btrim(_payment_id),''), bank_payment_id),
         bank_status = coalesce(nullif(btrim(_status),''), bank_status),
         bank_status_detail = coalesce(nullif(btrim(_status_detail),''), bank_status_detail),
         bank_authenticated_at = coalesce(_authenticated_at, bank_authenticated_at),
         payment_provider = coalesce(nullif(btrim(_payment_provider),''), payment_provider),
         provider_environment = coalesce(nullif(btrim(_provider_environment),''), provider_environment),
         barcode = coalesce(nullif(btrim(_barcode),''), barcode),
         digitable_line = coalesce(nullif(btrim(_digitable_line),''), digitable_line),
         ticket_url = coalesce(nullif(btrim(_ticket_url),''), ticket_url),
         provider_charge_saved_at = coalesce(provider_charge_saved_at, clock_timestamp())
   where id = _guide.id
   returning * into _guide;

  return to_jsonb(_guide);
end;
$function$;

grant execute on function public.persist_payment_guide_provider_charge_v1(
  text,text,text,text,text,timestamptz,text,text,text,text,text
) to authenticated;

notify pgrst, 'reload schema';
