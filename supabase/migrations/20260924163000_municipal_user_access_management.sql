-- Role and account state are security data, not editable profile fields.
create or replace function public.guard_profile_access_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then return new; end if;

  if tg_op = 'INSERT' then
    if new.role is not null and new.role not in ('profissional', 'professional', 'profissional_externo', 'property_owner', 'proprietario_consulta') then
      raise exception 'Perfil de acesso deve ser definido por um administrador';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role
    or new.municipality_id is distinct from old.municipality_id
    or new.tipo is distinct from old.tipo
    or new.account_status is distinct from old.account_status
    or new.blocked_at is distinct from old.blocked_at
    or new.blocked_by is distinct from old.blocked_by
    or new.block_reason is distinct from old.block_reason
    or new.deleted_at is distinct from old.deleted_at
  then
    raise exception 'Papel, Prefeitura e estado da conta exigem administracao autorizada';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_access_fields on public.profiles;
create trigger trg_guard_profile_access_fields
before insert or update on public.profiles
for each row execute function public.guard_profile_access_fields();

-- A blocked account must not regain administrative rights from a stale membership.
create or replace function public.current_role_code()
returns text
language plpgsql
stable security definer
set search_path = public
set row_security = off
as $$
declare
  _code text;
begin
  if exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and (p.deleted_at is not null or p.account_status in ('blocked', 'inactive'))
  ) then
    return null;
  end if;

  select r.code::text into _code
  from public.tenant_memberships tm
  join public.roles r on r.id = tm.role_id
  where tm.user_id = auth.uid() and tm.is_active = true and tm.deleted_at is null
  order by tm.id limit 1;
  if nullif(trim(_code), '') is not null then return _code; end if;

  select p.role into _code
  from public.profiles p
  where p.user_id = auth.uid() and p.deleted_at is null
  order by p.updated_at desc nulls last, p.id limit 1;
  if nullif(trim(_code), '') is not null then return _code; end if;

  return null;
end;
$$;

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
as $$
declare
  _actor uuid := auth.uid();
  _master boolean;
  _municipal_admin boolean;
  _profile public.profiles%rowtype;
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

  select * into _profile from public.profiles p
  where p.user_id = _user_id and p.deleted_at is null
  for update;
  if not found or (_profile.municipality_id is distinct from _municipality_id
    and (not _master or _profile.municipality_id is not null)) then
    raise exception 'Conta nao vinculada a esta Prefeitura';
  end if;
  if _profile.role in ('admin_master', 'master_admin', 'master_ops')
    or exists (
      select 1 from public.tenant_memberships tm
      join public.roles r on r.id = tm.role_id
      where tm.user_id = _user_id and r.code::text in ('master_admin', 'master_ops')
    ) then
    raise exception 'Conta Master nao pode ser alterada neste fluxo';
  end if;
  if _municipal_admin and _profile.role in ('prefeitura_admin', 'admin_municipality') then
    raise exception 'Somente o Master pode alterar outro administrador municipal';
  end if;

  _role := coalesce(_role_code, nullif(_profile.role, ''));
  if _role in ('profissional', 'professional') then _role := 'profissional_externo'; end if;
  if _role not in (
    'prefeitura_admin', 'prefeitura_supervisor', 'analista', 'financeiro',
    'setor_intersetorial', 'fiscal', 'profissional_externo', 'property_owner', 'proprietario_consulta'
  ) then
    raise exception 'Papel de usuario invalido';
  end if;
  if _municipal_admin and _role = 'prefeitura_admin' then
    raise exception 'Somente o Master pode conceder administracao municipal';
  end if;
  if _actor = _user_id and (_role is distinct from _profile.role or _account_status in ('blocked', 'inactive')) then
    raise exception 'Nao e permitido alterar o proprio acesso administrativo';
  end if;

  select id into _role_id from public.roles where code::text = _role;
  if _role_id is null then raise exception 'Papel nao cadastrado no banco'; end if;

  _status := coalesce(_account_status, _profile.account_status, 'active');
  if _status not in ('active', 'blocked', 'inactive') then
    raise exception 'Estado da conta invalido';
  end if;
  _level := coalesce(_access_level,
    case when _role = 'prefeitura_admin' then 3
         when _role in ('prefeitura_supervisor', 'analista', 'financeiro', 'setor_intersetorial', 'fiscal') then 2
         else 1 end);
  if _level not between 1 and 3 or (_role = 'prefeitura_admin' and _level <> 3) then
    raise exception 'Nivel de acesso incompativel com o papel';
  end if;

  _name := coalesce(nullif(trim(_full_name), ''), _profile.full_name);
  if nullif(trim(coalesce(_name, '')), '') is null then raise exception 'Nome obrigatorio'; end if;
  _position := coalesce(nullif(trim(_title), ''),
    (select tm.department from public.tenant_memberships tm
     where tm.user_id = _user_id and tm.tenant_id = _municipality_id
     order by tm.is_active desc, tm.updated_at desc nulls last limit 1),
    _role);
  _external := _role in ('profissional_externo', 'property_owner', 'proprietario_consulta');

  update public.profiles
  set role = _role,
      municipality_id = _municipality_id,
      tipo = case when _external then 'externo' else 'interno' end,
      full_name = _name,
      account_status = _status,
      blocked_at = case when _status = 'blocked' then coalesce(blocked_at, now()) else null end,
      blocked_by = case when _status = 'blocked' then _actor else null end,
      block_reason = case when _status in ('blocked', 'inactive') then coalesce(nullif(trim(_reason), ''), block_reason, 'Restricao administrativa') else null end
  where user_id = _user_id;

  update public.tenant_memberships
  set is_active = false, updated_at = now()
  where tenant_id = _municipality_id and user_id = _user_id and role_id <> _role_id and deleted_at is null;

  insert into public.tenant_memberships
    (tenant_id, user_id, role_id, department, queue_name, level_name, is_active, deleted_at)
  values
    (_municipality_id, _user_id, _role_id, _position, _position, 'Nivel ' || _level, _status = 'active', null)
  on conflict (tenant_id, user_id, role_id) do update
  set department = excluded.department,
      queue_name = excluded.queue_name,
      level_name = excluded.level_name,
      is_active = excluded.is_active,
      deleted_at = null,
      updated_at = now();

  return jsonb_build_object(
    'user_id', _user_id, 'municipality_id', _municipality_id,
    'role', _role, 'full_name', _name, 'title', _position,
    'access_level', _level, 'account_status', _status,
    'user_type', case when _external then 'Externo' else 'Interno' end,
    'blocked_at', (select blocked_at from public.profiles where user_id = _user_id),
    'blocked_by', (select blocked_by from public.profiles where user_id = _user_id),
    'block_reason', (select block_reason from public.profiles where user_id = _user_id)
  );
end;
$$;

revoke all on function public.manage_municipal_user_access(uuid, uuid, text, text, text, integer, text, text) from public, anon;
grant execute on function public.manage_municipal_user_access(uuid, uuid, text, text, text, integer, text, text) to authenticated;
notify pgrst, 'reload schema';
