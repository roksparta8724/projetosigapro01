create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'platform_role' and typnamespace = 'public'::regnamespace) then
    create type public.platform_role as enum (
      'master_admin',
      'master_ops',
      'prefeitura_admin',
      'prefeitura_supervisor',
      'analista',
      'financeiro',
      'setor_intersetorial',
      'fiscal',
      'profissional_externo',
      'proprietario_consulta'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'process_status' and typnamespace = 'public'::regnamespace) then
    create type public.process_status as enum (
      'rascunho',
      'protocolo',
      'triagem',
      'pendencia_documental',
      'guia_emitida',
      'pagamento_pendente',
      'pagamento_confirmado',
      'distribuicao',
      'analise_tecnica',
      'despacho_intersetorial',
      'exigencia',
      'reapresentacao',
      'deferido',
      'indeferido',
      'arquivado'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'signature_status' and typnamespace = 'public'::regnamespace) then
    create type public.signature_status as enum ('pendente', 'concluido', 'invalidado');
  end if;

  if not exists (select 1 from pg_type where typname = 'tenant_status' and typnamespace = 'public'::regnamespace) then
    create type public.tenant_status as enum ('implantacao', 'ativo', 'suspenso', 'encerrado');
  end if;
end $$;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  display_name text not null,
  cnpj text not null unique,
  city text not null,
  state text not null,
  status public.tenant_status not null default 'implantacao',
  subdomain text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_branding (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  logo_url text,
  primary_color text not null default '#0f3557',
  accent_color text not null default '#178f78',
  hero_title text,
  hero_subtitle text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null unique,
  is_enabled boolean not null default false,
  description text
);

create table if not exists public.modules_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  default_enabled boolean not null default false
);

create table if not exists public.tenant_modules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_id uuid not null references public.modules_catalog(id) on delete cascade,
  is_enabled boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  unique (tenant_id, module_id)
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  code public.platform_role not null unique,
  label text not null
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  cpf_cnpj text,
  document_masked text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id),
  department text,
  queue_name text,
  level_name text,
  is_active boolean not null default true,
  deleted_at timestamptz,
  unique (tenant_id, user_id, role_id)
);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  iptu_code text not null,
  registry_code text,
  address text not null,
  lot text,
  block text,
  zone_code text,
  usage_type text,
  area_m2 numeric(12,2),
  created_at timestamptz not null default now()
);

create sequence if not exists public.process_protocol_seq start 1;

