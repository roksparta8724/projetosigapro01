-- Self-service is scoped to the municipality from the link, never to an internal staff role.
-- Existing duplicate accounts are preserved; the auth trigger prevents any new duplicate.

alter table public.municipalities add column if not exists city text;

alter table public.profiles
  add column if not exists rg text,
  add column if not exists birth_date date,
  add column if not exists address_line text,
  add column if not exists address_number text,
  add column if not exists address_complement text,
  add column if not exists neighborhood text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists zip_code text,
  add column if not exists avatar_scale numeric not null default 1,
  add column if not exists avatar_offset_x numeric not null default 0,
  add column if not exists avatar_offset_y numeric not null default 0,
  add column if not exists use_avatar_in_header boolean not null default false;

update public.municipalities m
set city = coalesce(
  (select nullif(btrim(t.city), '') from public.tenants t where t.id = m.id),
  nullif(btrim(regexp_replace(
    coalesce(to_jsonb(m)->>'display_name', to_jsonb(m)->>'name', to_jsonb(m)->>'official_name', ''),
    '^Prefeitura( Municipal)? de[[:space:]]+', '', 'i'
  )), '')
)
where nullif(btrim(m.city), '') is null;

-- The legacy membership table still references tenants. Keep one matching row
-- for every municipality until the membership model is fully migrated.
-- Some older municipality rows have no CNPJ; do not invent a legal identifier.
alter table public.tenants alter column cnpj drop not null;

insert into public.tenants (id, legal_name, display_name, cnpj, city, state, status, subdomain)
select m.id,
  coalesce(nullif(to_jsonb(m)->>'official_name', ''), nullif(to_jsonb(m)->>'name', ''), m.city),
  coalesce(nullif(to_jsonb(m)->>'display_name', ''), nullif(to_jsonb(m)->>'name', ''), m.city),
  nullif(to_jsonb(m)->>'cnpj', ''),
  m.city, m.state,
  case
    when m.status::text in ('inactive', 'inativo', 'blocked', 'bloqueado', 'suspended', 'suspenso') then 'suspenso'::public.tenant_status
    when m.status::text in ('implementation', 'implantacao') then 'implantacao'::public.tenant_status
    else 'ativo'::public.tenant_status
  end,
  m.subdomain
from public.municipalities m
where not exists (select 1 from public.tenants t where t.id = m.id);

create or replace function public.sync_municipal_registration_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _name text := coalesce(nullif(to_jsonb(new)->>'display_name', ''), nullif(to_jsonb(new)->>'name', ''), new.city);
  _legal_name text := coalesce(nullif(to_jsonb(new)->>'official_name', ''), nullif(to_jsonb(new)->>'name', ''), new.city);
  _legacy_id uuid := coalesce(nullif(to_jsonb(new)->>'tenant_id', '')::uuid, new.id);
  _status public.tenant_status;
begin
  if tg_op = 'UPDATE' and
    (to_jsonb(old)->>'name', to_jsonb(old)->>'display_name', to_jsonb(old)->>'official_name', old.city, old.state, old.status::text, old.subdomain)
    is not distinct from
    (to_jsonb(new)->>'name', to_jsonb(new)->>'display_name', to_jsonb(new)->>'official_name', new.city, new.state, new.status::text, new.subdomain)
  then
    return new;
  end if;

  _status := case
    when new.status::text in ('inactive', 'inativo', 'blocked', 'bloqueado', 'suspended', 'suspenso') then 'suspenso'::public.tenant_status
    when new.status::text in ('implementation', 'implantacao') then 'implantacao'::public.tenant_status
    else 'ativo'::public.tenant_status
  end;

  insert into public.tenants (id, legal_name, display_name, cnpj, city, state, status, subdomain)
  values (_legacy_id, _legal_name, _name, nullif(to_jsonb(new)->>'cnpj', ''), new.city, new.state, _status, new.subdomain)
  on conflict (id) do update set
    legal_name = excluded.legal_name,
    display_name = excluded.display_name,
    cnpj = coalesce(excluded.cnpj, public.tenants.cnpj),
    city = excluded.city,
    state = excluded.state,
    status = excluded.status,
    subdomain = excluded.subdomain;
  return new;
end;
$$;

drop trigger if exists sync_municipal_registration_tenant on public.municipalities;
create trigger sync_municipal_registration_tenant
after insert or update on public.municipalities
for each row execute function public.sync_municipal_registration_tenant();

