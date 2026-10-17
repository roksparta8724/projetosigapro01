-- SIGAPRO — acesso mínimo ao resumo do Alvará durante a hidratação da plataforma.
-- O carregamento global lê somente campos de resumo; o formulário completo continua
-- protegido pelos RPCs security definer do fluxo de Alvará.

begin;

alter table public.process_construction_permits enable row level security;

do $policy$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'process_construction_permits'
      and policyname = 'process_construction_permits_select_scoped'
  ) then
    create policy process_construction_permits_select_scoped
      on public.process_construction_permits
      for select
      to authenticated
      using (public.has_process_access(process_id));
  end if;
end
$policy$;

-- Mantém o princípio do menor privilégio: nada de SELECT irrestrito na tabela.
revoke all on table public.process_construction_permits from authenticated;
grant select (process_id, permit_number, status, signature_mode, updated_at)
  on table public.process_construction_permits
  to authenticated;

notify pgrst, 'reload schema';

commit;
