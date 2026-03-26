-- Stage 1: multi-prefeitura foundation without breaking the existing tenant-based project
-- Compatibility strategy:
-- 1. keep public.tenants / tenant_branding / tenant_settings working as-is
-- 2. introduce municipality-scoped tables with municipality_id
-- 3. backfill from the current tenant model
-- 4. sync tenant writes into municipality tables during the transition

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'account_status_code'
  ) then
    create type public.account_status_code as enum ('active', 'blocked', 'inactive', 'pending');
  end if;
end $$;

alter type public.platform_role add value if not exists 'admin_master';
alter type public.platform_role add value if not exists 'admin_municipality';
alter type public.platform_role add value if not exists 'professional_external';
alter type public.platform_role add value if not exists 'analyst';
alter type public.platform_role add value if not exists 'financial';
alter type public.platform_role add value if not exists 'counter_service';
alter type public.platform_role add value if not exists 'topography';
alter type public.platform_role add value if not exists 'expedient';

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.municipalities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid unique references public.tenants(id) on delete set null,
  official_name text not null,
  display_name text not null,
  cnpj text,
  city text not null,
  state text not null,
  status public.tenant_status not null default 'implantacao',
  subdomain text,
  contact_email text,
  contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.municipality_branding (
  municipality_id uuid primary key references public.municipalities(id) on delete cascade,
  logo_url text,
  coat_of_arms_url text,
  flag_url text,
  primary_color text not null default '#0f3557',
  accent_color text not null default '#178f78',
  official_header_text text,
  official_footer_text text,
  portal_title text,
  portal_subtitle text,
  pdf_header_template text,
  pdf_footer_template text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.municipality_settings (
  municipality_id uuid primary key references public.municipalities(id) on delete cascade,
  secretariat_name text,
  office_hours text,
  public_portal_url text,
  protocol_prefix text,
  guide_prefix text,
  pix_key text,
  settlement_beneficiary text,
  signature_mode text default 'eletronica',
  require_professional_registration boolean not null default true,
  allow_digital_protocol boolean not null default true,
  allow_walkin_protocol boolean not null default false,
  timezone text not null default 'America/Sao_Paulo',
  locale text not null default 'pt-BR',
  general_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  email text,
  phone text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (municipality_id, code),
  unique (municipality_id, name)
);

alter table if exists public.profiles
  add column if not exists municipality_id uuid references public.municipalities(id) on delete set null,
  add column if not exists role_id uuid references public.roles(id) on delete set null,
  add column if not exists department_id uuid references public.departments(id) on delete set null,
  add column if not exists phone text,
  add column if not exists avatar_url text,
  add column if not exists professional_registration text,
  add column if not exists account_status public.account_status_code not null default 'active',
  add column if not exists blocked_at timestamptz,
  add column if not exists blocked_by uuid references auth.users(id) on delete set null,
  add column if not exists block_reason text;

create index if not exists idx_municipalities_tenant_id on public.municipalities (tenant_id);
create index if not exists idx_municipalities_status on public.municipalities (status);
create index if not exists idx_municipalities_subdomain on public.municipalities (subdomain);
create index if not exists idx_departments_municipality on public.departments (municipality_id, is_active);
create index if not exists idx_profiles_municipality on public.profiles (municipality_id);
create index if not exists idx_profiles_role_id on public.profiles (role_id);
create index if not exists idx_profiles_department_id on public.profiles (department_id);
create index if not exists idx_profiles_account_status on public.profiles (account_status);

drop trigger if exists trg_touch_municipalities on public.municipalities;
create trigger trg_touch_municipalities
before update on public.municipalities
for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_municipality_branding on public.municipality_branding;
create trigger trg_touch_municipality_branding
before update on public.municipality_branding
for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_municipality_settings on public.municipality_settings;
create trigger trg_touch_municipality_settings
before update on public.municipality_settings
for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_departments on public.departments;
create trigger trg_touch_departments
before update on public.departments
for each row execute function public.touch_updated_at();

insert into public.roles (code, label)
select seed.code, seed.label
from (
  values
    ('admin_master'::public.platform_role, 'Administrador Master'),
    ('admin_municipality'::public.platform_role, 'Administrador da Prefeitura'),
    ('professional_external'::public.platform_role, 'Profissional Externo'),
    ('analyst'::public.platform_role, 'Analista'),
    ('fiscal'::public.platform_role, 'Fiscal'),
    ('financial'::public.platform_role, 'Financeiro'),
    ('counter_service'::public.platform_role, 'Atendimento / Balcao'),
    ('topography'::public.platform_role, 'Topografia'),
    ('expedient'::public.platform_role, 'Expediente')
) as seed(code, label)
where not exists (
  select 1
  from public.roles r
  where r.code = seed.code
);

insert into public.municipalities (
  id,
  tenant_id,
  official_name,
  display_name,
  cnpj,
  city,
  state,
  status,
  subdomain,
  contact_email,
  contact_phone,
  created_at,
  updated_at
)
select
  t.id,
  t.id,
  t.legal_name,
  t.display_name,
  t.cnpj,
  t.city,
  t.state,
  t.status,
  t.subdomain,
  ts.email,
  ts.telefone,
  t.created_at,
  t.updated_at
from public.tenants t
left join public.tenant_settings ts on ts.tenant_id = t.id
on conflict (id) do update
set
  tenant_id = excluded.tenant_id,
  official_name = excluded.official_name,
  display_name = excluded.display_name,
  cnpj = excluded.cnpj,
  city = excluded.city,
  state = excluded.state,
  status = excluded.status,
  subdomain = excluded.subdomain,
  contact_email = excluded.contact_email,
  contact_phone = excluded.contact_phone,
  updated_at = now();

insert into public.municipality_branding (
  municipality_id,
  logo_url,
  coat_of_arms_url,
  flag_url,
  primary_color,
  accent_color,
  official_header_text,
  official_footer_text,
  portal_title,
  portal_subtitle,
  created_at,
  updated_at
)
select
  m.id,
  coalesce(tb.logo_url, ts.logo_url),
  ts.brasao_url,
  ts.bandeira_url,
  coalesce(tb.primary_color, '#0f3557'),
  coalesce(tb.accent_color, '#178f78'),
  ts.secretaria_responsavel,
  ts.resumo_plano_diretor,
  tb.hero_title,
  coalesce(tb.hero_subtitle, ts.resumo_uso_solo),
  coalesce(tb.created_at, now()),
  greatest(coalesce(tb.updated_at, now()), coalesce(ts.updated_at, now()))
from public.municipalities m
left join public.tenant_branding tb on tb.tenant_id = m.tenant_id
left join public.tenant_settings ts on ts.tenant_id = m.tenant_id
on conflict (municipality_id) do update
set
  logo_url = excluded.logo_url,
  coat_of_arms_url = excluded.coat_of_arms_url,
  flag_url = excluded.flag_url,
  primary_color = excluded.primary_color,
  accent_color = excluded.accent_color,
  official_header_text = excluded.official_header_text,
  official_footer_text = excluded.official_footer_text,
  portal_title = excluded.portal_title,
  portal_subtitle = excluded.portal_subtitle,
  updated_at = now();

insert into public.municipality_settings (
  municipality_id,
  secretariat_name,
  office_hours,
  public_portal_url,
  protocol_prefix,
  guide_prefix,
  pix_key,
  settlement_beneficiary,
  signature_mode,
  require_professional_registration,
  general_settings,
  created_at,
  updated_at
)
select
  m.id,
  ts.secretaria_responsavel,
  ts.horario_atendimento,
  ts.link_portal_cliente,
  ts.protocolo_prefixo,
  ts.guia_prefixo,
  ts.chave_pix,
  ts.beneficiario_arrecadacao,
  ts.signature_mode,
  coalesce(ts.registro_profissional_obrigatorio, true),
  jsonb_strip_nulls(
    jsonb_build_object(
      'cnpj', ts.cnpj,
      'endereco', ts.endereco,
      'email', ts.email,
      'telefone', ts.telefone,
      'site', ts.site,
      'resumo_plano_diretor', ts.resumo_plano_diretor,
      'resumo_uso_solo', ts.resumo_uso_solo,
      'leis_complementares', ts.leis_complementares,
      'beneficiario_arrecadacao', ts.beneficiario_arrecadacao,
      'taxa_protocolo', ts.taxa_protocolo,
      'taxa_iss_por_metro_quadrado', ts.taxa_iss_por_metro_quadrado,
      'taxa_aprovacao_final', ts.taxa_aprovacao_final
    )
  ),
  now(),
  coalesce(ts.updated_at, now())
from public.municipalities m
left join public.tenant_settings ts on ts.tenant_id = m.tenant_id
on conflict (municipality_id) do update
set
  secretariat_name = excluded.secretariat_name,
  office_hours = excluded.office_hours,
  public_portal_url = excluded.public_portal_url,
  protocol_prefix = excluded.protocol_prefix,
  guide_prefix = excluded.guide_prefix,
  pix_key = excluded.pix_key,
  settlement_beneficiary = excluded.settlement_beneficiary,
  signature_mode = excluded.signature_mode,
  require_professional_registration = excluded.require_professional_registration,
  general_settings = excluded.general_settings,
  updated_at = now();

insert into public.departments (
  municipality_id,
  code,
  name,
  is_active
)
select distinct
  tm.tenant_id,
  lower(regexp_replace(coalesce(tm.department, 'geral'), '[^a-zA-Z0-9]+', '_', 'g')),
  coalesce(tm.department, 'Geral'),
  true
from public.tenant_memberships tm
where tm.department is not null
  and tm.department <> ''
on conflict (municipality_id, name) do update
set
  code = excluded.code,
  is_active = true,
  updated_at = now();

with membership_scope as (
  select distinct on (tm.user_id)
    tm.user_id,
    tm.tenant_id as municipality_id,
    tm.role_id,
    tm.department,
    tm.account_status,
    tm.blocked_at,
    tm.blocked_by,
    tm.block_reason
  from public.tenant_memberships tm
  where tm.deleted_at is null
  order by tm.user_id, tm.is_active desc, tm.created_at asc nulls last
)
update public.profiles p
set
  municipality_id = ms.municipality_id,
  role_id = coalesce(p.role_id, ms.role_id),
  department_id = d.id,
  account_status = case
    when ms.account_status in ('active', 'blocked', 'inactive', 'pending') then ms.account_status::public.account_status_code
    else p.account_status
  end,
  blocked_at = coalesce(ms.blocked_at, p.blocked_at),
  blocked_by = coalesce(ms.blocked_by, p.blocked_by),
  block_reason = coalesce(ms.block_reason, p.block_reason)
from membership_scope ms
left join public.departments d
  on d.municipality_id = ms.municipality_id
 and d.name = ms.department
where p.user_id = ms.user_id;

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
  limit 1;
$$;

create or replace function public.current_municipality_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.municipality_id
      from public.profiles p
      where p.user_id = auth.uid()
        and p.deleted_at is null
        and p.municipality_id is not null
      limit 1
    ),
    (
      select tm.tenant_id
      from public.tenant_memberships tm
      where tm.user_id = auth.uid()
        and tm.deleted_at is null
        and coalesce(tm.is_active, true) = true
      order by tm.created_at asc nulls last
      limit 1
    )
  );
