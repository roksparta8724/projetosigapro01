create extension if not exists "pgcrypto";

create table if not exists public.commercial_materials (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  plan_ids jsonb not null default '[]'::jsonb,
  model_type text not null,
  material_type text not null,
  customer_name text,
  customer_contact text,
  responsible_name text,
  responsible_role text,
  title text not null,
  subtitle text,
  generated_content jsonb not null default '{}'::jsonb,
  pdf_url text,
  share_slug text unique,
  is_public boolean not null default false,
  status text not null default 'draft',
  valid_until date,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.commercial_materials
  drop constraint if exists commercial_materials_model_type_check;

alter table public.commercial_materials
  add constraint commercial_materials_model_type_check
  check (model_type in ('executivo', 'premium', 'comparativo', 'personalizada'));

alter table public.commercial_materials
  drop constraint if exists commercial_materials_material_type_check;

alter table public.commercial_materials
  add constraint commercial_materials_material_type_check
  check (material_type in ('banner', 'folder', 'proposta'));

alter table public.commercial_materials
  drop constraint if exists commercial_materials_status_check;

alter table public.commercial_materials
  add constraint commercial_materials_status_check
  check (status in ('draft', 'active', 'archived'));

create index if not exists idx_commercial_materials_created_by
  on public.commercial_materials (created_by);

create index if not exists idx_commercial_materials_status
  on public.commercial_materials (status, created_at desc);

create index if not exists idx_commercial_materials_share_slug
  on public.commercial_materials (share_slug)
  where share_slug is not null;

alter table public.commercial_materials enable row level security;

drop policy if exists "commercial_materials_master_manage" on public.commercial_materials;
create policy "commercial_materials_master_manage"
on public.commercial_materials
for all
to authenticated
using (public.is_admin_master())
with check (public.is_admin_master());

drop policy if exists "commercial_materials_public_share_read" on public.commercial_materials;
create policy "commercial_materials_public_share_read"
on public.commercial_materials
for select
to anon, authenticated
using (is_public = true and status = 'active' and share_slug is not null);

grant select on public.commercial_materials to anon;
grant select, insert, update, delete on public.commercial_materials to authenticated;