create or replace function public.is_valid_signup_cpf(_value text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  _cpf text := pg_catalog.regexp_replace(coalesce(_value, ''), '[^0-9]', '', 'g');
  _position integer;
  _sum integer;
  _remainder integer;
  _index integer;
begin
  if length(_cpf) <> 11 or _cpf ~ '^([0-9])\1{10}$' then return false; end if;
  foreach _position in array array[9, 10] loop
    _sum := 0;
    for _index in 1.._position loop
      _sum := _sum + substr(_cpf, _index, 1)::integer * (_position + 2 - _index);
    end loop;
    _remainder := (_sum * 10) % 11;
    if substr(_cpf, _position + 1, 1)::integer <> (case when _remainder = 10 then 0 else _remainder end) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function public.guard_municipal_self_signup_cpf()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _role text := coalesce(new.raw_user_meta_data->>'role', '');
  _scope_text text := coalesce(new.raw_user_meta_data->>'tenant_id', '');
  _municipality_id uuid;
  _legacy_id uuid;
  _cpf text := pg_catalog.regexp_replace(coalesce(new.raw_user_meta_data->>'cpf_cnpj', ''), '[^0-9]', '', 'g');
  _municipality public.municipalities%rowtype;
begin
  if tg_op = 'UPDATE' and coalesce(old.raw_user_meta_data->>'role', '') in ('profissional_externo', 'property_owner') then
    if old.raw_user_meta_data->>'role' is distinct from _role
      or old.raw_user_meta_data->>'tenant_id' is distinct from _scope_text
      or pg_catalog.regexp_replace(coalesce(old.raw_user_meta_data->>'cpf_cnpj', ''), '[^0-9]', '', 'g') <> _cpf
    then
      raise exception 'CPF, perfil e Prefeitura do cadastro nao podem ser alterados';
    end if;
    return new;
  end if;

  if _role not in ('profissional_externo', 'property_owner') then return new; end if;

  if _scope_text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception 'Prefeitura invalida para cadastro';
  end if;
  _municipality_id := _scope_text::uuid;
  select * into _municipality from public.municipalities where id = _municipality_id;
  if _municipality.id is null or _municipality.status::text in ('inactive', 'inativo', 'blocked', 'bloqueado', 'suspended', 'suspenso') then
    raise exception 'Prefeitura indisponivel para cadastro';
  end if;
  if not public.is_valid_signup_cpf(_cpf) then
    raise exception 'CPF invalido para cadastro';
  end if;

  _legacy_id := coalesce(nullif(to_jsonb(_municipality)->>'tenant_id', '')::uuid, _municipality_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_municipality_id::text || ':' || _cpf, 0));

  if exists (
    select 1 from auth.users u
    where u.id <> new.id
      and pg_catalog.regexp_replace(coalesce(u.raw_user_meta_data->>'cpf_cnpj', ''), '[^0-9]', '', 'g') = _cpf
      and u.raw_user_meta_data->>'tenant_id' in (_municipality_id::text, _legacy_id::text)
  ) or exists (
    select 1 from public.profiles p
    where p.user_id <> new.id
      and p.deleted_at is null
      and pg_catalog.regexp_replace(coalesce(p.cpf_cnpj, ''), '[^0-9]', '', 'g') = _cpf
      and (p.municipality_id = _municipality_id or exists (
        select 1 from public.tenant_memberships tm
        where tm.user_id = p.user_id and tm.tenant_id = _legacy_id and tm.deleted_at is null
      ))
  ) then
    raise exception 'CPF ja cadastrado nesta Prefeitura';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_municipal_self_signup_cpf() from public, anon, authenticated;
drop trigger if exists guard_municipal_self_signup_cpf on auth.users;
create trigger guard_municipal_self_signup_cpf
before insert or update of raw_user_meta_data on auth.users
for each row execute function public.guard_municipal_self_signup_cpf();

