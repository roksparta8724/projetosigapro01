-- SIGAPRO — fallback canônico de leitura de processos visíveis.
-- Mantém o mesmo controle de acesso de has_process_access e evita que uma
-- falha pontual do endpoint REST zere a carteira do profissional externo.

create or replace function public.list_visible_processes_v1()
returns setof public.processes
language sql
stable
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
  select p.*
  from public.processes p
  where p.archived_at is null
    and public.has_process_access(p.id)
  order by p.created_at desc
$function$;

grant execute on function public.list_visible_processes_v1() to authenticated;

notify pgrst, 'reload schema';
