-- Persist municipal cargo + visible profile without introducing a new Data API RPC signature.
-- The existing manage_municipal_user_access RPC remains the canonical endpoint.
begin;

alter table public.tenant_memberships
  add column if not exists position_title text;

alter table public.tenant_memberships
  add column if not exists profile_label text;

create or replace function public.manage_municipal_user_access(
  _user_id uuid,
  _municipality_id uuid,
  _role_code text default null::text,
  _full_name text default null::text,
  _title text default null::text,
  _access_level integer default null::integer,
  _account_status text default null::text,
  _reason text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
set row_security to 'off'
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
  _department_name text;
  _position_title text;
  _profile_label text;
  _requested_title text;
  _level_name text;
  _queue_name text;
  _payload jsonb;
begin
  if _actor_profile_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if not (public.is_master() or public.can_manage_municipality(_municipality_id)) then
    raise exception 'Sem permissao para gerenciar usuarios desta prefeitura';
  end if;

  _requested_title := nullif(trim(_title),'');
  if _requested_title is not null and left(_requested_title,1)='{' then
    begin
      _payload := _requested_title::jsonb;
      _requested_title := nullif(trim(_payload->>'positionTitle'),'');
      _profile_label := nullif(trim(_payload->>'profileLabel'),'');
    exception when others then
      _payload := null;
      _profile_label := null;
      _requested_title := nullif(trim(_title),'');
    end;
  end if;

  _target_profile_id := public.resolve_profile_id_from_any_user_id(_user_id);

  if _target_profile_id is null then
    select p.id into _target_profile_id
    from public.profiles p
    where p.id=_user_id
      and p.deleted_at is null
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

  _requested_role := coalesce(
    nullif(trim(_role_code),''),
    (select p.role from public.profiles p where p.id=_target_profile_id),
    'profissional_externo'
  );

  if _requested_role in ('profissional','professional') then
    _requested_role := 'profissional_externo';
  end if;

  _requested_status := coalesce(
    nullif(trim(_account_status),''),
    (select p.account_status from public.profiles p where p.id=_target_profile_id),
    'active'
  );

  if not exists(select 1 from public.municipalities where id=_municipality_id) then
    raise exception 'Prefeitura nao encontrada';
  end if;

  if _requested_role in ('admin_master','master_admin','master_ops') then
    raise exception 'Papeis da plataforma nao podem ser atribuidos por esta operacao';
  end if;

  select r.id into _role_id
  from public.roles r
  where r.code::text=_requested_role
  limit 1;

  if _role_id is null then
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

  select t.id into _tenant_id
  from public.tenants t
  where t.id=_municipality_id
  limit 1;

  select coalesce(
    d.name,
    (
      select tm.department
      from public.tenant_memberships tm
      where tm.tenant_id=_municipality_id
        and tm.profile_id=_target_profile_id
        and tm.department is not null
        and trim(tm.department)<>''
      order by tm.is_active desc, tm.updated_at desc nulls last
      limit 1
    )
  )
  into _department_name
  from public.profiles p
  left join public.departments d
    on d.id=p.department_id
   and d.municipality_id=_municipality_id
  where p.id=_target_profile_id;

  select
    coalesce(_requested_title,nullif(trim(tm.position_title),''),nullif(trim(r.label),''),'Equipe municipal'),
    coalesce(_profile_label,nullif(trim(tm.profile_label),'')),
    coalesce(nullif(trim(tm.queue_name),''),'Operacao municipal'),
    case
      when _access_level=3 then 'Nivel 3'
      when _access_level=2 then 'Nivel 2'
      when _access_level=1 then 'Nivel 1'
      when tm.level_name is not null and trim(tm.level_name)<>'' then tm.level_name
      else 'Nivel 2'
    end
  into _position_title,_profile_label,_queue_name,_level_name
  from public.roles r
  left join public.tenant_memberships tm
    on tm.tenant_id=_municipality_id
   and tm.profile_id=_target_profile_id
   and tm.role_id=_role_id
  where r.id=_role_id
  order by tm.updated_at desc nulls last
  limit 1;

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

  update public.tenant_memberships
     set is_active=false,
         deleted_at=coalesce(deleted_at,now()),
         updated_at=now()
   where tenant_id=_municipality_id
     and profile_id=_target_profile_id
     and role_id<>_role_id
     and (is_active=true or deleted_at is null);

  if _tenant_id is not null then
    insert into public.tenant_memberships(
      tenant_id,user_id,profile_id,role_id,department,position_title,profile_label,
      queue_name,level_name,is_active,deleted_at,created_at,updated_at
    )
    values(
      _tenant_id,_legacy_user_id,_target_profile_id,_role_id,_department_name,_position_title,_profile_label,
      _queue_name,_level_name,_requested_status='active',
      case when _requested_status='active' then null else now() end,
      now(),now()
    )
    on conflict (tenant_id,profile_id,role_id) where profile_id is not null
    do update set
      user_id=excluded.user_id,
      department=coalesce(public.tenant_memberships.department,excluded.department),
      position_title=excluded.position_title,
      profile_label=coalesce(excluded.profile_label,public.tenant_memberships.profile_label),
      queue_name=coalesce(nullif(public.tenant_memberships.queue_name,''),excluded.queue_name),
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
    'title',_position_title,
    'profile_label',_profile_label,
    'access_level',case _level_name when 'Nivel 3' then 3 when 'Nivel 1' then 1 else 2 end,
    'account_status',_requested_status,
    'user_type',case
      when _requested_role in ('profissional_externo','property_owner','proprietario_consulta') then 'Externo'
      else 'Interno'
    end,
    'blocked_at',(select p.blocked_at from public.profiles p where p.id=_target_profile_id),
    'blocked_by',coalesce(
      (select p.blocked_by_profile_id::text from public.profiles p where p.id=_target_profile_id),
      (select p.blocked_by::text from public.profiles p where p.id=_target_profile_id)
    ),
    'block_reason',(select p.block_reason from public.profiles p where p.id=_target_profile_id)
  );
end;
$function$;

grant execute on function public.manage_municipal_user_access(
  uuid,uuid,text,text,text,integer,text,text
) to authenticated;

commit;

notify pgrst, 'reload schema';
