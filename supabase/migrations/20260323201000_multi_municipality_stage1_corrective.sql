-- Corrective Stage 1 migration for the real current schema.
-- This migration adapts existing public.municipalities and public.profiles
-- to a municipality-scoped multi-tenant model without recreating them.

create extension if not exists "pgcrypto";

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table if exists public.municipalities
  add column if not exists slug text,
  add column if not exists subdomain text,
  add column if not exists custom_domain text,
  add column if not exists status text not null default 'active',
  add column if not exists secretariat_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists address text,
  add column if not exists updated_at timestamptz not null default now();

update public.municipalities
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

update public.municipalities
set slug = lower(
  regexp_replace(
    trim(both '-' from regexp_replace(coalesce(name, ''), '[^a-zA-Z0-9]+', '-', 'g')),
    '-+',
    '-',
    'g'
  )
)
where slug is null
  and coalesce(name, '') <> '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'municipalities_status_check'
      and conrelid = 'public.municipalities'::regclass
  ) then
    alter table public.municipalities
      add constraint municipalities_status_check
      check (status in ('active', 'inactive', 'blocked', 'implementation'))
      not valid;
  end if;
end $$;

alter table if exists public.municipalities validate constraint municipalities_status_check;

create unique index if not exists idx_municipalities_slug_unique
  on public.municipalities (slug)
  where slug is not null;

create unique index if not exists idx_municipalities_subdomain_unique
  on public.municipalities (subdomain)
  where subdomain is not null;

create unique index if not exists idx_municipalities_custom_domain_unique
  on public.municipalities (custom_domain)
  where custom_domain is not null;

create index if not exists idx_municipalities_status
  on public.municipalities (status);

drop trigger if exists trg_touch_municipalities on public.municipalities;
create trigger trg_touch_municipalities
before update on public.municipalities
for each row execute function public.touch_updated_at();

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id) on delete cascade,
  code text,
  name text not null,
  description text,
  email text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (municipality_id, name)
);

create index if not exists idx_departments_municipality_id
  on public.departments (municipality_id);

create index if not exists idx_departments_municipality_active
  on public.departments (municipality_id, is_active);

drop trigger if exists trg_touch_departments on public.departments;
create trigger trg_touch_departments
before update on public.departments
for each row execute function public.touch_updated_at();

create table if not exists public.municipality_branding (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id) on delete cascade,
  logo_url text,
  coat_of_arms_url text,
  primary_color text,
  secondary_color text,
  accent_color text,
  official_header_text text,
  official_footer_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (municipality_id)
);

create index if not exists idx_municipality_branding_municipality_id
  on public.municipality_branding (municipality_id);

drop trigger if exists trg_touch_municipality_branding on public.municipality_branding;
create trigger trg_touch_municipality_branding
before update on public.municipality_branding
for each row execute function public.touch_updated_at();

create table if not exists public.municipality_settings (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id) on delete cascade,
  protocol_prefix text,
  guide_prefix text,
  timezone text not null default 'America/Sao_Paulo',
  locale text not null default 'pt-BR',
  require_professional_registration boolean not null default true,
  allow_digital_protocol boolean not null default true,
  allow_walkin_protocol boolean not null default false,
  general_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (municipality_id)
);

create index if not exists idx_municipality_settings_municipality_id
  on public.municipality_settings (municipality_id);

drop trigger if exists trg_touch_municipality_settings on public.municipality_settings;
create trigger trg_touch_municipality_settings
before update on public.municipality_settings
for each row execute function public.touch_updated_at();

alter table if exists public.profiles
  add column if not exists municipality_id uuid references public.municipalities(id) on delete set null,
  add column if not exists department_id uuid references public.departments(id) on delete set null,
  add column if not exists account_status text not null default 'active',
  add column if not exists blocked_at timestamptz,
  add column if not exists blocked_by uuid references auth.users(id) on delete set null,
  add column if not exists block_reason text,
  add column if not exists created_at timestamptz not null default now();

update public.profiles
set created_at = coalesce(created_at, updated_at, now())
where created_at is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_account_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_account_status_check
      check (account_status in ('active', 'blocked', 'inactive', 'pending'))
      not valid;
  end if;
end $$;

alter table if exists public.profiles validate constraint profiles_account_status_check;

create index if not exists idx_profiles_user_id
  on public.profiles (user_id);

create index if not exists idx_profiles_role
  on public.profiles (role);

create index if not exists idx_profiles_municipality_id
  on public.profiles (municipality_id);

create index if not exists idx_profiles_department_id
  on public.profiles (department_id);

create index if not exists idx_profiles_account_status
  on public.profiles (account_status);

drop trigger if exists trg_touch_profiles on public.profiles;
create trigger trg_touch_profiles
before update on public.profiles
for each row execute function public.touch_updated_at();

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  where p.user_id = auth.uid()
    and p.deleted_at is null
  order by p.updated_at desc nulls last, p.id
  limit 1