create table if not exists public.processes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  protocol_number text not null unique,
  external_protocol_number text,
  title text not null,
  process_type text not null,
  status public.process_status not null default 'rascunho',
  current_queue text,
  current_department text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.process_parties (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.processes(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  party_type text not null,
  display_name text not null,
  document_masked text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.document_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  process_type text not null,
  code text not null,
  label text not null,
  is_required boolean not null default true
);

create table if not exists public.process_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  process_id uuid not null references public.processes(id) on delete cascade,
  template_id uuid references public.document_templates(id) on delete set null,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  title text not null,
  file_path text not null,
  file_hash text not null,
  version integer not null default 1,
  source text not null,
  is_required boolean not null default true,
  is_valid boolean not null default true,
  invalidated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.process_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  process_id uuid not null references public.processes(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  movement_type text not null,
  from_status public.process_status,
  to_status public.process_status,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.interdepartmental_dispatches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  process_id uuid not null references public.processes(id) on delete cascade,
  from_department text not null,
  to_department text not null,
  subject text not null,
  due_at timestamptz,
  response text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_guides (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  process_id uuid not null references public.processes(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  guide_number text not null unique,
  municipal_registration text,
  amount numeric(12,2) not null,
  due_date date not null,
  status text not null default 'pendente',
  created_at timestamptz not null default now()
);

alter table if exists public.profiles
  add column if not exists document_masked text,
  add column if not exists deleted_at timestamptz;

alter table if exists public.tenants
  add column if not exists legal_name text,
  add column if not exists display_name text,
  add column if not exists cnpj text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists status public.tenant_status default 'implantacao',
  add column if not exists subdomain text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table if exists public.tenant_branding
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade,
  add column if not exists logo_url text,
  add column if not exists primary_color text default '#0f3557',
  add column if not exists accent_color text default '#178f78',
  add column if not exists hero_title text,
  add column if not exists hero_subtitle text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table if exists public.roles
  add column if not exists code public.platform_role,
  add column if not exists label text;

alter table if exists public.tenant_memberships
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade,
  add column if not exists role_id uuid references public.roles(id),
  add column if not exists department text,
  add column if not exists queue_name text,
  add column if not exists level_name text,
  add column if not exists is_active boolean default true,
  add column if not exists deleted_at timestamptz;

alter table if exists public.properties
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade,
  add column if not exists iptu_code text,
  add column if not exists registry_code text,
  add column if not exists address text,
  add column if not exists lot text,
  add column if not exists block text,
  add column if not exists zone_code text,
  add column if not exists usage_type text,
  add column if not exists area_m2 numeric(12,2),
  add column if not exists created_at timestamptz default now();

alter table if exists public.processes
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade,
  add column if not exists property_id uuid references public.properties(id) on delete set null,
  add column if not exists created_by uuid references auth.users(id) on delete restrict,
  add column if not exists protocol_number text,
  add column if not exists external_protocol_number text,
  add column if not exists title text,
  add column if not exists process_type text,
  add column if not exists current_queue text,
  add column if not exists current_department text,
  add column if not exists archived_at timestamptz;

alter table if exists public.process_parties
  add column if not exists process_id uuid references public.processes(id) on delete cascade,
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade,
  add column if not exists party_type text,
  add column if not exists display_name text,
  add column if not exists document_masked text,
  add column if not exists is_primary boolean default false,
  add column if not exists created_at timestamptz default now();

alter table if exists public.document_templates
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade,
  add column if not exists process_type text,
  add column if not exists code text,
  add column if not exists label text,
  add column if not exists is_required boolean default true;

alter table if exists public.process_documents
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade,
  add column if not exists process_id uuid references public.processes(id) on delete cascade,
  add column if not exists template_id uuid references public.document_templates(id) on delete set null,
  add column if not exists uploaded_by uuid references auth.users(id) on delete restrict,
  add column if not exists title text,
  add column if not exists file_path text,
  add column if not exists file_hash text,
  add column if not exists version integer default 1,
  add column if not exists source text,
  add column if not exists is_required boolean default true,
  add column if not exists is_valid boolean default true,
  add column if not exists invalidated_at timestamptz,
  add column if not exists created_at timestamptz default now();

alter table if exists public.process_movements
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade,
  add column if not exists process_id uuid references public.processes(id) on delete cascade,
  add column if not exists actor_user_id uuid references auth.users(id) on delete set null,
  add column if not exists movement_type text,
  add column if not exists from_status public.process_status,
  add column if not exists to_status public.process_status,
  add column if not exists description text,
  add column if not exists created_at timestamptz default now();

alter table if exists public.interdepartmental_dispatches
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade,
  add column if not exists process_id uuid references public.processes(id) on delete cascade,
  add column if not exists from_department text,
  add column if not exists to_department text,
  add column if not exists subject text,
  add column if not exists due_at timestamptz,
  add column if not exists response text,
  add column if not exists created_by uuid references auth.users(id) on delete restrict,
  add column if not exists created_at timestamptz default now();

alter table if exists public.payment_guides
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade,
  add column if not exists process_id uuid references public.processes(id) on delete cascade,
  add column if not exists property_id uuid references public.properties(id) on delete set null,
  add column if not exists municipal_registration text;

alter table if exists public.signature_blocks
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade,
  add column if not exists process_id uuid references public.processes(id) on delete cascade,
  add column if not exists document_id uuid references public.process_documents(id) on delete cascade,
  add column if not exists title text,
  add column if not exists status public.signature_status default 'pendente',
  add column if not exists evidence jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

alter table if exists public.signatures
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade,
  add column if not exists signature_block_id uuid references public.signature_blocks(id) on delete cascade,
  add column if not exists signer_user_id uuid references auth.users(id) on delete set null,
  add column if not exists signer_name text,
  add column if not exists signer_role text,
  add column if not exists signer_order integer default 1,
  add column if not exists status public.signature_status default 'pendente',
  add column if not exists signed_at timestamptz,
  add column if not exists ip_address inet,
  add column if not exists user_agent text,
  add column if not exists document_hash text;

alter table if exists public.integration_connectors
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade,
  add column if not exists connector_type text,
  add column if not exists display_name text,
  add column if not exists config jsonb default '{}'::jsonb,
  add column if not exists is_active boolean default false,
  add column if not exists created_at timestamptz default now();

alter table if exists public.integration_sync_runs
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade,
  add column if not exists connector_id uuid references public.integration_connectors(id) on delete cascade,
  add column if not exists process_id uuid references public.processes(id) on delete set null,
  add column if not exists status text default 'pending',
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists error_message text,
  add column if not exists created_at timestamptz default now();

alter table if exists public.cms_entries
  add column if not exists slug text,
  add column if not exists title text,
  add column if not exists content jsonb default '{}'::jsonb,
  add column if not exists is_published boolean default false,
  add column if not exists updated_at timestamptz default now();

alter table if exists public.audit_logs
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade,
  add column if not exists actor_user_id uuid references auth.users(id) on delete set null,
  add column if not exists entity_type text,
  add column if not exists entity_id uuid,
  add column if not exists action text,
  add column if not exists details jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

create table if not exists public.signature_blocks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  process_id uuid not null references public.processes(id) on delete cascade,
  document_id uuid references public.process_documents(id) on delete cascade,
  title text not null,
  status public.signature_status not null default 'pendente',
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.signatures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  signature_block_id uuid not null references public.signature_blocks(id) on delete cascade,
  signer_user_id uuid references auth.users(id) on delete set null,
  signer_name text not null,
  signer_role text not null,
  signer_order integer not null default 1,
  status public.signature_status not null default 'pendente',
  signed_at timestamptz,
  ip_address inet,
  user_agent text,
  document_hash text
);

create table if not exists public.integration_connectors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connector_type text not null,
  display_name text not null,
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.integration_sync_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connector_id uuid not null references public.integration_connectors(id) on delete cascade,
  process_id uuid references public.processes(id) on delete set null,
  status text not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.cms_entries (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  content jsonb not null default '{}'::jsonb,
  is_published boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.tenants enable row level security;
alter table public.tenant_branding enable row level security;
alter table public.plans enable row level security;
alter table public.modules_catalog enable row level security;
alter table public.tenant_modules enable row level security;
alter table public.roles enable row level security;
alter table public.profiles enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.properties enable row level security;
alter table public.processes enable row level security;
alter table public.process_parties enable row level security;
alter table public.document_templates enable row level security;
alter table public.process_documents enable row level security;
alter table public.process_movements enable row level security;
alter table public.interdepartmental_dispatches enable row level security;
alter table public.payment_guides enable row level security;
alter table public.signature_blocks enable row level security;
alter table public.signatures enable row level security;
alter table public.integration_connectors enable row level security;
alter table public.integration_sync_runs enable row level security;
alter table public.cms_entries enable row level security;
alter table public.audit_logs enable row level security;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.generate_process_protocol()
returns trigger
language plpgsql
as $$
begin
  if new.protocol_number is null or new.protocol_number = '' then
    new.protocol_number := 'URB-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.process_protocol_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create or replace function public.is_master_user(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_memberships tm
    join public.roles r on r.id = tm.role_id
    where tm.user_id = _user_id
      and tm.deleted_at is null
      and r.code in ('master_admin', 'master_ops')
  );
$$;

create or replace function public.is_tenant_member(_tenant_id uuid, _user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_memberships tm
    where tm.user_id = _user_id
      and tm.tenant_id = _tenant_id
      and tm.is_active = true
      and tm.deleted_at is null
  );
$$;

create or replace function public.has_process_access(_process_id uuid, _user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.processes p
    where p.id = _process_id
      and (
        exists (
          select 1
          from public.tenant_memberships tm
          join public.roles r on r.id = tm.role_id
          where tm.tenant_id = p.tenant_id
            and tm.user_id = _user_id
            and tm.is_active = true
            and tm.deleted_at is null
            and r.code in ('prefeitura_admin', 'prefeitura_supervisor', 'analista', 'financeiro', 'setor_intersetorial', 'fiscal')
        )
        or p.created_by = _user_id
        or exists (
          select 1
          from public.process_parties pp
          where pp.process_id = p.id
            and pp.user_id = _user_id
        )
      )
  );
$$;

drop trigger if exists trg_touch_tenants on public.tenants;
drop trigger if exists trg_touch_branding on public.tenant_branding;
drop trigger if exists trg_touch_profiles on public.profiles;
drop trigger if exists trg_touch_processes on public.processes;
drop trigger if exists trg_touch_cms on public.cms_entries;
drop trigger if exists trg_generate_process_protocol on public.processes;

create trigger trg_touch_tenants before update on public.tenants for each row execute function public.touch_updated_at();
create trigger trg_touch_branding before update on public.tenant_branding for each row execute function public.touch_updated_at();
create trigger trg_touch_profiles before update on public.profiles for each row execute function public.touch_updated_at();
create trigger trg_touch_processes before update on public.processes for each row execute function public.touch_updated_at();
create trigger trg_touch_cms before update on public.cms_entries for each row execute function public.touch_updated_at();
create trigger trg_generate_process_protocol before insert on public.processes for each row execute function public.generate_process_protocol();

drop policy if exists "master manages tenants" on public.tenants;
drop policy if exists "master manages branding" on public.tenant_branding;
drop policy if exists "master manages plans" on public.plans;
drop policy if exists "master manages modules" on public.modules_catalog;
drop policy if exists "master manages tenant modules" on public.tenant_modules;
drop policy if exists "all authenticated read roles" on public.roles;
drop policy if exists "users read own profile" on public.profiles;
drop policy if exists "tenant admins read tenant profiles" on public.profiles;
drop policy if exists "tenant admins manage memberships" on public.tenant_memberships;
drop policy if exists "tenant members read properties" on public.properties;
drop policy if exists "process visibility scoped by tenant and party" on public.processes;
drop policy if exists "qualified users create processes" on public.processes;
drop policy if exists "participants update processes" on public.processes;
drop policy if exists "parties visible with process access" on public.process_parties;
drop policy if exists "templates visible by tenant" on public.document_templates;
drop policy if exists "documents visible with process access" on public.process_documents;
drop policy if exists "participants upload documents" on public.process_documents;
drop policy if exists "movements visible with process access" on public.process_movements;
drop policy if exists "dispatches visible with process access" on public.interdepartmental_dispatches;
drop policy if exists "guides visible with process access" on public.payment_guides;
drop policy if exists "signature blocks visible with process access" on public.signature_blocks;
drop policy if exists "signatures visible with process access" on public.signatures;
drop policy if exists "master and tenant admins manage connectors" on public.integration_connectors;
drop policy if exists "master manages cms" on public.cms_entries;
drop policy if exists "public reads published cms" on public.cms_entries;
drop policy if exists "audit visible to master and tenant admins" on public.audit_logs;

create policy "master manages tenants" on public.tenants for all to authenticated using (public.is_master_user(auth.uid())) with check (public.is_master_user(auth.uid()));
create policy "master manages branding" on public.tenant_branding for all to authenticated using (public.is_master_user(auth.uid())) with check (public.is_master_user(auth.uid()));
create policy "master manages plans" on public.plans for all to authenticated using (public.is_master_user(auth.uid())) with check (public.is_master_user(auth.uid()));
create policy "master manages modules" on public.modules_catalog for all to authenticated using (public.is_master_user(auth.uid())) with check (public.is_master_user(auth.uid()));
create policy "master manages tenant modules" on public.tenant_modules for all to authenticated using (public.is_master_user(auth.uid())) with check (public.is_master_user(auth.uid()));
create policy "all authenticated read roles" on public.roles for select to authenticated using (true);
create policy "users read own profile" on public.profiles for select to authenticated using (user_id = auth.uid());
create policy "tenant admins read tenant profiles" on public.profiles for select to authenticated using (
  exists (
    select 1
    from public.tenant_memberships viewer
    join public.roles viewer_role on viewer_role.id = viewer.role_id
    join public.tenant_memberships target on target.user_id = profiles.user_id
    where viewer.user_id = auth.uid()
      and viewer.tenant_id = target.tenant_id
      and viewer_role.code in ('prefeitura_admin', 'prefeitura_supervisor')
  )
);
create policy "tenant admins manage memberships" on public.tenant_memberships for all to authenticated using (
  public.is_master_user(auth.uid())
  or exists (
    select 1
    from public.tenant_memberships tm
    join public.roles r on r.id = tm.role_id
    where tm.user_id = auth.uid()
      and tm.tenant_id = tenant_memberships.tenant_id
      and r.code = 'prefeitura_admin'
  )
) with check (
  public.is_master_user(auth.uid())
  or exists (
    select 1
    from public.tenant_memberships tm
    join public.roles r on r.id = tm.role_id
    where tm.user_id = auth.uid()
      and tm.tenant_id = tenant_memberships.tenant_id
      and r.code = 'prefeitura_admin'
  )
);
create policy "tenant members read properties" on public.properties for select to authenticated using (public.is_tenant_member(tenant_id));
create policy "process visibility scoped by tenant and party" on public.processes for select to authenticated using (public.has_process_access(id));
create policy "qualified users create processes" on public.processes for insert to authenticated with check (public.is_tenant_member(tenant_id) and created_by = auth.uid());
create policy "participants update processes" on public.processes for update to authenticated using (public.has_process_access(id)) with check (public.has_process_access(id));
create policy "parties visible with process access" on public.process_parties for select to authenticated using (public.has_process_access(process_id));
create policy "templates visible by tenant" on public.document_templates for select to authenticated using (tenant_id is null or public.is_tenant_member(tenant_id));
create policy "documents visible with process access" on public.process_documents for select to authenticated using (public.has_process_access(process_id));
create policy "participants upload documents" on public.process_documents for insert to authenticated with check (public.has_process_access(process_id) and uploaded_by = auth.uid());
create policy "movements visible with process access" on public.process_movements for select to authenticated using (public.has_process_access(process_id));
create policy "dispatches visible with process access" on public.interdepartmental_dispatches for select to authenticated using (public.has_process_access(process_id));
create policy "guides visible with process access" on public.payment_guides for select to authenticated using (public.has_process_access(process_id));
create policy "signature blocks visible with process access" on public.signature_blocks for select to authenticated using (public.has_process_access(process_id));
create policy "signatures visible with process access" on public.signatures for select to authenticated using (
  exists (select 1 from public.signature_blocks sb where sb.id = signatures.signature_block_id and public.has_process_access(sb.process_id))
);
create policy "master and tenant admins manage connectors" on public.integration_connectors for all to authenticated using (
  public.is_master_user(auth.uid()) or exists (
    select 1
    from public.tenant_memberships tm
    join public.roles r on r.id = tm.role_id
    where tm.user_id = auth.uid()
      and tm.tenant_id = integration_connectors.tenant_id
      and r.code = 'prefeitura_admin'
  )
) with check (
  public.is_master_user(auth.uid()) or exists (
    select 1
    from public.tenant_memberships tm
    join public.roles r on r.id = tm.role_id
    where tm.user_id = auth.uid()
      and tm.tenant_id = integration_connectors.tenant_id
      and r.code = 'prefeitura_admin'
  )
);
create policy "master manages cms" on public.cms_entries for all to authenticated using (public.is_master_user(auth.uid())) with check (public.is_master_user(auth.uid()));
create policy "public reads published cms" on public.cms_entries for select to anon using (is_published = true);
create policy "audit visible to master and tenant admins" on public.audit_logs for select to authenticated using (
  public.is_master_user(auth.uid()) or (
    tenant_id is not null and exists (
      select 1
      from public.tenant_memberships tm
      join public.roles r on r.id = tm.role_id
      where tm.user_id = auth.uid()
        and tm.tenant_id = audit_logs.tenant_id
        and r.code in ('prefeitura_admin', 'prefeitura_supervisor')
    )
  )
);

insert into public.roles (code, label) values
  ('master_admin', 'Administrador Master'),
  ('master_ops', 'Operacao Master'),
  ('prefeitura_admin', 'Administrador da Prefeitura'),
  ('prefeitura_supervisor', 'Supervisor da Prefeitura'),
  ('analista', 'Analista Tecnico'),
  ('financeiro', 'Financeiro'),
  ('setor_intersetorial', 'Setor Intersetorial'),
  ('fiscal', 'Fiscal'),
  ('profissional_externo', 'Profissional Externo'),
  ('proprietario_consulta', 'Proprietario para Consulta')
on conflict (code) do nothing;

insert into public.modules_catalog (code, name, default_enabled) values
  ('protocol', 'Protocolo', true),
  ('analysis', 'Analise tecnica', true),
  ('financial', 'Financeiro', false),
  ('signature', 'Assinatura eletronica', false),
  ('dispatch', 'Despacho intersetorial', false),
  ('integrations', 'Integracoes', false),
  ('portal', 'Portal externo', true),
  ('bi', 'BI', false)
on conflict (code) do nothing;

insert into public.plans (name, code, is_enabled, description) values
  ('Starter Governo', 'starter-governo', false, 'Plano inicial para pequenas operacoes'),
  ('Growth Governo', 'growth-governo', false, 'Fluxo completo com financeiro e despacho'),
  ('Enterprise Governo', 'enterprise-governo', false, 'Operacao robusta com branding e integracoes')
on conflict (code) do nothing;
