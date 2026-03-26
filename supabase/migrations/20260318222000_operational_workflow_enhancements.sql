create table if not exists public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  process_type text not null,
  code text not null,
  label text not null,
  is_required boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.process_requirements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  process_id uuid not null references public.processes(id) on delete cascade,
  title text not null,
  description text not null,
  status text not null default 'aberta',
  visibility text not null default 'misto',
  target_name text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  due_at timestamptz,
  response text,
  response_by uuid references auth.users(id) on delete set null,
  responded_at timestamptz
);

create table if not exists public.process_audit_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  process_id uuid not null references public.processes(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  category text not null,
  title text not null,
  detail text not null,
  visible_to_external boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.process_reopen_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  process_id uuid not null references public.processes(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.processes
  add column if not exists checklist_type text,
  add column if not exists triage_status text not null default 'recebido',
  add column if not exists triage_assigned_to text,
  add column if not exists triage_notes text,
  add column if not exists sla_stage text,
  add column if not exists sla_due_at timestamptz,
  add column if not exists sla_hours_remaining integer,
  add column if not exists sla_breached boolean not null default false;

alter table public.interdepartmental_dispatches
  add column if not exists visibility text not null default 'interno';

alter table public.signature_blocks
  add column if not exists evidence_version integer,
  add column if not exists evidence_hash text,
  add column if not exists evidence_ip inet,
  add column if not exists evidence_user_agent text,
  add column if not exists evidence_timestamp_authority text;

alter table public.process_movements
  add column if not exists visible_to_external boolean not null default true;

alter table public.checklist_templates enable row level security;
alter table public.process_requirements enable row level security;
alter table public.process_audit_entries enable row level security;
alter table public.process_reopen_history enable row level security;

create policy "checklists visible by tenant"
on public.checklist_templates
for select
to authenticated
using (tenant_id is null or public.is_tenant_member(tenant_id));

create policy "requirements visible with process access"
on public.process_requirements
for select
to authenticated
using (public.has_process_access(process_id));

create policy "requirements managed with process access"
on public.process_requirements
for insert
to authenticated
with check (public.has_process_access(process_id));

create policy "requirements updated with process access"
on public.process_requirements
for update
to authenticated
using (public.has_process_access(process_id))
with check (public.has_process_access(process_id));

create policy "audit entries visible with process access"
on public.process_audit_entries
for select
to authenticated
using (public.has_process_access(process_id));

create policy "audit entries insert with process access"
on public.process_audit_entries
for insert
to authenticated
with check (public.has_process_access(process_id));

create policy "reopen history visible with process access"
on public.process_reopen_history
for select
to authenticated
using (public.has_process_access(process_id));

create policy "reopen history insert with process access"
on public.process_reopen_history
for insert
to authenticated
with check (public.has_process_access(process_id));
