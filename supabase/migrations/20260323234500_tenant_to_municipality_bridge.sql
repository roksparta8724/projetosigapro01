create extension if not exists "pgcrypto";

create or replace function public.legacy_tenant_status_to_municipality_status(_status text)
returns text
language sql
immutable
as $$
  select case coalesce(_status, '')
    when 'ativo' then 'active'
    when 'implantacao' then 'implementation'
    when 'suspenso' then 'inactive'
    when 'encerrado' then 'blocked'
    else 'active'
  end
$$;

create or replace function public.sync_municipality_from_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.municipalities (
    id,
    name,
    state,
    slug,
    subdomain,
    status,
    created_at,
    updated_at
  )
  values (
    new.id,
    coalesce(nullif(new.display_name, ''), new.legal_name),
    new.state,
    lower(
      regexp_replace(
        trim(both '-' from regexp_replace(coalesce(new.subdomain, new.city, new.display_name, new.legal_name, ''), '[^a-zA-Z0-9]+', '-', 'g')),
        '-+',
        '-',
        'g'
      )
    ),
    nullif(new.subdomain, ''),
    public.legacy_tenant_status_to_municipality_status(new.status::text),
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do update
  set
    name = excluded.name,
    state = excluded.state,
    slug = coalesce(public.municipalities.slug, excluded.slug),
    subdomain = coalesce(excluded.subdomain, public.municipalities.subdomain),
    status = excluded.status,
    updated_at = now();

  return new;
end;
$$;

create or replace function public.sync_municipality_branding_from_legacy()
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
    official_header_text,
    official_footer_text,
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
    now()
  )
  on conflict (municipality_id) do update
  set
    logo_url = coalesce(excluded.logo_url, public.municipality_branding.logo_url),
    primary_color = coalesce(excluded.primary_color, public.municipality_branding.primary_color),
    accent_color = coalesce(excluded.accent_color, public.municipality_branding.accent_color),
    official_header_text = coalesce(excluded.official_header_text, public.municipality_branding.official_header_text),
    official_footer_text = coalesce(excluded.official_footer_text, public.municipality_branding.official_footer_text),
    updated_at = now();

  return new;
end;
$$;

create or replace function public.sync_municipality_settings_from_legacy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _general_settings jsonb;
begin
  _general_settings := jsonb_strip_nulls(
    jsonb_build_object(
      'cnpj', new.cnpj,
      'site', new.site,
      'secretaria_responsavel', new.secretaria_responsavel,
      'horario_atendimento', new.horario_atendimento,
      'brasao_url', new.brasao_url,
      'bandeira_url', new.bandeira_url,
      'logo_url', new.logo_url,
      'imagem_hero_url', new.imagem_hero_url,
      'resumo_plano_diretor', new.resumo_plano_diretor,
      'resumo_uso_solo', new.resumo_uso_solo,
      'leis_complementares', new.leis_complementares,
      'link_portal_cliente', new.link_portal_cliente,
      'chave_pix', new.chave_pix,
      'beneficiario_arrecadacao', new.beneficiario_arrecadacao,
      'contract_number', new.contract_number,
      'contract_start', new.contract_start,
      'contract_end', new.contract_end,
      'monthly_fee', new.monthly_fee,
      'setup_fee', new.setup_fee,
      'signature_mode', new.signature_mode,
      'client_delivery_link', new.client_delivery_link,
      'plano_diretor_arquivo_nome', new.plano_diretor_arquivo_nome,
      'plano_diretor_arquivo_url', new.plano_diretor_arquivo_url,
      'uso_solo_arquivo_nome', new.uso_solo_arquivo_nome,
      'uso_solo_arquivo_url', new.uso_solo_arquivo_url,
      'leis_arquivo_nome', new.leis_arquivo_nome,
      'leis_arquivo_url', new.leis_arquivo_url,
      'taxa_protocolo', new.taxa_protocolo,
      'taxa_iss_por_metro_quadrado', new.taxa_iss_por_metro_quadrado,
      'taxa_aprovacao_final', new.taxa_aprovacao_final,
      'logo_scale', new.logo_scale,
      'logo_offset_x', new.logo_offset_x,
      'logo_offset_y', new.logo_offset_y
    )
  );

  if to_regclass('public.tenant_modules') is not null then
    _general_settings := _general_settings || jsonb_build_object(
      'legacy_modules_enabled',
      (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'module_id', tm.module_id,
              'is_enabled', tm.is_enabled,
              'settings', tm.settings
            )
            order by tm.module_id
          ),
          '[]'::jsonb
        )
        from public.tenant_modules tm
        where tm.tenant_id = new.tenant_id
      )
    );
  end if;

  insert into public.municipalities (
    id,
    name,
    slug,
    status,
    created_at,
    updated_at
  )
  values (
    new.tenant_id,
    coalesce(new.secretaria_responsavel, 'Prefeitura'),
    lower(
      regexp_replace(
        trim(both '-' from regexp_replace(coalesce(new.tenant_id::text, ''), '[^a-zA-Z0-9]+', '-', 'g')),
        '-+',
        '-',
        'g'
      )
    ),
    'active',
    now(),
    now()
  )
  on conflict (id) do update
  set
    secretariat_name = coalesce(new.secretaria_responsavel, public.municipalities.secretariat_name),
    email = coalesce(new.email, public.municipalities.email),
    phone = coalesce(new.telefone, public.municipalities.phone),
    address = coalesce(new.endereco, public.municipalities.address),
    custom_domain = coalesce(new.site, public.municipalities.custom_domain),
    updated_at = now();

  insert into public.municipality_settings (
    municipality_id,
    protocol_prefix,
    guide_prefix,
    require_professional_registration,
    allow_digital_protocol,
    allow_walkin_protocol,
    general_settings,
    created_at,
    updated_at
  )
  values (
    new.tenant_id,
    new.protocolo_prefixo,
    new.guia_prefixo,
    coalesce(new.registro_profissional_obrigatorio, true),
    true,
    false,
    _general_settings,
    now(),
    now()
  )
  on conflict (municipality_id) do update
  set
    protocol_prefix = coalesce(excluded.protocol_prefix, public.municipality_settings.protocol_prefix),
    guide_prefix = coalesce(excluded.guide_prefix, public.municipality_settings.guide_prefix),
    require_professional_registration = excluded.require_professional_registration,
    general_settings = public.municipality_settings.general_settings || excluded.general_settings,
    updated_at = now();

  insert into public.municipality_branding (
    municipality_id,
    logo_url,
    coat_of_arms_url,
    official_header_text,
    official_footer_text,
    created_at,
    updated_at
  )
  values (
    new.tenant_id,
    new.logo_url,
    new.brasao_url,
    new.secretaria_responsavel,
    new.resumo_plano_diretor,
    now(),
    now()
  )
  on conflict (municipality_id) do update
  set
    logo_url = coalesce(excluded.logo_url, public.municipality_branding.logo_url),
    coat_of_arms_url = coalesce(excluded.coat_of_arms_url, public.municipality_branding.coat_of_arms_url),
    official_header_text = coalesce(excluded.official_header_text, public.municipality_branding.official_header_text),
    official_footer_text = coalesce(excluded.official_footer_text, public.municipality_branding.official_footer_text),
    updated_at = now();

  return new;
