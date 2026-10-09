-- SIGAPRO: normaliza guide_kind em guias históricas já vinculadas ao modelo processes.
-- Guias órfãs do modelo antigo (process_id null) são preservadas como histórico.

update public.payment_guides
   set guide_kind='protocolo'
 where process_id is not null
   and nullif(btrim(guide_kind),'') is null;

create or replace function public.set_process_payment_guide_kind()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if new.process_id is not null and nullif(btrim(new.guide_kind),'') is null then
    new.guide_kind := 'protocolo';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_set_process_payment_guide_kind on public.payment_guides;
create trigger trg_set_process_payment_guide_kind
before insert or update of process_id,guide_kind on public.payment_guides
for each row
execute function public.set_process_payment_guide_kind();
