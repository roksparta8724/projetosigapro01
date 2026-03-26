create or replace function public.bootstrap_master_admin(
  _email text,
  _full_name text default 'Administrador Master',
  _platform_tenant_name text default 'SIGAPRO Plataforma'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _user_id uuid;
  _tenant_id uuid;
  _role_id uuid;
  _normalized_email text := lower(trim(_email));
begin
  select id
    into _user_id
    from auth.users
   where lower(email) = _normalized_email
   limit 1;

  if _user_id is null then
    raise exception 'Usuario do auth.users nao encontrado para o e-mail %', _normalized_email;
  end if;

  select id
    into _tenant_id
    from public.tenants
   where cnpj = '00000000000000'
   limit 1;

  if _tenant_id is null then
    insert into public.tenants (
      legal_name,
      display_name,
      cnpj,
      city,
      state,
      status,
      subdomain
    )
    values (
      _platform_tenant_name,
      _platform_tenant_name,
      '00000000000000',
      'Plataforma',
      'SP',
      'ativo',
      'sigapro-plataforma'
    )
    returning id into _tenant_id;

    insert into public.tenant_branding (
      tenant_id,
      primary_color,
      accent_color,
      hero_title,
      hero_subtitle
    )
    values (
      _tenant_id,
      '#103a56',
      '#56d4c2',
      'SIGAPRO',
      'Plataforma administrativa'
    )
    on conflict (tenant_id) do nothing;
  end if;

  select id
    into _role_id
    from public.roles
   where code = 'master_admin'
   limit 1;

  if _role_id is null then
    raise exception 'Role master_admin nao encontrada';
  end if;

  insert into public.profiles (
    user_id,
    full_name,
    email
  )
  values (
    _user_id,
    _full_name,
    _normalized_email
  )
  on conflict (user_id) do update
    set full_name = excluded.full_name,
        email = excluded.email,
        updated_at = now(),
        deleted_at = null;

  insert into public.tenant_memberships (
    tenant_id,
    user_id,
    role_id,
    department,
    queue_name,
    level_name,
    is_active,
    deleted_at
  )
  values (
    _tenant_id,
    _user_id,
    _role_id,
    'Plataforma',
    'Administracao master',
    'Nivel 3',
    true,
    null
  )
  on conflict (tenant_id, user_id, role_id) do update
    set department = excluded.department,
        queue_name = excluded.queue_name,
        level_name = excluded.level_name,
        is_active = true,
        deleted_at = null;

  return jsonb_build_object(
    'user_id', _user_id,
    'tenant_id', _tenant_id,
    'role', 'master_admin',
    'email', _normalized_email
  );
end;
$$;

grant execute on function public.bootstrap_master_admin(text, text, text) to postgres;
