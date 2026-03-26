-- UrbanFlow Gov rebuild baseline

drop table if exists public.analysis_items cascade;
drop table if exists public.checklist_templates cascade;
drop table if exists public.notifications cascade;
drop table if exists public.project_history cascade;
drop table if exists public.project_analysis cascade;
drop table if exists public.payment_guides cascade;
drop table if exists public.project_documents cascade;
drop table if exists public.projects cascade;
drop table if exists public.user_roles cascade;
drop table if exists public.prefeituras cascade;
drop table if exists public.profiles cascade;
drop type if exists public.payment_status cascade;
drop type if exists public.project_status cascade;
drop type if exists public.app_role cascade;

create extension if not exists "pgcrypto";

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

create type public.signature_status as enum ('pendente', 'concluido', 'invalidado');
create type public.tenant_status as enum ('implantacao', 'ativo', 'suspenso', 'encerrado');

create table public.tenants (
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

create table public.tenant_branding (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  logo_url text,
  primary_color text not null default '#0f3557',
  accent_color text not null default '#178f78',
  hero_title text,
  hero_subtitle text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null unique,
  is_enabled boolean not null default false,
  description text
);

create table public.modules_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  default_enabled boolean not null default false
);

create table public.tenant_modules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_id uuid not null references public.modules_catalog(id) on delete cascade,
  is_enabled boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  unique (tenant_id, module_id)
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  code public.platform_role not null unique,
  label text not null
);

create table public.profiles (
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

create table public.tenant_memberships (
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

create table public.properties (
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

create table public.processes (
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

create table public.process_parties (
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

create table public.document_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  process_type text not null,
  code text not null,
  label text not null,
  is_required boolean not null default true
);

create table public.process_documents (
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

create table public.process_movements (
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

create table public.interdepartmental_dispatches (
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

create table public.payment_guides (
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

create table public.signature_blocks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  process_id uuid not null references public.processes(id) on delete cascade,
  document_id uuid references public.process_documents(id) on delete cascade,
  title text not null,
  status public.signature_status not null default 'pendente',
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.signatures (
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

create table public.integration_connectors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connector_type text not null,
  display_name text not null,
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.integration_sync_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connector_id uuid not null references public.integration_connectors(id) on delete cascade,
  process_id uuid references public.processes(id) on delete set null,
  status text not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create table public.cms_entries (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  content jsonb not null default '{}'::jsonb,
  is_published boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
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

create trigger trg_touch_tenants before update on public.tenants for each row execute function public.touch_updated_at();
create trigger trg_touch_branding before update on public.tenant_branding for each row execute function public.touch_updated_at();
create trigger trg_touch_profiles before update on public.profiles for each row execute function public.touch_updated_at();
create trigger trg_touch_processes before update on public.processes for each row execute function public.touch_updated_at();
create trigger trg_touch_cms before update on public.cms_entries for each row execute function public.touch_updated_at();
create trigger trg_generate_process_protocol before insert on public.processes for each row execute function public.generate_process_protocol();

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
  ('master_ops', 'Operação Master'),
  ('prefeitura_admin', 'Administrador da Prefeitura'),
  ('prefeitura_supervisor', 'Supervisor da Prefeitura'),
  ('analista', 'Analista Técnico'),
  ('financeiro', 'Financeiro'),
  ('setor_intersetorial', 'Setor Intersetorial'),
  ('fiscal', 'Fiscal'),
  ('profissional_externo', 'Profissional Externo'),
  ('proprietario_consulta', 'Proprietário para Consulta');

insert into public.modules_catalog (code, name, default_enabled) values
  ('protocol', 'Protocolo', true),
  ('analysis', 'Análise técnica', true),
  ('financial', 'Financeiro', false),
  ('signature', 'Assinatura eletrônica', false),
  ('dispatch', 'Despacho intersetorial', false),
  ('integrations', 'Integrações', false),
  ('portal', 'Portal externo', true),
  ('bi', 'BI', false);

insert into public.plans (name, code, is_enabled, description) values
  ('Starter Governo', 'starter-governo', false, 'Plano inicial para pequenas operações'),
  ('Growth Governo', 'growth-governo', false, 'Fluxo completo com financeiro e despacho'),
  ('Enterprise Governo', 'enterprise-governo', false, 'Operação robusta com branding e integrações');
