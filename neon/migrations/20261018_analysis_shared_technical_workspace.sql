-- SIGAPRO — mesa técnica compartilhada da Análise Urbanística.
-- A atribuição de responsável permanece para carga/SLA/auditoria, porém não
-- bloqueia outro Analista da mesma unidade e Prefeitura de trabalhar nos
-- documentos de Projeto ou Habite-se enquanto o processo estiver na Análise.

create or replace function public.can_write_process_analysis(_process_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _actor uuid := public.current_profile_id();
  _actor_role text;
  _actor_municipality uuid;
  _process_municipality uuid;
  _actor_area text;
begin
  if public.is_master() then return true; end if;
  if _actor is null then return false; end if;

  select p.role,p.municipality_id
    into _actor_role,_actor_municipality
  from public.profiles p
  where p.id=_actor
    and p.deleted_at is null
    and p.account_status='active';

  if _actor_role not in ('analista','prefeitura_supervisor') then
    return false;
  end if;

  _actor_area := public.profile_operational_area(_actor);
  if _actor_area <> 'analise' then
    return false;
  end if;

  select coalesce(p.municipality_id,p.tenant_id)
    into _process_municipality
  from public.processes p
  where p.id=_process_id;

  if _process_municipality is null
     or _actor_municipality is distinct from _process_municipality then
    return false;
  end if;

  return public.process_is_in_analysis_area(_process_id);
end;
$function$;

create or replace function public.guard_analysis_document_write()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
begin
  if public.current_profile_id() is not null
     and (
       public.process_is_in_analysis_area(new.process_id)
       or exists (
         select 1
         from public.processes p
         where p.id=new.process_id
           and p.analysis_assigned_to_profile_id is not null
       )
     )
     and (
       new.review_status is distinct from old.review_status
       or new.annotations is distinct from old.annotations
     )
     and not public.can_write_process_analysis(new.process_id) then
    raise exception 'Somente a equipe da Análise Urbanística desta Prefeitura pode alterar a análise documental.';
  end if;
  return new;
end;
$function$;

create or replace function public.guard_analysis_requirement_insert()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
begin
  if public.current_profile_id() is not null
     and public.process_is_in_analysis_area(new.process_id)
     and not public.can_write_process_analysis(new.process_id) then
    raise exception 'Somente a equipe da Análise Urbanística desta Prefeitura pode criar exigência nesta etapa.';
  end if;
  return new;
end;
$function$;

create or replace function public.guard_analysis_dispatch_insert()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
begin
  if public.current_profile_id() is not null
     and public.process_is_in_analysis_area(new.process_id)
     and not public.can_write_process_analysis(new.process_id) then
    raise exception 'Somente a equipe da Análise Urbanística desta Prefeitura pode despachar este processo nesta etapa.';
  end if;
  return new;
end;
$function$;

create or replace function public.guard_analysis_process_update()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
begin
  if public.current_profile_id() is not null
     and public.process_is_in_analysis_area(old.id)
     and (
       new.status is distinct from old.status
       or new.current_department is distinct from old.current_department
       or new.current_queue is distinct from old.current_queue
       or new.analysis_assigned_to_profile_id is distinct from old.analysis_assigned_to_profile_id
     )
     and not public.can_write_process_analysis(old.id) then
    raise exception 'Somente a equipe da Análise Urbanística desta Prefeitura pode alterar o fluxo desta etapa.';
  end if;
  return new;
end;
$function$;

grant execute on function public.can_write_process_analysis(uuid) to authenticated;

notify pgrst, 'reload schema';
