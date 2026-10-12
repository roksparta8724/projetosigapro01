-- SIGAPRO: permite que o administrador municipal converta uma conta externa
-- ainda sem municipality_id em funcionário da própria Prefeitura.
-- Contas já vinculadas a outro município continuam protegidas.

create or replace function public.manage_municipal_user_access(
  _user_id uuid,
  _municipality_id uuid,
  _role_code text default null,
  _full_name text default null,
  _title text default null,
  _access_level integer default null,
  _account_status text default null,
  _reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  _actor uuid := auth.uid();
  _master boolean;
  _municipal_admin boolean;
  _profile public.profiles%rowtype;
  _profile_id uuid;
  _legacy_user_id uuid;
  _role text;
  _role_id uuid;
  _status text;
  _level integer;
  _name text;
  _position text;
  _external boolean;
begin
  if _actor is null or _user_id is null or _municipality_id is null then
    raise exception 'Sessao ou Prefeitura invalida';
  end if;

  _master := public.is_admin_master();
  _municipal_admin := public.is_municipality_admin()
    and public.current_municipality_id() = _municipality_id;

  if not _master and not _municipal_admin then
    raise exception 'Sem permissao para administrar esta Prefeitura';
  end if;

  select *
    into _profile
  from public.profiles p
  where (p.id = _user_id or p.user_id = _user_id)
    and p.deleted_at is null
  order by case when p.user_id = _user_id then 0 else 1 end
  limit 1
  for update;

  if not found then
    raise exception 'Conta nao encontrada';
  end if;

  _profile_id := _profile.id;
  _legacy_user_id := _profile.user_id;

  -- Conta sem município ainda pode ser vinculada pelo administrador desta Prefeitura.
  -- Conta já pertencente a outro município continua bloqueada.
  if _profile.municipality_id is not null
    and _profile.municipality_id is distinct from _municipality_id
    and not _master then
    raise exception 'Conta vinculada a outra Prefeitura';
  end if;

  if _profile.role in ('admin_master', 'master_admin', 'master_ops')
    or (
      _legacy_user_id is not null and exists (
        select 1
        from public.tenant_memberships tm
        join public.roles r on r.id = tm.role_id
        where tm.user_id = _legacy_user_id
          and r.code::text in ('master_admin', 'master_ops')
      )
    ) then
    raise exception 'Conta Master nao pode ser alterada neste fluxo';
  end if;

  if _municipal_admin and _profile.role in ('prefeitura_admin', 'admin_municipality') then
    raise exception 'Somente o Master pode alterar outro administrador municipal';
  end if;

  _role := coalesce(_role_code, nullif(_profile.role, ''));
  if _role in ('profissional', 'professional') then
    _role := 'profissional_externo';
  end if;

  if _role not in (
    'prefeitura_admin', 'prefeitura_supervisor', 'analista', 'financeiro',
    'setor_intersetorial', 'fiscal', 'profissional_externo',
    'property_owner', 'proprietario_consulta'
  ) then
    raise exception 'Papel de usuario invalido';
  end if;

  if _municipal_admin and _role = 'prefeitura_admin' then
    raise exception 'Somente o Master pode conceder administracao municipal';
  end if;

  if (_actor = _legacy_user_id or _actor = _profile_id)
    and (_role is distinct from _profile.role or _account_status in ('blocked', 'inactive')) then
    raise exception 'Nao e permitido alterar o proprio acesso administrativo';
  end if;

  select id into _role_id
  from public.roles
  where code::text = _role;

  if _role_id is null then
    raise exception 'Papel nao cadastrado no banco';
  end if;

  _status := coalesce(_account_status, _profile.account_status, 'active');
  if _status not in ('active', 'blocked', 'inactive') then
    raise exception 'Estado da conta invalido';
  end if;

  _level := coalesce(
    _access_level,
    case
      when _role = 'prefeitura_admin' then 3
      when _role in ('prefeitura_supervisor', 'analista', 'financeiro', 'setor_intersetorial', 'fiscal') then 2
      else 1
    end
  );

  if _level not between 1 and 3 or (_role = 'prefeitura_admin' and _level <> 3) then
    raise exception 'Nivel de acesso incompativel com o papel';
  end if;

  _name := coalesce(nullif(trim(_full_name), ''), _profile.full_name);
  if nullif(trim(coalesce(_name, '')), '') is null then
    raise exception 'Nome obrigatorio';
  end if;

  _position := coalesce(
    nullif(trim(_title), ''),
    (
      select tm.department
      from public.tenant_memberships tm
      where _legacy_user_id is not null
        and tm.user_id = _legacy_user_id
        and tm.tenant_id = _municipality_id
      order by tm.is_active desc, tm.updated_at desc nulls last
      limit 1
    ),
    _role
  );

  _external := _role in ('profissional_externo', 'property_owner', 'proprietario_consulta');

  update public.profiles
  set role = _role,
      municipality_id = _municipality_id,
      tipo = case when _external then 'externo' else 'interno' end,
      full_name = _name,
      account_status = _status,
      blocked_at = case when _status = 'blocked' then coalesce(blocked_at, now()) else null end,
      blocked_by = case when _status = 'blocked' then _actor else null end,
      block_reason = case
        when _status in ('blocked', 'inactive')
          then coalesce(nullif(trim(_reason), ''), block_reason, 'Restricao administrativa')
        else null
      end
  where id = _profile_id;

  if _legacy_user_id is null then
    raise exception 'Conta sem identidade de autenticacao vinculada';
  end if;

  if not exists (
    select 1
    from auth.users au
    where au.id = _legacy_user_id
  ) then
    raise exception 'Identidade de autenticacao nao encontrada para esta conta';
  end if;

  update public.tenant_memberships
  set is_active = false,
      updated_at = now()
  where tenant_id = _municipality_id
    and user_id = _legacy_user_id
    and role_id <> _role_id
    and deleted_at is null;

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
    _municipality_id,
    _legacy_user_id,
    _role_id,
    _position,
    _position,
    'Nivel ' || _level,
    _status = 'active',
    null
  )
  on conflict (tenant_id, user_id, role_id) do update
  set department = excluded.department,
      queue_name = excluded.queue_name,
      level_name = excluded.level_name,
      is_active = excluded.is_active,
      deleted_at = null,
      updated_at = now();

  return jsonb_build_object(
    'user_id', _user_id,
    'auth_user_id', _legacy_user_id,
    'profile_id', _profile_id,
    'municipality_id', _municipality_id,
    'role', _role,
    'full_name', _name,
    'title', _position,
    'access_level', _level,
    'account_status', _status,
    'user_type', case when _external then 'Externo' else 'Interno' end,
    'blocked_at', (select blocked_at from public.profiles where id = _profile_id),
    'blocked_by', (select blocked_by from public.profiles where id = _profile_id),
    'block_reason', (select block_reason from public.profiles where id = _profile_id)
  );
end;
$function$;

revoke all on function public.manage_municipal_user_access(uuid, uuid, text, text, text, integer, text, text)
from public, anon;

grant execute on function public.manage_municipal_user_access(uuid, uuid, text, text, text, integer, text, text)
to authenticated;

notify pgrst, 'reload schema';
