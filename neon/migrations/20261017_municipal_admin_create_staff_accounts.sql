-- SIGAPRO
-- Administrador municipal pode criar e administrar servidores somente da própria Prefeitura.
-- Perfis Master continuam protegidos.
-- O cadastro usa Neon Auth + perfil municipal sem trocar a sessão atual do administrador.

do $migration$
declare
  _definition text;
  _old_guard text := $old$
    IF _requested_role='prefeitura_admin' THEN
      RAISE EXCEPTION 'Promocao para administrador municipal exige autorizacao master';
    END IF;
$old$;
  _new_guard text := $new$
    IF _requested_role='prefeitura_admin'
       AND NOT EXISTS (
         SELECT 1
         FROM public.profiles actor_profile
         WHERE actor_profile.id=_actor_profile_id
           AND actor_profile.deleted_at IS NULL
           AND actor_profile.account_status='active'
           AND actor_profile.municipality_id=_municipality_id
           AND actor_profile.role='prefeitura_admin'
       ) THEN
      RAISE EXCEPTION 'Somente o administrador desta Prefeitura ou o Master pode atribuir este perfil';
    END IF;
$new$;
begin
  select pg_get_functiondef(
    'public.manage_municipal_user_access(uuid,uuid,text,text,text,integer,text,text)'::regprocedure
  )
  into _definition;

  if position(_old_guard in _definition) > 0 then
    _definition := replace(_definition, _old_guard, _new_guard);
    execute _definition;
  end if;
end
$migration$;

create or replace function public.provision_municipal_staff_account(
  _municipality_id uuid,
  _email text,
  _role_code text,
  _full_name text,
  _title text,
  _access_level integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'neon_auth'
set row_security to 'off'
as $function$
declare
  _actor_profile_id uuid := public.current_profile_id();
  _actor_role text;
  _actor_municipality_id uuid;
  _normalized_email text := lower(btrim(coalesce(_email,'')));
  _auth_user_id text;
  _auth_name text;
  _auth_banned boolean;
  _target_profile_id uuid;
  _target_role text;
  _target_municipality_id uuid;
  _managed jsonb;
begin
  if _actor_profile_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if _normalized_email='' then
    raise exception 'E-mail obrigatorio';
  end if;

  if _role_code is null or btrim(_role_code)='' then
    raise exception 'Perfil interno obrigatorio';
  end if;

  if _role_code in ('admin_master','master_admin','master_ops') then
    raise exception 'Papeis Master nao podem ser criados pela administracao municipal';
  end if;

  if _role_code in ('profissional_externo','property_owner','proprietario_consulta') then
    raise exception 'Este cadastro e exclusivo para servidores internos da Prefeitura';
  end if;

  if not exists (select 1 from public.municipalities m where m.id=_municipality_id) then
    raise exception 'Prefeitura nao encontrada';
  end if;

  select p.role,p.municipality_id
    into _actor_role,_actor_municipality_id
  from public.profiles p
  where p.id=_actor_profile_id
    and p.deleted_at is null
    and p.account_status='active'
  limit 1;

  if not public.is_master() then
    if coalesce(_actor_role,'') <> 'prefeitura_admin'
       or _actor_municipality_id is distinct from _municipality_id then
      raise exception 'O administrador so pode cadastrar servidores em sua propria Prefeitura';
    end if;
  end if;

  select u.id::text,u.name,u.banned
    into _auth_user_id,_auth_name,_auth_banned
  from neon_auth."user" u
  where lower(btrim(u.email))=_normalized_email
  limit 1;

  if _auth_user_id is null then
    return jsonb_build_object(
      'ready',false,
      'reason','auth_missing',
      'email',_normalized_email
    );
  end if;

  if coalesce(_auth_banned,false) then
    raise exception 'Esta conta esta bloqueada no Neon Auth';
  end if;

  select pai.profile_id
    into _target_profile_id
  from public.profile_auth_identities pai
  where pai.provider='neon'
    and pai.provider_user_id=_auth_user_id
    and pai.is_active=true
  limit 1;

  if _target_profile_id is null then
    select p.id,p.role,p.municipality_id
      into _target_profile_id,_target_role,_target_municipality_id
    from public.profiles p
    where lower(btrim(coalesce(p.email,'')))=_normalized_email
      and p.deleted_at is null
    order by
      case
        when p.municipality_id=_municipality_id then 0
        when p.municipality_id is null then 1
        else 2
      end,
      p.updated_at desc nulls last,
      p.created_at desc
    limit 1;

    if _target_profile_id is not null then
      if coalesce(_target_role,'') in ('admin_master','master_admin','master_ops') then
        raise exception 'A conta Master nao pode ser vinculada por esta operacao';
      end if;

      if not public.is_master()
         and _target_municipality_id is not null
         and _target_municipality_id <> _municipality_id then
        raise exception 'A conta pertence a outra Prefeitura';
      end if;

      if exists (
        select 1
        from public.profile_auth_identities pai
        where pai.profile_id=_target_profile_id
          and pai.provider='neon'
          and pai.provider_user_id<>_auth_user_id
          and pai.is_active=true
      ) then
        raise exception 'Este perfil ja possui outra identidade Neon vinculada';
      end if;
    else
      insert into public.profiles(
        full_name,email,tipo,role,account_status,municipality_id,updated_at
      )
      values(
        coalesce(nullif(btrim(_full_name),''),nullif(btrim(_auth_name),''),_normalized_email),
        _normalized_email,
        'interno',
        _role_code,
        'active',
        _municipality_id,
        now()
      )
      returning id into _target_profile_id;
    end if;

    insert into public.profile_auth_identities(
      profile_id,provider,provider_user_id,is_active,last_used_at
    )
    values(
      _target_profile_id,'neon',_auth_user_id,true,now()
    )
    on conflict (provider,provider_user_id)
    do update set
      profile_id=excluded.profile_id,
      is_active=true,
      last_used_at=now();
  end if;

  select p.role,p.municipality_id
    into _target_role,_target_municipality_id
  from public.profiles p
  where p.id=_target_profile_id
    and p.deleted_at is null
  limit 1;

  if _target_profile_id is null then
    raise exception 'Perfil de usuario nao encontrado';
  end if;

  if coalesce(_target_role,'') in ('admin_master','master_admin','master_ops') then
    raise exception 'A conta Master nao pode ser alterada pela administracao municipal';
  end if;

  if not public.is_master()
     and _target_municipality_id is not null
     and _target_municipality_id <> _municipality_id then
    raise exception 'A conta pertence a outra Prefeitura';
  end if;

  _managed := public.manage_municipal_user_access(
    _target_profile_id,
    _municipality_id,
    _role_code,
    coalesce(nullif(btrim(_full_name),''),nullif(btrim(_auth_name),''),_normalized_email),
    _title,
    _access_level,
    'active',
    null
  );

  return coalesce(_managed,'{}'::jsonb) || jsonb_build_object(
    'ready',true,
    'reason','',
    'profile_id',_target_profile_id,
    'auth_user_id',_auth_user_id,
    'email',_normalized_email
  );
end
$function$;

revoke all on function public.provision_municipal_staff_account(uuid,text,text,text,text,integer) from public;
grant execute on function public.provision_municipal_staff_account(uuid,text,text,text,text,integer) to authenticated;