$$;

create or replace function public.current_role_code()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select r.code::text
      from public.profiles p
      join public.roles r on r.id = p.role_id
      where p.user_id = auth.uid()
        and p.deleted_at is null
      limit 1
    ),
    (
      select r.code::text
      from public.tenant_memberships tm
      join public.roles r on r.id = tm.role_id
      where tm.user_id = auth.uid()
        and tm.deleted_at is null
        and coalesce(tm.is_active, true) = true
      order by tm.created_at asc nulls last
      limit 1
    )
  );
$$;

create or replace function public.is_admin_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role_code() in ('admin_master', 'master_admin', 'master_ops');
$$;

create or replace function public.is_municipality_admin(_municipality_id uuid default public.current_municipality_id())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.user_id = auth.uid()
      and p.deleted_at is null
      and p.municipality_id = _municipality_id
      and r.code in ('admin_municipality', 'prefeitura_admin')
  )
  or exists (
    select 1
    from public.tenant_memberships tm
    join public.roles r on r.id = tm.role_id
    where tm.user_id = auth.uid()
      and tm.deleted_at is null
      and coalesce(tm.is_active, true) = true
      and tm.tenant_id = _municipality_id
      and r.code in ('admin_municipality', 'prefeitura_admin')
  );
$$;

create or replace function public.sync_tenant_to_municipality()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.municipalities (
    id,
    tenant_id,
    official_name,
    display_name,
    cnpj,
    city,
    state,
    status,
    subdomain,
    created_at,
    updated_at
  )
  values (
    new.id,
    new.id,
    new.legal_name,
    new.display_name,
    new.cnpj,
    new.city,
    new.state,
    new.status,
    new.subdomain,
    coalesce(new.created_at, now()),
    coalesce(new.updated_at, now())
  )
  on conflict (id) do update
  set
    official_name = excluded.official_name,
    display_name = excluded.display_name,
    cnpj = excluded.cnpj,
    city = excluded.city,
    state = excluded.state,
    status = excluded.status,
    subdomain = excluded.subdomain,
    updated_at = now();

  return new;
