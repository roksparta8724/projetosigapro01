-- SIGAPRO 2026-10-15
-- Alvará de Construção com dupla assinatura municipal.
-- IMPORTANTE: migration versionada para o deploy final. Não aplicada ao banco oficial nesta fase local.

create table if not exists public.construction_permits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  municipality_id uuid null references public.municipalities(id) on delete set null,
  process_id uuid not null unique references public.processes(id) on delete cascade,
  permit_number text not null,
  status text not null default 'rascunho'
    check (status in ('rascunho','aguardando_diretor','emitido','cancelado')),
  snapshot jsonb not null default '{}'::jsonb,
  analyst_profile_id uuid null references public.profiles(id) on delete set null,
  analyst_name text null,
  analyst_title text null,
  analyst_signed_at timestamptz null,
  director_profile_id uuid null references public.profiles(id) on delete set null,
  director_name text null,
  director_title text null,
  director_signed_at timestamptz null,
  document_hash text null,
  issued_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists construction_permits_municipality_number_key
  on public.construction_permits(municipality_id, permit_number)
  where municipality_id is not null;

create index if not exists idx_construction_permits_process
  on public.construction_permits(process_id);

create index if not exists idx_construction_permits_status
  on public.construction_permits(municipality_id, status);

alter table public.construction_permits enable row level security;

drop policy if exists construction_permits_select_scoped on public.construction_permits;
create policy construction_permits_select_scoped
on public.construction_permits
for select
using (
  public.is_master()
  or (
    public.has_process_access(process_id)
    and (
      status = 'emitido'
      or coalesce(public.current_role_code(), '') not in (
        'profissional_externo',
        'proprietario_consulta',
        'property_owner'
      )
    )
  )
);

-- Escrita direta fica bloqueada para clientes. O deploy final deve usar RPCs
-- específicos que validem: processo na Análise, ISS compensado, documentos
-- aprovados, analista responsável e cargo de Diretor no organograma/perfil.
revoke insert, update, delete on public.construction_permits from public;

comment on table public.construction_permits is
  'Alvarás de Construção do SIGAPRO. O documento final exige assinatura da análise técnica e da Diretoria responsável.';

notify pgrst, 'reload schema';