create or replace function public.register_municipal_self_service(
  _municipality_id uuid, _role text, _full_name text, _email text, _cpf_cnpj text,
  _phone text, _professional_type text, _registration_number text, _company_name text,
  _title text, _bio text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _user_id uuid := auth.uid();
  _auth_user auth.users%rowtype;
  _municipality public.municipalities%rowtype;
  _legacy_id uuid;
  _role_id uuid;
  _existing public.profiles%rowtype;
  _cpf text := pg_catalog.regexp_replace(coalesce(_cpf_cnpj, ''), '[^0-9]', '', 'g');
begin
  if _user_id is null or _role not in ('profissional_externo', 'property_owner') then
    raise exception 'Cadastro nao autorizado';
  end if;
  select * into _auth_user from auth.users where id = _user_id;
  if _auth_user.id is null
    or _auth_user.raw_user_meta_data->>'role' is distinct from _role
    or _auth_user.raw_user_meta_data->>'tenant_id' is distinct from _municipality_id::text
    or pg_catalog.regexp_replace(coalesce(_auth_user.raw_user_meta_data->>'cpf_cnpj', ''), '[^0-9]', '', 'g') <> _cpf
    or lower(_auth_user.email) is distinct from lower(btrim(_email))
    or length(_cpf) <> 11
  then
    raise exception 'Dados de cadastro diferentes da conta autenticada';
  end if;

  select * into _municipality from public.municipalities where id = _municipality_id;
  if _municipality.id is null or _municipality.status::text in ('inactive', 'inativo', 'blocked', 'bloqueado', 'suspended', 'suspenso') then
    raise exception 'Prefeitura indisponivel para cadastro';
  end if;
  _legacy_id := coalesce(nullif(to_jsonb(_municipality)->>'tenant_id', '')::uuid, _municipality_id);
  if not exists (select 1 from public.tenants where id = _legacy_id and status::text not in ('suspenso', 'encerrado')) then
    raise exception 'Vinculo municipal indisponivel para cadastro';
  end if;

  select * into _existing from public.profiles where user_id = _user_id;
  if _existing.id is not null and (
    (_existing.municipality_id is not null and _existing.municipality_id <> _municipality_id)
    or (_existing.role in ('profissional_externo', 'property_owner') and _existing.role <> _role)
    or coalesce(_existing.account_status::text, 'active') <> 'active'
  ) then
    raise exception 'Conta ja vinculada ou indisponivel';
  end if;

  select id into _role_id from public.roles where code::text = _role limit 1;
  if _role_id is null then raise exception 'Papel de cadastro nao configurado'; end if;

  insert into public.profiles (
    user_id, municipality_id, role, full_name, email, cpf_cnpj,
    document_masked, phone, professional_type, registration_number, company_name, bio
  ) values (
    _user_id, _municipality_id, _role, btrim(_full_name), lower(btrim(_email)), _cpf,
    '***' || right(_cpf, 4), _phone, _professional_type, _registration_number, _company_name, _bio
  )
  on conflict (user_id) do update set
    municipality_id = excluded.municipality_id,
    role = excluded.role,
    full_name = excluded.full_name,
    email = excluded.email,
    cpf_cnpj = excluded.cpf_cnpj,
    document_masked = excluded.document_masked,
    phone = excluded.phone,
    professional_type = excluded.professional_type,
    registration_number = excluded.registration_number,
    company_name = excluded.company_name,
    bio = excluded.bio,
    deleted_at = null,
    updated_at = now();

  insert into public.tenant_memberships (
    tenant_id, user_id, role_id, department, queue_name, level_name, is_active, deleted_at
  ) values (
    _legacy_id, _user_id, _role_id,
    coalesce(nullif(_title, ''), case when _role = 'property_owner' then 'Proprietario do imovel' else 'Profissional externo' end),
    case when _role = 'property_owner' then 'Portal do proprietario' else 'Portal externo' end,
    'Nivel 1', true, null
  )
  on conflict (tenant_id, user_id, role_id) do update set
    department = excluded.department,
    queue_name = excluded.queue_name,
    level_name = excluded.level_name,
    is_active = true,
    deleted_at = null;

  insert into public.audit_logs (tenant_id, actor_user_id, entity_type, entity_id, action, details)
  values (_legacy_id, _user_id, 'registration', _legacy_id,
    case when _role = 'property_owner' then 'owner_account_registered' else 'external_account_registered' end,
    pg_catalog.jsonb_build_object('full_name', btrim(_full_name), 'email', lower(btrim(_email))));

  return pg_catalog.jsonb_build_object('user_id', _user_id, 'tenant_id', _municipality_id, 'role', _role);
end;
$$;

revoke all on function public.register_municipal_self_service(uuid, text, text, text, text, text, text, text, text, text, text)
from public, anon, authenticated;

create or replace function public.register_external_account(
  _tenant_id uuid, _full_name text, _email text, _cpf_cnpj text default null,
  _phone text default null, _professional_type text default null,
  _registration_number text default null, _company_name text default null,
  _title text default null, _bio text default null
)
returns jsonb language sql security definer set search_path = '' as $$
  select public.register_municipal_self_service(
    _tenant_id, 'profissional_externo', _full_name, _email, _cpf_cnpj,
    _phone, _professional_type, _registration_number, _company_name, _title, _bio
  );
$$;

create or replace function public.register_property_owner_account(
  _tenant_id uuid, _full_name text, _email text, _cpf_cnpj text default null,
  _phone text default null, _title text default null, _bio text default null
)
returns jsonb language sql security definer set search_path = '' as $$
  select public.register_municipal_self_service(
    _tenant_id, 'property_owner', _full_name, _email, _cpf_cnpj,
    _phone, null, null, null, _title, _bio
  );
$$;

revoke all on function public.register_external_account(uuid, text, text, text, text, text, text, text, text, text)
from public, anon;
revoke all on function public.register_property_owner_account(uuid, text, text, text, text, text, text)
from public, anon;

grant execute on function public.register_external_account(uuid, text, text, text, text, text, text, text, text, text)
to authenticated;
grant execute on function public.register_property_owner_account(uuid, text, text, text, text, text, text)
to authenticated;

create index if not exists profiles_municipal_cpf_lookup_idx
on public.profiles (
  municipality_id,
  (pg_catalog.regexp_replace(coalesce(cpf_cnpj, ''), '[^0-9]', '', 'g'))
)
where deleted_at is null;

notify pgrst, 'reload schema';
