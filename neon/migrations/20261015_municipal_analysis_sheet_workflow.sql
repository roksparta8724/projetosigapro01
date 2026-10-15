-- SIGAPRO 2026-10-15
-- Ficha municipal de análise de processos.
-- Versionada para o deploy final. NÃO aplicada ao banco oficial nesta etapa local.

create table if not exists public.process_analysis_sheets (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id) on delete cascade,
  tenant_id uuid null references public.tenants(id) on delete set null,
  process_id uuid not null references public.processes(id) on delete cascade,
  version integer not null default 1,
  analysis_date date null,
  sheet_number text not null default '1',
  header_snapshot jsonb not null default '{}'::jsonb,
  items jsonb not null default '{}'::jsonb,
  routing text null,
  routing_other text null,
  conclusion text null,
  communique_pages text null,
  technical_signature jsonb null,
  fiscal_signature jsonb null,
  status text not null default 'rascunho'
    check (status in ('rascunho','assinado_tecnico','conferido_fiscal')),
  updated_by_profile_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (municipality_id, process_id)
);

create index if not exists idx_process_analysis_sheets_process
  on public.process_analysis_sheets(process_id);

create index if not exists idx_process_analysis_sheets_municipality
  on public.process_analysis_sheets(municipality_id, updated_at desc);

alter table public.process_analysis_sheets enable row level security;

drop policy if exists process_analysis_sheets_select_scoped
  on public.process_analysis_sheets;
create policy process_analysis_sheets_select_scoped
  on public.process_analysis_sheets
  for select
  using (
    public.is_master()
    or public.has_process_access(process_id)
  );

-- Escrita fica restrita a perfis internos autorizados no processo.
drop policy if exists process_analysis_sheets_write_scoped
  on public.process_analysis_sheets;
create policy process_analysis_sheets_write_scoped
  on public.process_analysis_sheets
  for all
  using (
    public.is_master()
    or (
      public.has_process_access(process_id)
      and coalesce(public.current_role_code(), '') in (
        'analista',
        'prefeitura_supervisor',
        'fiscal'
      )
    )
  )
  with check (
    public.is_master()
    or (
      public.has_process_access(process_id)
      and coalesce(public.current_role_code(), '') in (
        'analista',
        'prefeitura_supervisor',
        'fiscal'
      )
    )
  );

create or replace function public.touch_process_analysis_sheet_v1()
returns trigger
language plpgsql
security invoker
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_process_analysis_sheet_v1
  on public.process_analysis_sheets;
create trigger trg_touch_process_analysis_sheet_v1
before update on public.process_analysis_sheets
for each row execute function public.touch_process_analysis_sheet_v1();

comment on table public.process_analysis_sheets is
  'Ficha oficial digital da análise urbanística, compartilhada entre análise técnica e fiscalização.';

notify pgrst, 'reload schema';
