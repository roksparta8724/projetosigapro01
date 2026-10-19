-- SIGAPRO — integridade histórica das guias municipais.
-- A data de emissão/pagamento é um fato administrativo, não um valor de tela.
-- Uma guia paga não pode ser "renovada" silenciosamente em F5, login ou consulta.

alter table public.payment_guides
  add column if not exists issued_on date,
  add column if not exists paid_on date;

-- Preserva o dia civil que já estava gravado, sem aplicar conversão de fuso a
-- timestamps legados "without time zone".
update public.payment_guides
set issued_on = created_at::date
where issued_on is null
  and created_at is not null;

update public.payment_guides
set paid_on = paid_at::date
where paid_on is null
  and paid_at is not null;

create or replace function public.protect_payment_guide_history_v1()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $function$
begin
  if tg_op='INSERT' then
    new.issued_on := coalesce(
      new.issued_on,
      new.created_at::date,
      (clock_timestamp() at time zone 'America/Sao_Paulo')::date
    );
    if coalesce(new.paid,false) then
      new.paid_on := coalesce(
        new.paid_on,
        new.paid_at::date,
        (clock_timestamp() at time zone 'America/Sao_Paulo')::date
      );
    end if;
    return new;
  end if;

  -- Identidade e emissão são imutáveis para qualquer tipo de guia.
  new.id := old.id;
  new.process_id := old.process_id;
  new.tenant_id := old.tenant_id;
  new.municipality_id := old.municipality_id;
  new.property_id := old.property_id;
  new.guide_number := old.guide_number;
  new.created_at := old.created_at;
  new.issued_on := old.issued_on;

  -- A primeira baixa também é um fato histórico imutável.
  if coalesce(old.paid,false) then
    new.paid := true;
    new.paid_at := old.paid_at;
    new.paid_on := old.paid_on;
    new.amount := old.amount;
    new.due_date := old.due_date;
    new.original_due_date := old.original_due_date;
    new.reissue_count := old.reissue_count;
    new.last_reissued_at := old.last_reissued_at;
  elsif coalesce(new.paid,false) then
    new.paid_on := coalesce(
      new.paid_on,
      new.paid_at::date,
      (clock_timestamp() at time zone 'America/Sao_Paulo')::date
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_protect_payment_guide_history_v1 on public.payment_guides;
create trigger trg_protect_payment_guide_history_v1
before insert or update on public.payment_guides
for each row execute function public.protect_payment_guide_history_v1();

comment on column public.payment_guides.issued_on is
  'Dia civil imutável em que a guia foi emitida.';
comment on column public.payment_guides.paid_on is
  'Dia civil imutável da primeira confirmação de pagamento.';

notify pgrst,'reload schema';