end;
$$;

create or replace function public.sync_tenant_branding_to_municipality_branding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.municipality_branding (
    municipality_id,
    logo_url,
    primary_color,
    accent_color,
    portal_title,
    portal_subtitle,
    created_at,
    updated_at
  )
  values (
    new.tenant_id,
    new.logo_url,
    new.primary_color,
    new.accent_color,
    new.hero_title,
    new.hero_subtitle,
    coalesce(new.created_at, now()),
    coalesce(new.updated_at, now())
  )
  on conflict (municipality_id) do update
  set
    logo_url = excluded.logo_url,
    primary_color = excluded.primary_color,
    accent_color = excluded.accent_color,
    portal_title = excluded.portal_title,
    portal_subtitle = excluded.portal_subtitle,
    updated_at = now();

  return new;
end;
$$;

create or replace function public.sync_tenant_settings_to_municipality_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.municipality_settings (
    municipality_id,
    secretariat_name,
    office_hours,
    public_portal_url,
    protocol_prefix,
    guide_prefix,
    pix_key,
    settlement_beneficiary,
    signature_mode,
    require_professional_registration,
    general_settings,
    updated_at
  )
  values (
    new.tenant_id,
    new.secretaria_responsavel,
    new.horario_atendimento,
    new.link_portal_cliente,
    new.protocolo_prefixo,
    new.guia_prefixo,
    new.chave_pix,
    new.beneficiario_arrecadacao,
    new.signature_mode,
    coalesce(new.registro_profissional_obrigatorio, true),
    jsonb_strip_nulls(
      jsonb_build_object(
        'cnpj', new.cnpj,
        'endereco', new.endereco,
        'email', new.email,
        'telefone', new.telefone,
        'site', new.site,
        'resumo_plano_diretor', new.resumo_plano_diretor,
        'resumo_uso_solo', new.resumo_uso_solo,
        'leis_complementares', new.leis_complementares,
        'taxa_protocolo', new.taxa_protocolo,
        'taxa_iss_por_metro_quadrado', new.taxa_iss_por_metro_quadrado,
        'taxa_aprovacao_final', new.taxa_aprovacao_final
      )
    ),
    now()
  )
  on conflict (municipality_id) do update
  set
    secretariat_name = excluded.secretariat_name,
    office_hours = excluded.office_hours,
    public_portal_url = excluded.public_portal_url,
    protocol_prefix = excluded.protocol_prefix,
    guide_prefix = excluded.guide_prefix,
    pix_key = excluded.pix_key,
    settlement_beneficiary = excluded.settlement_beneficiary,
    signature_mode = excluded.signature_mode,
    require_professional_registration = excluded.require_professional_registration,
    general_settings = excluded.general_settings,
    updated_at = now();

  insert into public.municipality_branding (
    municipality_id,
    logo_url,
    coat_of_arms_url,
    flag_url,
    official_header_text,
    official_footer_text,
    updated_at
  )
  values (
    new.tenant_id,
    new.logo_url,
    new.brasao_url,
    new.bandeira_url,
    new.secretaria_responsavel,
    new.resumo_plano_diretor,
    now()
  )
  on conflict (municipality_id) do update
  set
    logo_url = coalesce(excluded.logo_url, public.municipality_branding.logo_url),
    coat_of_arms_url = excluded.coat_of_arms_url,
    flag_url = excluded.flag_url,
    official_header_text = excluded.official_header_text,
    official_footer_text = excluded.official_footer_text,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_sync_tenant_to_municipality on public.tenants;
