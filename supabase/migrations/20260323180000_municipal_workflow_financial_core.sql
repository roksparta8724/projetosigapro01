create table if not exists public.municipal_workflows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  label text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.municipal_workflow_stages (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.municipal_workflows(id) on delete cascade,
  code text not null,
  label text not null,
  description text,
  queue_code text not null,
  stage_type text not null,
  order_index integer not null,
  requires_payment boolean not null default false,
  requires_checklist boolean not null default false,
  allows_requirement boolean not null default false,
  is_terminal boolean not null default false,
  created_at timestamptz not null default now(),
  unique (workflow_id, code)
);

create table if not exists public.municipal_workflow_transitions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.municipal_workflows(id) on delete cascade,
  from_stage_code text not null,
  to_stage_code text not null,
  action_label text not null,
  allowed_roles text[] not null default '{}',
  validation_rules text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.municipal_work_queues (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  label text not null,
  sector text not null,
  allowed_roles text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.municipal_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  process_type text not null,
  code text not null,
  label text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.municipal_checklist_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.municipal_checklist_templates(id) on delete cascade,
  title text not null,
  reference text,
  guidance text,
  required boolean not null default true,
  order_index integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.municipal_fee_tables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  label text not null,
  description text,
  currency text not null default 'BRL',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.municipal_fee_rules (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.municipal_fee_tables(id) on delete cascade,
  code text not null,
  label text not null,
  kind text not null,
  process_type text,
  amount numeric(14,2),
  rate numeric(14,6),
  professional_category text,
  construction_standard text,
  occupancy_permit boolean not null default false,
  created_at timestamptz not null default now(),
  unique (table_id, code)
);

create table if not exists public.municipal_fee_rule_tiers (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.municipal_fee_rules(id) on delete cascade,
  min_area numeric(14,2),
  max_area numeric(14,2),
  fixed_amount numeric(14,2),
  rate_per_square_meter numeric(14,6),
  created_at timestamptz not null default now()
);

create table if not exists public.bank_integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  bank_code text not null,
  bank_name text not null,
  agreement_code text not null,
  settlement_mode text not null default 'manual',
  pix_enabled boolean not null default false,
  pix_key text,
  wallet_code text,
  agency text,
  account_number text,
  return_layout text,
  api_base_url text,
  webhook_secret text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.calculation_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  process_id uuid references public.processes(id) on delete cascade,
  fee_table_id uuid references public.municipal_fee_tables(id) on delete set null,
  snapshot_kind text not null,
  input_payload jsonb not null default '{}'::jsonb,
  result_payload jsonb not null default '{}'::jsonb,
  calculated_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_municipal_workflows_tenant on public.municipal_workflows (tenant_id);
create index if not exists idx_municipal_workflow_stages_workflow on public.municipal_workflow_stages (workflow_id, order_index);
create index if not exists idx_municipal_checklist_templates_tenant on public.municipal_checklist_templates (tenant_id, process_type);
create index if not exists idx_municipal_fee_tables_tenant on public.municipal_fee_tables (tenant_id);
create index if not exists idx_bank_integrations_tenant on public.bank_integrations (tenant_id, active);
create index if not exists idx_calculation_snapshots_process on public.calculation_snapshots (process_id, created_at desc);