end;
$$;

create or replace function public.sync_profile_municipality_from_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _role_code text;
  _department_id uuid;
begin
  if new.deleted_at is not null or coalesce(new.is_active, true) = false then
    return new;
  end if;

  select r.code
    into _role_code
    from public.roles r
   where r.id = new.role_id
   limit 1;

  if nullif(coalesce(new.department, ''), '') is not null then
    insert into public.departments (
      municipality_id,
      code,
      name,
      description,
      is_active,
      created_at,
      updated_at
    )
    values (
      new.tenant_id,
      lower(
        regexp_replace(
          trim(both '-' from regexp_replace(new.department, '[^a-zA-Z0-9]+', '-', 'g')),
          '-+',
          '-',
          'g'
        )
      ),
      new.department,
      'Importado da estrutura tenant_memberships',
      true,
      now(),
      now()
    )
    on conflict (municipality_id, name) do update
    set
      is_active = true,
      updated_at = now()
    returning id into _department_id;
  end if;

  update public.profiles p
     set municipality_id = coalesce(p.municipality_id, new.tenant_id),
         department_id = coalesce(_department_id, p.department_id),
         role = coalesce(p.role, _role_code),
         updated_at = now()
   where p.user_id = new.user_id;

  return new;
end;
$$;

insert into public.municipalities (
  id,
  name,
  state,
  slug,
  subdomain,
  status,
  created_at,
  updated_at
)
select
  t.id,
  coalesce(nullif(t.display_name, ''), t.legal_name),
  t.state,
  lower(
    regexp_replace(
      trim(both '-' from regexp_replace(coalesce(t.subdomain, t.city, t.display_name, t.legal_name, ''), '[^a-zA-Z0-9]+', '-', 'g')),
      '-+',
      '-',
      'g'
    )
  ),
  nullif(t.subdomain, ''),
  public.legacy_tenant_status_to_municipality_status(t.status::text),
  t.created_at,
  coalesce(t.updated_at, now())
from public.tenants t
on conflict (id) do update
set
  name = excluded.name,
  state = excluded.state,
  subdomain = coalesce(excluded.subdomain, public.municipalities.subdomain),
  status = excluded.status,
  updated_at = now();