create trigger trg_sync_tenant_to_municipality
after insert or update on public.tenants
for each row execute function public.sync_tenant_to_municipality();

drop trigger if exists trg_sync_tenant_branding_to_municipality_branding on public.tenant_branding;
create trigger trg_sync_tenant_branding_to_municipality_branding
after insert or update on public.tenant_branding
for each row execute function public.sync_tenant_branding_to_municipality_branding();

drop trigger if exists trg_sync_tenant_settings_to_municipality_scope on public.tenant_settings;
create trigger trg_sync_tenant_settings_to_municipality_scope
after insert or update on public.tenant_settings
for each row execute function public.sync_tenant_settings_to_municipality_scope();

alter table public.municipalities enable row level security;
alter table public.municipality_branding enable row level security;
alter table public.municipality_settings enable row level security;
alter table public.departments enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "municipality members read municipalities" on public.municipalities;
create policy "municipality members read municipalities"
on public.municipalities
for select
to authenticated
using (
  public.is_admin_master()
  or id = public.current_municipality_id()
);

drop policy if exists "municipality admins manage municipalities" on public.municipalities;
create policy "municipality admins manage municipalities"
on public.municipalities
for all
to authenticated
using (
  public.is_admin_master()
  or public.is_municipality_admin(id)
)
with check (
  public.is_admin_master()
  or public.is_municipality_admin(id)
);

