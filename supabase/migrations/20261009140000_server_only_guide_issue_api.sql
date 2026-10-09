-- SIGAPRO: API canônica de emissão não aceita valor/prefixo do cliente.
-- O cálculo e a numeração permanecem 100% server-authoritative.

create or replace function public.issue_process_payment_guide_v2(
  _process_id uuid,
  _guide_kind text,
  _due_date date default null
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
set row_security = off
as $function$
  select public.issue_process_payment_guide(
    _process_id,
    _guide_kind,
    0::numeric,
    'DAM'::text,
    _due_date
  )
$function$;

revoke all on function public.issue_process_payment_guide_v2(uuid,text,date) from public;
grant execute on function public.issue_process_payment_guide_v2(uuid,text,date) to authenticated;

revoke execute on function public.issue_process_payment_guide(uuid,text,numeric,text,date) from authenticated;
