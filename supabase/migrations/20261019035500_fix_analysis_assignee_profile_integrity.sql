-- SIGAPRO — integridade do responsável da Análise.
-- 1) Corrige atribuições históricas que apontavam para um perfil administrativo
--    da mesma pessoa, normalizando para o perfil ativo de Analista.
-- 2) Garante que o texto analysis_assigned_to sempre seja derivado do profile_id.
-- 3) Impede futuras atribuições da análise para perfis que não sejam Analista.

with canonical as (
  select id, full_name
  from public.profiles
  where deleted_at is null
    and account_status='active'
    and role='analista'
    and full_name='Jonatas Rodrigues'
  order by created_at asc
  limit 1
),
wrong as (
  select id
  from public.profiles
  where deleted_at is null
    and account_status='active'
    and role='prefeitura_admin'
    and full_name='Jonatas Rodrigues dos Santos'
  order by created_at asc
  limit 1
)
update public.processes p
set analysis_assigned_to_profile_id=c.id,
    analysis_assigned_to=c.full_name,
    updated_at=clock_timestamp()
from canonical c, wrong w
where p.analysis_assigned_to_profile_id=w.id;

create or replace function private.guard_process_analysis_assignee()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
set row_security to 'off'
as $function$
declare
  _target public.profiles%rowtype;
begin
  if new.analysis_assigned_to_profile_id is null then
    new.analysis_assigned_to := null;
    return new;
  end if;

  select *
    into _target
  from public.profiles
  where id=new.analysis_assigned_to_profile_id
    and deleted_at is null
    and account_status='active';

  if _target.id is null then
    raise exception 'O responsável da análise não possui perfil ativo.';
  end if;

  if _target.role <> 'analista' then
    raise exception 'A responsabilidade da análise só pode ser vinculada a um perfil Analista.';
  end if;

  if new.municipality_id is not null
     and _target.municipality_id is distinct from new.municipality_id then
    raise exception 'O Analista responsável pertence a outra Prefeitura.';
  end if;

  new.analysis_assigned_to :=
    coalesce(nullif(btrim(_target.full_name),''),'Analista');

  return new;
end;
$function$;

drop trigger if exists trg_guard_process_analysis_assignee on public.processes;

create trigger trg_guard_process_analysis_assignee
before insert or update of analysis_assigned_to_profile_id, analysis_assigned_to
on public.processes
for each row
execute function private.guard_process_analysis_assignee();
