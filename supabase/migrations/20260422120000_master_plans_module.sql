create extension if not exists "pgcrypto";

alter table public.plans
  alter column id drop default;

alter table public.plans
  alter column id type text using id::text;

alter table public.plans
  alter column id set default gen_random_uuid()::text;

alter table public.plans
  add column if not exists account_level text,
  add column if not exists subtitle text not null default '',
  add column if not exists price numeric(12,2) not null default 0,
  add column if not exists billing_cycle text not null default 'mensal',
  add column if not exists badge text,
  add column if not exists badge_variant text not null default 'default',
  add column if not exists features_included jsonb not null default '[]'::jsonb,
  add column if not exists features_excluded jsonb not null default '[]'::jsonb,
  add column if not exists modules_included jsonb not null default '[]'::jsonb,
  add column if not exists max_users integer,
  add column if not exists max_processes integer,
  add column if not exists max_departments integer,
  add column if not exists max_storage_gb integer,
  add column if not exists is_featured boolean not null default false,
  add column if not exists is_active boolean not null default true,
  add column if not exists is_public boolean not null default false,
  add column if not exists is_internal_only boolean not null default false,
  add column if not exists is_custom boolean not null default false,
  add column if not exists is_visible_in_master boolean not null default true,
  add column if not exists display_order integer not null default 0,
  add column if not exists accent_color text not null default '#1d4ed8',
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.plans
  drop constraint if exists plans_billing_cycle_check;

alter table public.plans
  add constraint plans_billing_cycle_check
  check (billing_cycle in ('mensal', 'anual', 'personalizado'));

alter table public.plans
  drop constraint if exists plans_badge_variant_check;

alter table public.plans
  add constraint plans_badge_variant_check
  check (badge_variant in ('default', 'blue', 'emerald', 'amber', 'rose', 'slate'));

update public.plans
set
  account_level = coalesce(account_level, name),
  is_active = coalesce(is_enabled, false),
  is_public = false,
  is_visible_in_master = false,
  updated_at = coalesce(updated_at, timezone('utc', now()))
where code in ('starter-governo', 'growth-governo', 'enterprise-governo');

insert into public.plans (
  id,
  code,
  account_level,
  name,
  subtitle,
  description,
  price,
  billing_cycle,
  badge,
  badge_variant,
  features_included,
  features_excluded,
  modules_included,
  max_users,
  max_processes,
  max_departments,
  max_storage_gb,
  is_featured,
  is_active,
  is_enabled,
  is_public,
  is_internal_only,
  is_custom,
  is_visible_in_master,
  display_order,
  accent_color,
  notes
) values
  (
    'plan-basic',
    'plan-basic',
    'Basic',
    'Basic',
    'Entrada institucional controlada',
    'Fluxo essencial para prefeituras que estão iniciando a digitalização do protocolo e da análise.',
    1490,
    'mensal',
    null,
    'slate',
    '["Protocolo digital institucional","Triagem documental guiada","Acesso externo para profissionais","Branding municipal essencial"]'::jsonb,
    '["Módulo financeiro avançado","Automação ampliada de operação","Atendimento enterprise dedicado"]'::jsonb,
    '["Protocolo digital","Configurações","Acesso externo"]'::jsonb,
    12,
    250,
    4,
    20,
    false,
    true,
    true,
    true,
    false,
    false,
    true,
    1,
    '#1d4ed8',
    'Ideal para municípios com operação inicial e baixa complexidade de análise.'
  ),
  (
    'plan-pro',
    'plan-pro',
    'Pro',
    'Pro',
    'Operação municipal completa',
    'Plano de tração para prefeituras com análise técnica, financeiro e histórico institucional integrados.',
    2890,
    'mensal',
    'Mais popular',
    'blue',
    '["Protocolo, análise e financeiro integrados","Histórico e trilha operacional","Filas por responsável e gestão por equipe","Painéis executivos e alertas"]'::jsonb,
    '["Customizações enterprise profundas"]'::jsonb,
    '["Protocolo digital","Analise tecnica","Financeiro","Configurações","Acesso externo"]'::jsonb,
    40,
    1200,
    12,
    80,
    true,
    true,
    true,
    true,
    false,
    false,
    true,
    2,
    '#0f766e',
    'Plano recomendado para a maior parte das prefeituras da carteira.'
  ),
  (
    'plan-premium',
    'plan-premium',
    'Premium',
    'Premium',
    'Governança ampliada e multi-secretaria',
    'Camada premium com maior capacidade operacional, monitoramento gerencial e personalização institucional estendida.',
    4890,
    'mensal',
    'Recomendado',
    'emerald',
    '["Tudo do plano Pro","Operação multi-secretaria","Dashboards ampliados por área","Políticas e fluxos institucionais refinados","Mais capacidade documental e de usuários"]'::jsonb,
    '["SLA enterprise dedicado 24/7"]'::jsonb,
    '["Protocolo digital","Analise tecnica","Financeiro","Assinatura","Configurações","Acesso externo"]'::jsonb,
    120,
    5000,
    30,
    250,
    false,
    true,
    true,
    true,
    false,
    false,
    true,
    3,
    '#7c3aed',
    'Voltado a cidades com maior volume operacional e necessidade de governança ampliada.'
  ),
  (
    'plan-enterprise',
    'plan-enterprise',
    'Enterprise',
    'Enterprise',
    'Estrutura customizada e comercial',
    'Plano corporativo com desenho contratual próprio, camadas extras de atendimento e pacote de implantação dedicado.',
    0,
    'personalizado',
    'Enterprise',
    'amber',
    '["Ambiente e módulos configuráveis","Regras comerciais personalizadas","Atendimento e implantação dedicados","Possibilidade de pricing customizado"]'::jsonb,
    '[]'::jsonb,
    '["Protocolo digital","Analise tecnica","Financeiro","Assinatura","Configurações","Acesso externo"]'::jsonb,
    null,
    null,
    null,
    null,
    false,
    true,
    true,
    false,
    true,
    true,
    true,
    4,
    '#b45309',
    'Usado para propostas comerciais especiais e contratos sob medida.'
  )
