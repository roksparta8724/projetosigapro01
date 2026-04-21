create table if not exists public.zoning_rules (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in ('residencial', 'comercial', 'industrial', 'misto', 'institucional')),
  descricao text not null default '',
  coeficiente_aproveitamento numeric(10,2),
  taxa_ocupacao numeric(10,2),
  taxa_permeabilidade numeric(10,2),
  altura_maxima numeric(10,2),
  recuo_frontal numeric(10,2),
  recuo_lateral numeric(10,2),
  recuo_fundo numeric(10,2),
  usos_permitidos jsonb not null default '[]'::jsonb,
  usos_proibidos text not null default '',
  observacoes text not null default '',
  status text not null default 'ativa' check (status in ('ativa', 'inativa')),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_zoning_rules_municipality_id
  on public.zoning_rules (municipality_id);

create index if not exists idx_zoning_rules_municipality_status
  on public.zoning_rules (municipality_id, status);

create index if not exists idx_zoning_rules_municipality_tipo
  on public.zoning_rules (municipality_id, tipo);

alter table public.zoning_rules enable row level security;

drop policy if exists "zoning_rules_select_municipality_scope" on public.zoning_rules;
create policy "zoning_rules_select_municipality_scope"
on public.zoning_rules
for select
to authenticated
using (
  public.can_access_municipality_scope(municipality_id)
);

drop policy if exists "zoning_rules_manage_municipality_scope" on public.zoning_rules;
create policy "zoning_rules_manage_municipality_scope"
on public.zoning_rules
for all
to authenticated
using (
  public.can_manage_municipality_scope(municipality_id)
)
with check (
  public.can_manage_municipality_scope(municipality_id)
);

grant select, insert, update on public.zoning_rules to authenticated;
