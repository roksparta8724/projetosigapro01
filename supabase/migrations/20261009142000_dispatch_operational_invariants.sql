-- SIGAPRO: um processo possui uma unica pasta operacional ativa por vez.

create unique index if not exists interdepartmental_dispatches_one_active_per_process_uidx
  on public.interdepartmental_dispatches(process_id)
  where status in ('aguardando','respondido');

create or replace function public.guard_interdepartmental_dispatch()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if lower(btrim(new.from_department))=lower(btrim(new.to_department)) then
    raise exception 'Origem e destino do despacho precisam ser diferentes';
  end if;

  if new.due_at is not null and new.due_at < now() then
    raise exception 'O prazo do despacho nao pode estar no passado';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_guard_interdepartmental_dispatch
  on public.interdepartmental_dispatches;

create trigger trg_guard_interdepartmental_dispatch
before insert or update of from_department,to_department,due_at
on public.interdepartmental_dispatches
for each row
execute function public.guard_interdepartmental_dispatch();

revoke all on function public.guard_interdepartmental_dispatch() from public;
revoke all on function public.guard_interdepartmental_dispatch() from authenticated;
