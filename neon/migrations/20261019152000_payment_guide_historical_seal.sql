-- SIGAPRO — selo histórico das guias de arrecadação.
-- A emissão é um fato administrativo: created_at nunca muda.
-- Depois da compensação, identidade, valor, vencimento e baixa ficam imutáveis.
-- Dados técnicos do provedor podem ser complementados posteriormente sem
-- reabrir nem recriar a cobrança.

create or replace function public.protect_payment_guide_historical_seal_v1()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $function$
declare
  _old_paid boolean :=
    coalesce(old.paid,false)
    or lower(coalesce(old.status,'')) in ('compensada','confirmed','paid','pago','confirmado');
begin
  if new.created_at is distinct from old.created_at then
    raise exception 'A data original de emissao da guia e imutavel';
  end if;

  if _old_paid then
    if new.guide_number is distinct from old.guide_number
       or new.guide_kind is distinct from old.guide_kind
       or new.process_id is distinct from old.process_id
       or new.tenant_id is distinct from old.tenant_id
       or new.municipality_id is distinct from old.municipality_id
       or new.property_id is distinct from old.property_id
       or new.amount is distinct from old.amount
       or new.due_date is distinct from old.due_date then
      raise exception 'Guia compensada e documento financeiro historico e nao pode ser reemitida ou alterada';
    end if;

    -- Um registro legado pode estar "confirmed" com paid=false e paid_at
    -- ausente. Preservar esse estado até que haja autenticação comprovada;
    -- nunca inventar data ou baixa retroativa.
    if coalesce(old.paid,false) and not coalesce(new.paid,false) then
      raise exception 'A baixa de uma guia compensada nao pode ser desfeita';
    end if;

    if lower(coalesce(old.status,'')) in ('compensada','confirmed','paid','pago','confirmado')
       and lower(coalesce(new.status,'')) not in ('compensada','confirmed','paid','pago','confirmado') then
      raise exception 'O status financeiro de uma guia compensada nao pode retroceder';
    end if;

    if old.paid_at is not null and new.paid_at is distinct from old.paid_at then
      raise exception 'A data original de pagamento da guia e imutavel';
    end if;

    if lower(coalesce(new.status,'')) not in ('compensada','confirmed','paid','pago','confirmado') then
      raise exception 'O status financeiro de uma guia compensada nao pode retroceder';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_protect_payment_guide_historical_seal_v1
on public.payment_guides;

create trigger trg_protect_payment_guide_historical_seal_v1
before update on public.payment_guides
for each row
execute function public.protect_payment_guide_historical_seal_v1();