drop policy if exists "municipality members read branding" on public.municipality_branding;
create policy "municipality members read branding"
on public.municipality_branding
for select
to authenticated
using (
  public.is_admin_master()
  or municipality_id = public.current_municipality_id()
);

drop policy if exists "municipality admins manage branding" on public.municipality_branding;
create policy "municipality admins manage branding"
on public.municipality_branding
for all
to authenticated
using (
  public.is_admin_master()
  or public.is_municipality_admin(municipality_id)
)
with check (
  public.is_admin_master()
  or public.is_municipality_admin(municipality_id)
);

drop policy if exists "municipality members read settings" on public.municipality_settings;
create policy "municipality members read settings"
on public.municipality_settings
for select
to authenticated
using (
  public.is_admin_master()
  or municipality_id = public.current_municipality_id()
);

drop policy if exists "municipality admins manage settings" on public.municipality_settings;
create policy "municipality admins manage settings"
on public.municipality_settings
for all
to authenticated
using (
  public.is_admin_master()
  or public.is_municipality_admin(municipality_id)
)
with check (
  public.is_admin_master()
  or public.is_municipality_admin(municipality_id)
);

drop policy if exists "municipality members read departments" on public.departments;
create policy "municipality members read departments"
on public.departments
for select
to authenticated
using (
  public.is_admin_master()
  or municipality_id = public.current_municipality_id()
);

drop policy if exists "municipality admins manage departments" on public.departments;
create policy "municipality admins manage departments"
on public.departments
for all
to authenticated
using (
  public.is_admin_master()
  or public.is_municipality_admin(municipality_id)
)
with check (
  public.is_admin_master()
  or public.is_municipality_admin(municipality_id)
);

drop policy if exists "municipality scoped profile read" on public.profiles;
create policy "municipality scoped profile read"
on public.profiles
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin_master()
  or (
    municipality_id is not null
    and municipality_id = public.current_municipality_id()
  )
);

drop policy if exists "admins manage municipality profiles" on public.profiles;
create policy "admins manage municipality profiles"
on public.profiles
for update
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin_master()
  or (
    municipality_id is not null
    and municipality_id = public.current_municipality_id()
    and public.is_municipality_admin(municipality_id)
  )
)
with check (
  user_id = auth.uid()
  or public.is_admin_master()
  or (
    municipality_id is not null
    and municipality_id = public.current_municipality_id()
    and public.is_municipality_admin(municipality_id)
  )
);

drop policy if exists "admins insert municipality profiles" on public.profiles;
create policy "admins insert municipality profiles"
on public.profiles
for insert
to authenticated
with check (
  user_id = auth.uid()
  or public.is_admin_master()
  or (
    municipality_id is not null
    and municipality_id = public.current_municipality_id()
    and public.is_municipality_admin(municipality_id)
  )
);