on conflict (id) do update
set
  code = excluded.code,
  account_level = excluded.account_level,
  name = excluded.name,
  subtitle = excluded.subtitle,
  description = excluded.description,
  price = excluded.price,
  billing_cycle = excluded.billing_cycle,
  badge = excluded.badge,
  badge_variant = excluded.badge_variant,
  features_included = excluded.features_included,
  features_excluded = excluded.features_excluded,
  modules_included = excluded.modules_included,
  max_users = excluded.max_users,
  max_processes = excluded.max_processes,
  max_departments = excluded.max_departments,
  max_storage_gb = excluded.max_storage_gb,
  is_featured = excluded.is_featured,
  is_active = excluded.is_active,
  is_enabled = excluded.is_enabled,
  is_public = excluded.is_public,
  is_internal_only = excluded.is_internal_only,
  is_custom = excluded.is_custom,
  is_visible_in_master = excluded.is_visible_in_master,
  display_order = excluded.display_order,
  accent_color = excluded.accent_color,
  notes = excluded.notes,
  updated_at = timezone('utc', now());

create table if not exists public.client_plan_assignments (
  id text primary key default gen_random_uuid()::text,
  municipality_id uuid not null references public.municipalities(id) on delete cascade,
  plan_id text not null references public.plans(id) on delete restrict,
  contract_status text not null default 'rascunho',
  starts_at date,
  ends_at date,
  billing_cycle text not null default 'mensal',
  billing_notes text,
  custom_price numeric(12,2),
  is_custom boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (municipality_id)
);

alter table public.client_plan_assignments
  drop constraint if exists client_plan_assignments_contract_status_check;

alter table public.client_plan_assignments
  add constraint client_plan_assignments_contract_status_check
  check (contract_status in ('rascunho', 'ativo', 'trial', 'suspenso', 'upgrade', 'downgrade', 'encerrado'));

alter table public.client_plan_assignments
  drop constraint if exists client_plan_assignments_billing_cycle_check;

alter table public.client_plan_assignments
  add constraint client_plan_assignments_billing_cycle_check
  check (billing_cycle in ('mensal', 'anual', 'personalizado'));

create index if not exists idx_plans_active_public
  on public.plans (is_active, is_public, display_order);

create index if not exists idx_client_plan_assignments_municipality
  on public.client_plan_assignments (municipality_id);

create index if not exists idx_client_plan_assignments_plan
  on public.client_plan_assignments (plan_id);

alter table public.plans enable row level security;
alter table public.client_plan_assignments enable row level security;

drop policy if exists "plans_public_read_active" on public.plans;
create policy "plans_public_read_active"
on public.plans
for select
to anon, authenticated
using (is_active = true and is_public = true);

drop policy if exists "plans_master_manage" on public.plans;
create policy "plans_master_manage"
on public.plans
for all
to authenticated
using (public.is_admin_master())
with check (public.is_admin_master());

drop policy if exists "client_plan_assignments_master_manage" on public.client_plan_assignments;
create policy "client_plan_assignments_master_manage"
on public.client_plan_assignments
for all
to authenticated
using (public.is_admin_master())
with check (public.is_admin_master());

grant select on public.plans to anon;
grant select, insert, update, delete on public.plans to authenticated;
grant select, insert, update, delete on public.client_plan_assignments to authenticated;
