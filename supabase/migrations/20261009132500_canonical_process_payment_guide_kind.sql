-- SIGAPRO: comportamento canônico para classificar guia inicial de processo.

create or replace function public.set_process_payment_guide_kind()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if new.process_id is not null and new.guide_kind is null then
    new.guide_kind := 'protocolo';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_set_process_payment_guide_kind on public.payment_guides;
create trigger trg_set_process_payment_guide_kind
before insert on public.payment_guides
for each row
execute function public.set_process_payment_guide_kind();
