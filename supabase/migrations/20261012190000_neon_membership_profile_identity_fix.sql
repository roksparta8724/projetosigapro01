-- SIGAPRO / Neon production
-- Corrige alteração de cargo/perfil para contas migradas do Supabase.
-- profile_id é a identidade canônica; user_id legado só é usado se ainda existir em auth.users.

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
set search_path = pg_catalog, public
set row_security = off
as $function$
declare
  _actor_profile_id uuid := public.current_profile_id();
  _target_profile_id uuid;
  _legacy_user_id uuid;
  _requested_role text;
  _requested_status text;
  _role_id uuid;
  _tenant_id uuid;
  _blocked_at timestamptz;
  _blocked_by_profile_id uuid;
begin
  if _actor_profile_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if not (public.is_master() or public.can_manage_municipality(_municipality_id)) then
    raise exception 'Sem permissao para gerenciar usuarios desta prefeitura';
  end if;

  _target_profile_id := public.resolve_profile_id_from_any_user_id(_user_id);

  if _target_profile_id is null then
    select p.id into _target_profile_id
    from public.profiles p
    where p.id=_user_id and p.deleted_at is null
    limit 1;
  end if;

  if _target_profile_id is null then
    raise exception 'Perfil nao encontrado';
  end if;

  select p.user_id into _legacy_user_id
  from public.profiles p
  where p.id=_target_profile_id
  limit 1;

  if _legacy_user_id is not null
     and not exists (select 1 from auth.users au where au.id=_legacy_user_id) then
    _legacy_user_id := null;
  end if;

  _requested_role := coalesce(nullif(trim(_role_code),''),(
    select p.role from public.profiles p where p.id=_target_profile_id
  ),'profissional_externo');

  if _requested_role in ('profissional','professional') then
    _requested_role := 'profissional_externo';
  end if;

  _requested_status := coalesce(nullif(trim(_account_status),''),(
    select p.account_status from public.profiles p where p.id=_target_profile_id
  ),'active');

  if not exists(select 1 from public.municipalities where id=_municipality_id) then
    raise exception 'Prefeitura nao encontrada';
  end if;

  if _requested_role in ('admin_master','master_admin','master_ops') then
    raise exception 'Papeis da plataforma nao podem ser atribuidos por esta operacao';
  end if;

  if not exists(select 1 from public.roles where code::text=_requested_role) then
    raise exception 'Papel inexistente';
  end if;

  if _access_level is not null and _access_level not in (1,2,3) then
    raise exception 'Nivel de acesso invalido';
  end if;

  if not public.is_master() then
    if exists (
      select 1 from public.profiles p
      where p.id=_target_profile_id
        and (
          (p.municipality_id is not null and p.municipality_id<>_municipality_id)
          or p.role in ('admin_master','master_admin','master_ops')
        )
    ) then
      raise exception 'Nao e permitido transferir ou alterar perfil fora de seu escopo';
    end if;

    if _requested_role='prefeitura_admin' then
      raise exception 'Promocao para administrador municipal exige autorizacao master';
    end if;
  end if;

  if _target_profile_id=_actor_profile_id and _requested_status<>'active' then
    raise exception 'Nao e permitido bloquear a propria conta nesta operacao';
  end if;

  if _requested_status not in ('active','blocked','inactive') then
    raise exception 'Status de conta invalido';
  end if;

  if _requested_status in ('blocked','inactive') then
    _blocked_at := now();
    _blocked_by_profile_id := _actor_profile_id;
  else
    _blocked_at := null;
    _blocked_by_profile_id := null;
  end if;

  update public.profiles
     set municipality_id=_municipality_id,
         role=_requested_role,
         full_name=coalesce(nullif(trim(_full_name),''),full_name),
         account_status=_requested_status,
         blocked_at=_blocked_at,
         blocked_by_profile_id=_blocked_by_profile_id,
         blocked_by=case
           when _blocked_by_profile_id is null then null
           else (select p.user_id from public.profiles p where p.id=_blocked_by_profile_id)
         end,
         block_reason=case
           when _requested_status='active' then null
           else nullif(trim(coalesce(_reason,'')),'')
         end,
         deleted_at=null,
         updated_at=now()
   where id=_target_profile_id;

  select r.id into _role_id
  from public.roles r
  where r.code::text=_requested_role
  limit 1;

  select t.id into _tenant_id
  from public.tenants t
  where t.id=_municipality_id
  limit 1;

  if _tenant_id is not null and _role_id is not null then
    insert into public.tenant_memberships(
      tenant_id,user_id,profile_id,role_id,department,queue_name,level_name,is_active,deleted_at
    )
    values(
      _tenant_id,_legacy_user_id,_target_profile_id,_role_id,
      coalesce(nullif(trim(_title),''),'Equipe municipal'),
      'Operacao municipal',
      case coalesce(_access_level,2)
        when 3 then 'Nivel 3'
        when 1 then 'Nivel 1'
        else 'Nivel 2'
      end,
      _requested_status='active',
      case when _requested_status='active' then null else now() end
    )
    on conflict (tenant_id,profile_id,role_id) where profile_id is not null
    do update set
      user_id=excluded.user_id,
      department=excluded.department,
      queue_name=excluded.queue_name,
      level_name=excluded.level_name,
      is_active=excluded.is_active,
      deleted_at=excluded.deleted_at,
      updated_at=now();
  end if;

  return jsonb_build_object(
    'user_id',_user_id,
    'profile_id',_target_profile_id,
    'municipality_id',_municipality_id,
    'full_name',(select p.full_name from public.profiles p where p.id=_target_profile_id),
    'role',_requested_role,
    'title',coalesce(nullif(trim(_title),''),'Equipe municipal'),
    'access_level',coalesce(_access_level,2),
    'account_status',_requested_status,
    'user_type','municipal',
    'blocked_at',(select p.blocked_at from public.profiles p where p.id=_target_profile_id),
    'blocked_by',coalesce(
      (select p.blocked_by_profile_id::text from public.profiles p where p.id=_target_profile_id),
      (select p.blocked_by::text from public.profiles p where p.id=_target_profile_id)
    ),
    'block_reason',(select p.block_reason from public.profiles p where p.id=_target_profile_id)
  );
end;
$function$;
