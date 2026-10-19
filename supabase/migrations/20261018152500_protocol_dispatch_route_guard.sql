-- SIGAPRO — guarda de rota da etapa inicial do Habite-se.
-- Impede que um processo ainda na Triagem/Protocolo seja despachado por engano
-- para uma unidade administrativa quando o próximo destino operacional oficial
-- é a Análise Urbanística. Devoluções e demais etapas não são afetadas.

create or replace function public.guard_initial_protocol_dispatch_route()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _process public.processes%rowtype;
  _origin_area text;
  _destination_area text;
begin
  if coalesce(new.status,'aguardando') <> 'aguardando' then
    return new;
  end if;

  select * into _process
  from public.processes p
  where p.id = new.process_id;

  if _process.id is null then
    return new;
  end if;

  _origin_area := public.operational_area_from_label(
    coalesce(
      nullif(btrim(_process.current_department),''),
      nullif(btrim(_process.current_queue),''),
      new.from_department
    )
  );
  _destination_area := public.operational_area_from_label(new.to_department);

  if lower(coalesce(_process.process_type,'')) in ('habite-se','habite se')
     and _process.status = 'triagem'::public.process_status
     and coalesce(_origin_area,'') = 'protocolos'
     and coalesce(_destination_area,'') <> 'analise' then
    raise exception 'Nesta etapa, o Habite-se deve sair do Protocolo diretamente para a Análise Urbanística.';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_guard_initial_protocol_dispatch_route
  on public.interdepartmental_dispatches;

create trigger trg_guard_initial_protocol_dispatch_route
before insert on public.interdepartmental_dispatches
for each row
execute function public.guard_initial_protocol_dispatch_route();

notify pgrst, 'reload schema';
