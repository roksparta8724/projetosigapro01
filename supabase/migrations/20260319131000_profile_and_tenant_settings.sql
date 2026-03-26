create table if not exists public.tenant_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  cnpj text,
  endereco text,
  telefone text,
  email text,
  site text,
  secretaria_responsavel text,
  horario_atendimento text,
  brasao_url text,
  bandeira_url text,
  logo_url text,
  imagem_hero_url text,
  resumo_plano_diretor text,
  resumo_uso_solo text,
  leis_complementares text,
  link_portal_cliente text,
  protocolo_prefixo text,
  guia_prefixo text,
  chave_pix text,
  beneficiario_arrecadacao text,
  contract_number text,
  contract_start date,
  contract_end date,
  monthly_fee numeric(12,2) default 0,
  setup_fee numeric(12,2) default 0,
  signature_mode text default 'eletronica',
  client_delivery_link text,
  plano_diretor_arquivo_nome text,
  plano_diretor_arquivo_url text,
  uso_solo_arquivo_nome text,
  uso_solo_arquivo_url text,
  leis_arquivo_nome text,
  leis_arquivo_url text,
  logo_scale numeric(8,2) default 1,
  logo_offset_x integer default 0,
  logo_offset_y integer default 0,
  taxa_protocolo numeric(12,2) default 35.24,
  taxa_iss_por_metro_quadrado numeric(12,2) default 0,
  taxa_aprovacao_final numeric(12,2) default 0,
  registro_profissional_obrigatorio boolean default true,
  updated_at timestamptz not null default now()
);

alter table public.tenant_settings enable row level security;

drop policy if exists "tenant members read tenant settings" on public.tenant_settings;
create policy "tenant members read tenant settings"
on public.tenant_settings
for select
to authenticated
using (
  public.is_master_user(auth.uid())
  or exists (
    select 1
    from public.tenant_memberships tm
    where tm.user_id = auth.uid()
      and tm.tenant_id = tenant_settings.tenant_id
      and tm.is_active = true
      and tm.deleted_at is null
  )
);

drop policy if exists "master manages tenant settings" on public.tenant_settings;
create policy "master manages tenant settings"
on public.tenant_settings
for all
to authenticated
using (
  public.is_master_user(auth.uid())
  or exists (
    select 1
    from public.tenant_memberships tm
    join public.roles r on r.id = tm.role_id
    where tm.user_id = auth.uid()
      and tm.tenant_id = tenant_settings.tenant_id
      and tm.is_active = true
      and tm.deleted_at is null
      and r.code = 'prefeitura_admin'
  )
)
with check (
  public.is_master_user(auth.uid())
  or exists (
    select 1
    from public.tenant_memberships tm
    join public.roles r on r.id = tm.role_id
    where tm.user_id = auth.uid()
      and tm.tenant_id = tenant_settings.tenant_id
      and tm.is_active = true
      and tm.deleted_at is null
      and r.code = 'prefeitura_admin'
  )
);

drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile"
on public.profiles
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
on public.profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