$$;

create or replace function public.current_municipality_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.municipality_id
  from public.profiles p
  where p.user_id = auth.uid()
    and p.deleted_at is null
  order by p.updated_at desc nulls last, p.id
  limit 1
$$;

create or replace function public.current_role_code()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.user_id = auth.uid()
    and p.deleted_at is null
  order by p.updated_at desc nulls last, p.id
  limit 1
$$;

create or replace function public.is_admin_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role_code(), '') in ('admin_master', 'master_admin')
$$;

create or replace function public.is_municipality_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role_code(), '') in ('admin_municipality', 'admin_prefeitura', 'prefeitura_admin')
$$;

insert into public.municipality_branding (municipality_id)
select m.id
from public.municipalities m
where not exists (
  select 1
  from public.municipality_branding mb
  where mb.municipality_id = m.id
);

insert into public.municipality_settings (municipality_id)
select m.id
from public.municipalities m
where not exists (
  select 1
  from public.municipality_settings ms
  where ms.municipality_id = m.id
);

alter table public.municipalities enable row level security;
alter table public.municipality_branding enable row level security;
alter table public.municipality_settings enable row level security;
alter table public.departments enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "municipalities_select_scope" on public.municipalities;
create policy "municipalities_select_scope"
on public.municipalities
for select
to authenticated
using (
  public.is_admin_master()
  or id = public.current_municipality_id()
);

drop policy if exists "municipalities_manage_scope" on public.municipalities;
create policy "municipalities_manage_scope"
on public.municipalities
for all
to authenticated
using (
  public.is_admin_master()
  or (
    public.is_municipality_admin()
    and id = public.current_municipality_id()
  )
)
with check (
  public.is_admin_master()
  or (
    public.is_municipality_admin()
    and id = public.current_municipality_id()
  )
);

drop policy if exists "municipality_branding_select_scope" on public.municipality_branding;
create policy "municipality_branding_select_scope"
on public.municipality_branding
for select
to authenticated
using (
  public.is_admin_master()
  or municipality_id = public.current_municipality_id()
);

drop policy if exists "municipality_branding_manage_scope" on public.municipality_branding;
create policy "municipality_branding_manage_scope"
on public.municipality_branding
for all
to authenticated
using (
  public.is_admin_master()
  or (
    public.is_municipality_admin()
    and municipality_id = public.current_municipality_id()
  )
)
with check (
  public.is_admin_master()
  or (
    public.is_municipality_admin()
    and municipality_id = public.current_municipality_id()
  )
);

drop policy if exists "municipality_settings_select_scope" on public.municipality_settings;
create policy "municipality_settings_select_scope"
on public.municipality_settings
for select
to authenticated
using (
  public.is_admin_master()
  or municipality_id = public.current_municipality_id()
);

drop policy if exists "municipality_settings_manage_scope" on public.municipality_settings;
create policy "municipality_settings_manage_scope"
on public.municipality_settings
for all
to authenticated
using (
  public.is_admin_master()
  or (
    public.is_municipality_admin()
    and municipality_id = public.current_municipality_id()
  )
)
with check (
  public.is_admin_master()
  or (
    public.is_municipality_admin()
    and municipality_id = public.current_municipality_id()
  )
);

drop policy if exists "departments_select_scope" on public.departments;
create policy "departments_select_scope"
on public.departments
for select
to authenticated
using (
  public.is_admin_master()
  or municipality_id = public.current_municipality_id()
);

drop policy if exists "departments_manage_scope" on public.departments;
create policy "departments_manage_scope"
on public.departments
for all
to authenticated
using (
  public.is_admin_master()
  or (
    public.is_municipality_admin()
    and municipality_id = public.current_municipality_id()
  )
)
with check (
  public.is_admin_master()
  or (
    public.is_municipality_admin()
    and municipality_id = public.current_municipality_id()
  )
);

drop policy if exists "profiles_select_scope" on public.profiles;
create policy "profiles_select_scope"
on public.profiles
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin_master()
  or (
    public.is_municipality_admin()
    and municipality_id = public.current_municipality_id()
  )
);

drop policy if exists "profiles_update_scope" on public.profiles;
create policy "profiles_update_scope"
on public.profiles
for update
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin_master()
  or (
    public.is_municipality_admin()
    and municipality_id = public.current_municipality_id()
  )
)
with check (
  user_id = auth.uid()
  or public.is_admin_master()
  or (
    public.is_municipality_admin()
    and municipality_id = public.current_municipality_id()
  )
);

drop policy if exists "profiles_insert_self_or_admin" on public.profiles;
create policy "profiles_insert_self_or_admin"
on public.profiles
for insert
to authenticated
with check (
  user_id = auth.uid()
  or public.is_admin_master()
  or public.is_municipality_admin()
);