do $$
begin
  if to_regclass('public.tenant_settings') is not null then
    execute $sql$
      update public.municipalities m
      set
        secretariat_name = coalesce(m.secretariat_name, ts.secretaria_responsavel),
        email = coalesce(m.email, ts.email),
        phone = coalesce(m.phone, ts.telefone),
        address = coalesce(m.address, ts.endereco),
        custom_domain = coalesce(m.custom_domain, ts.site),
        updated_at = now()
      from public.tenant_settings ts
      where ts.tenant_id = m.id
    $sql$;
  end if;
end
$$;
insert into public.municipality_branding (
  municipality_id,
  logo_url,
  primary_color,
  accent_color,
  official_header_text,
  official_footer_text,
  created_at,
  updated_at
)
select
  t.id,
  tb.logo_url,
  tb.primary_color,
  tb.accent_color,
  coalesce(tb.hero_title, t.display_name, t.legal_name),
  tb.hero_subtitle,
  coalesce(tb.created_at, now()),
  now()
from public.tenants t
left join public.tenant_branding tb
  on tb.tenant_id = t.id
on conflict (municipality_id) do update
set
  logo_url = coalesce(excluded.logo_url, public.municipality_branding.logo_url),
  primary_color = coalesce(excluded.primary_color, public.municipality_branding.primary_color),
  accent_color = coalesce(excluded.accent_color, public.municipality_branding.accent_color),
  official_header_text = coalesce(excluded.official_header_text, public.municipality_branding.official_header_text),
  official_footer_text = coalesce(excluded.official_footer_text, public.municipality_branding.official_footer_text),
  updated_at = now();

do $$
begin
  if to_regclass('public.tenant_settings') is not null then
    execute $sql$
      insert into public.municipality_branding (
        municipality_id,
        logo_url,
        coat_of_arms_url,
        official_header_text,
        official_footer_text,
        created_at,
        updated_at
      )
      select
        ts.tenant_id,
        ts.logo_url,
        ts.brasao_url,
        ts.secretaria_responsavel,
        ts.resumo_plano_diretor,
        now(),
        now()
      from public.tenant_settings ts
      on conflict (municipality_id) do update
      set
        logo_url = coalesce(excluded.logo_url, public.municipality_branding.logo_url),
        coat_of_arms_url = coalesce(excluded.coat_of_arms_url, public.municipality_branding.coat_of_arms_url),
        official_header_text = coalesce(excluded.official_header_text, public.municipality_branding.official_header_text),
        official_footer_text = coalesce(excluded.official_footer_text, public.municipality_branding.official_footer_text),
        updated_at = now()
    $sql$;
  end if;
end
$$;

insert into public.municipality_settings (
  municipality_id,
  require_professional_registration,
  allow_digital_protocol,
  allow_walkin_protocol,
  general_settings,
  created_at,
  updated_at
)
select
  t.id,
  true,
  true,
  false,
  jsonb_strip_nulls(
    jsonb_build_object(
      'cnpj', t.cnpj,
      'legacy_tenant_status', t.status::text,
      'city', t.city
    )
  ),
  coalesce(t.created_at, now()),
  now()
from public.tenants t
on conflict (municipality_id) do update
set
  general_settings = public.municipality_settings.general_settings || excluded.general_settings,
  updated_at = now();

