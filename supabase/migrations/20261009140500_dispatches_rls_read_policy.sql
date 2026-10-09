-- SIGAPRO: despacho intersetorial segue o mesmo modelo de segurança do processo.
alter table public.interdepartmental_dispatches enable row level security;

drop policy if exists interdepartmental_dispatches_select_scoped
  on public.interdepartmental_dispatches;

create policy interdepartmental_dispatches_select_scoped
  on public.interdepartmental_dispatches
  for select
  to authenticated
  using (public.has_process_access(process_id));

revoke all on table public.interdepartmental_dispatches from authenticated;
grant select on table public.interdepartmental_dispatches to authenticated;