do $$
begin
  if to_regclass('public.tenant_settings') is not null then
    execute $sql$
      insert into public.municipality_settings (
        municipality_id,
        protocol_prefix,
        guide_prefix,
        require_professional_registration,
        allow_digital_protocol,
        allow_walkin_protocol,
        general_settings,
        created_at,
        updated_at
      )
      select
        ts.tenant_id,
        ts.protocolo_prefixo,
        ts.guia_prefixo,
        coalesce(ts.registro_profissional_obrigatorio, true),
        true,
        false,
        jsonb_strip_nulls(
          jsonb_build_object(
            'site', ts.site,
            'horario_atendimento', ts.horario_atendimento,
            'bandeira_url', ts.bandeira_url,
            'imagem_hero_url', ts.imagem_hero_url,
            'resumo_plano_diretor', ts.resumo_plano_diretor,
            'resumo_uso_solo', ts.resumo_uso_solo,
            'leis_complementares', ts.leis_complementares,
            'link_portal_cliente', ts.link_portal_cliente,
            'chave_pix', ts.chave_pix,
            'beneficiario_arrecadacao', ts.beneficiario_arrecadacao,
            'contract_number', ts.contract_number,
            'contract_start', ts.contract_start,
            'contract_end', ts.contract_end,
            'monthly_fee', ts.monthly_fee,
            'setup_fee', ts.setup_fee,
            'signature_mode', ts.signature_mode,
            'client_delivery_link', ts.client_delivery_link,
            'plano_diretor_arquivo_nome', ts.plano_diretor_arquivo_nome,
            'plano_diretor_arquivo_url', ts.plano_diretor_arquivo_url,
            'uso_solo_arquivo_nome', ts.uso_solo_arquivo_nome,
            'uso_solo_arquivo_url', ts.uso_solo_arquivo_url,
            'leis_arquivo_nome', ts.leis_arquivo_nome,
            'leis_arquivo_url', ts.leis_arquivo_url,
            'taxa_protocolo', ts.taxa_protocolo,
            'taxa_iss_por_metro_quadrado', ts.taxa_iss_por_metro_quadrado,
            'taxa_aprovacao_final', ts.taxa_aprovacao_final,
            'logo_scale', ts.logo_scale,
            'logo_offset_x', ts.logo_offset_x,
            'logo_offset_y', ts.logo_offset_y
          )
        ),
        now(),
        now()
      from public.tenant_settings ts
      on conflict (municipality_id) do update
      set
        protocol_prefix = coalesce(excluded.protocol_prefix, public.municipality_settings.protocol_prefix),
        guide_prefix = coalesce(excluded.guide_prefix, public.municipality_settings.guide_prefix),
        require_professional_registration = excluded.require_professional_registration,
        general_settings = public.municipality_settings.general_settings || excluded.general_settings,
        updated_at = now()
    $sql$;
  end if;

  if to_regclass('public.tenant_modules') is not null then
    execute $sql$
      update public.municipality_settings ms
      set general_settings = ms.general_settings || jsonb_build_object(
        'legacy_modules_enabled',
        (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'module_id', tm.module_id,
                'is_enabled', tm.is_enabled,
                'settings', tm.settings
              )
              order by tm.module_id
            ),
            '[]'::jsonb
          )
          from public.tenant_modules tm
          where tm.tenant_id = ms.municipality_id
        )
      ),
      updated_at = now()
    $sql$;
  end if;
end
$$;

insert into public.departments (
  municipality_id,
  code,
  name,
  description,
  is_active,
  created_at,
  updated_at
)
select distinct
  tm.tenant_id,
  lower(
    regexp_replace(
      trim(both '-' from regexp_replace(coalesce(tm.department, ''), '[^a-zA-Z0-9]+', '-', 'g')),
      '-+',
      '-',
      'g'
    )
  ),
  tm.department,
  'Importado da estrutura tenant_memberships',
  true,
  now(),
  now()
from public.tenant_memberships tm
where tm.deleted_at is null
  and coalesce(tm.is_active, true) = true
  and nullif(coalesce(tm.department, ''), '') is not null
on conflict (municipality_id, name) do update
set
  is_active = true,
  updated_at = now();

with ranked_memberships as (
  select
    tm.user_id,
    tm.tenant_id,
    tm.department,
    r.code as role_code,
    row_number() over (
      partition by tm.user_id
      order by
        case
          when r.code in ('admin_master', 'master_admin', 'master_ops') then 1
          when r.code in ('admin_municipality', 'prefeitura_admin', 'prefeitura_supervisor') then 2
          else 3
        end,
        tm.id
    ) as rn
  from public.tenant_memberships tm
  join public.roles r
    on r.id = tm.role_id
  where tm.deleted_at is null
    and coalesce(tm.is_active, true) = true
)
update public.profiles p
set
  municipality_id = coalesce(p.municipality_id, rm.tenant_id),
  role = coalesce(p.role, rm.role_code),
  department_id = coalesce(
    p.department_id,
    (
      select d.id
      from public.departments d
      where d.municipality_id = rm.tenant_id
        and d.name = rm.department
      limit 1
    )
  ),
  updated_at = now()
from ranked_memberships rm
where rm.rn = 1
  and p.user_id = rm.user_id;

drop trigger if exists trg_sync_municipality_from_tenant on public.tenants;
create trigger trg_sync_municipality_from_tenant
after insert or update on public.tenants
for each row
execute function public.sync_municipality_from_tenant();

drop trigger if exists trg_sync_municipality_branding_from_legacy on public.tenant_branding;
create trigger trg_sync_municipality_branding_from_legacy
after insert or update on public.tenant_branding
for each row
execute function public.sync_municipality_branding_from_legacy();

do $$
begin
  if to_regclass('public.tenant_settings') is not null then
    execute 'drop trigger if exists trg_sync_municipality_settings_from_legacy on public.tenant_settings';
    execute 'create trigger trg_sync_municipality_settings_from_legacy after insert or update on public.tenant_settings for each row execute function public.sync_municipality_settings_from_legacy()';
  end if;
end
$$;

drop trigger if exists trg_sync_profile_municipality_from_membership on public.tenant_memberships;
create trigger trg_sync_profile_municipality_from_membership
after insert or update on public.tenant_memberships
for each row
execute function public.sync_profile_municipality_from_membership();
