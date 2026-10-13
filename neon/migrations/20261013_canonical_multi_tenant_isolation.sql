-- Canonical multi-tenant isolation.
-- Every non-master account belongs to exactly one municipality.
-- Global master accounts remain municipality-neutral and can access all municipalities.

begin;

CREATE OR REPLACE FUNCTION public.register_external_account(_tenant_id uuid, _full_name text, _email text, _cpf_cnpj text DEFAULT NULL::text, _phone text DEFAULT NULL::text, _professional_type text DEFAULT NULL::text, _registration_number text DEFAULT NULL::text, _company_name text DEFAULT NULL::text, _title text DEFAULT NULL::text, _bio text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'neon_auth'
AS $function$
declare
  _subject text := public.current_auth_subject();
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _auth_email text;
  _auth_name text;
  _role_id uuid;
  _tenant_status text;
  _existing_municipality_id uuid;
  _existing_role text;
begin
  if _subject is null or btrim(_subject)='' then
    raise exception 'Usuario nao autenticado';
  end if;

  select t.status into _tenant_status
  from public.tenants t
  where t.id=_tenant_id
  limit 1;

  if _tenant_status is null then
    raise exception 'Prefeitura nao encontrada';
  end if;
  if _tenant_status in ('suspenso','encerrado') then
    raise exception 'Prefeitura indisponivel para novos cadastros';
  end if;

  select u.email, u.name
    into _auth_email, _auth_name
  from neon_auth."user" u
  where u.id::text=_subject
  limit 1;


  if _auth_email is null or btrim(_auth_email)='' then
    raise exception 'Conta de autenticacao sem e-mail';
  end if;

  if nullif(lower(btrim(coalesce(_email,''))),'') is not null
     and lower(btrim(_email)) <> lower(btrim(_auth_email)) then
    raise exception 'E-mail informado diferente da conta autenticada';
  end if;

  if _profile_id is not null then
    select p.municipality_id,p.role
      into _existing_municipality_id,_existing_role
    from public.profiles p
    where p.id=_profile_id
    limit 1;

    if coalesce(_existing_role,'') not in ('admin_master','master_admin','master_ops')
       and _existing_municipality_id is not null
       and _existing_municipality_id <> _tenant_id then
      raise exception 'Conta vinculada a outra Prefeitura';
    end if;
  end if;

  if _profile_id is null then
    insert into public.profiles(
      user_id, full_name, email, cpf_cnpj, document_masked, phone,
      professional_type, registration_number, company_name, bio,
      role, account_status, municipality_id
    )
    values(
      null,
      coalesce(nullif(btrim(_full_name),''), nullif(btrim(_auth_name),''), nullif(btrim(_auth_email),''), 'Usuario'),
      lower(btrim(_auth_email)),
      _cpf_cnpj,
      case
        when _cpf_cnpj is null or length(regexp_replace(_cpf_cnpj,'\D','','g'))<4 then null
        else '***' || right(regexp_replace(_cpf_cnpj,'\D','','g'),4)
      end,
      _phone, _professional_type, _registration_number, _company_name, _bio,
      'profissional_externo', 'active', _tenant_id
    )
    returning id into _profile_id;

    insert into public.profile_auth_identities(profile_id,provider,provider_user_id,is_active)
    values(_profile_id,'neon',_subject,true);
  else
    update public.profiles
       set full_name=coalesce(nullif(btrim(_full_name),''),full_name),
           email=lower(btrim(_auth_email)),
           cpf_cnpj=_cpf_cnpj,
           document_masked=case
             when _cpf_cnpj is null or length(regexp_replace(_cpf_cnpj,'\D','','g'))<4 then null
             else '***' || right(regexp_replace(_cpf_cnpj,'\D','','g'),4)
           end,
           phone=_phone,
           professional_type=_professional_type,
           registration_number=_registration_number,
           company_name=_company_name,
           bio=_bio,
           updated_at=now(),
           deleted_at=null,
           account_status='active',
           municipality_id=coalesce(municipality_id,_tenant_id)
     where id=_profile_id;
  end if;

  select id into _role_id
  from public.roles
  where code='profissional_externo'
  limit 1;
  if _role_id is null then
    raise exception 'Papel profissional_externo nao encontrado';
  end if;

  insert into public.tenant_memberships(
    tenant_id,user_id,profile_id,role_id,department,queue_name,level_name,is_active,deleted_at
  )
  values(
    _tenant_id,_legacy_user_id,_profile_id,_role_id,
    coalesce(_title,_professional_type,'Profissional externo'),
    'Portal externo','Nivel 1',true,null
  )
  on conflict (tenant_id,profile_id,role_id) where profile_id is not null
  do update set
    user_id=coalesce(excluded.user_id,public.tenant_memberships.user_id),
    department=excluded.department,
    queue_name=excluded.queue_name,
    level_name=excluded.level_name,
    is_active=true,
    deleted_at=null,
    updated_at=now();

  return jsonb_build_object(
    'profile_id',_profile_id,
    'user_id',_legacy_user_id,
    'tenant_id',_tenant_id,
    'role','profissional_externo'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.register_property_owner_account(_tenant_id uuid, _full_name text, _email text, _cpf_cnpj text DEFAULT NULL::text, _phone text DEFAULT NULL::text, _title text DEFAULT NULL::text, _bio text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'neon_auth'
AS $function$
declare
  _subject text := public.current_auth_subject();
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _auth_email text;
  _auth_name text;
  _role_id uuid;
  _tenant_status text;
  _existing_municipality_id uuid;
  _existing_role text;
begin
  if _subject is null or btrim(_subject)='' then
    raise exception 'Usuario nao autenticado';
  end if;

  select t.status into _tenant_status
  from public.tenants t
  where t.id=_tenant_id
  limit 1;

  if _tenant_status is null then
    raise exception 'Prefeitura nao encontrada';
  end if;
  if _tenant_status in ('suspenso','encerrado') then
    raise exception 'Prefeitura indisponivel para novos cadastros';
  end if;

  select u.email, u.name
    into _auth_email, _auth_name
  from neon_auth."user" u
  where u.id::text=_subject
  limit 1;


  if _auth_email is null or btrim(_auth_email)='' then
    raise exception 'Conta de autenticacao sem e-mail';
  end if;

  if nullif(lower(btrim(coalesce(_email,''))),'') is not null
     and lower(btrim(_email)) <> lower(btrim(_auth_email)) then
    raise exception 'E-mail informado diferente da conta autenticada';
  end if;

  if _profile_id is not null then
    select p.municipality_id,p.role
      into _existing_municipality_id,_existing_role
    from public.profiles p
    where p.id=_profile_id
    limit 1;

    if coalesce(_existing_role,'') not in ('admin_master','master_admin','master_ops')
       and _existing_municipality_id is not null
       and _existing_municipality_id <> _tenant_id then
      raise exception 'Conta vinculada a outra Prefeitura';
    end if;
  end if;

  if _profile_id is null then
    insert into public.profiles(
      user_id,full_name,email,cpf_cnpj,document_masked,phone,bio,role,account_status,municipality_id
    )
    values(
      null,
      coalesce(nullif(btrim(_full_name),''),nullif(btrim(_auth_name),''),nullif(btrim(_auth_email),''),'Usuario'),
      lower(btrim(_auth_email)),
      _cpf_cnpj,
      case
        when _cpf_cnpj is null or length(regexp_replace(_cpf_cnpj,'\D','','g'))<4 then null
        else '***' || right(regexp_replace(_cpf_cnpj,'\D','','g'),4)
      end,
      _phone,_bio,'property_owner','active',_tenant_id
    )
    returning id into _profile_id;

    insert into public.profile_auth_identities(profile_id,provider,provider_user_id,is_active)
    values(_profile_id,'neon',_subject,true);
  else
    update public.profiles
       set full_name=coalesce(nullif(btrim(_full_name),''),full_name),
           email=lower(btrim(_auth_email)),
           cpf_cnpj=_cpf_cnpj,
           document_masked=case
             when _cpf_cnpj is null or length(regexp_replace(_cpf_cnpj,'\D','','g'))<4 then null
             else '***' || right(regexp_replace(_cpf_cnpj,'\D','','g'),4)
           end,
           phone=_phone,
           bio=_bio,
           updated_at=now(),
           deleted_at=null,
           account_status='active',
           municipality_id=coalesce(municipality_id,_tenant_id)
     where id=_profile_id;
  end if;

  select id into _role_id
  from public.roles
  where code='property_owner'
  limit 1;
  if _role_id is null then
    raise exception 'Papel property_owner nao encontrado';
  end if;

  insert into public.tenant_memberships(
    tenant_id,user_id,profile_id,role_id,department,queue_name,level_name,is_active,deleted_at
  )
  values(
    _tenant_id,_legacy_user_id,_profile_id,_role_id,
    coalesce(_title,'Proprietario'),'Portal externo','Nivel 1',true,null
  )
  on conflict (tenant_id,profile_id,role_id) where profile_id is not null
  do update set
    user_id=coalesce(excluded.user_id,public.tenant_memberships.user_id),
    department=excluded.department,
    queue_name=excluded.queue_name,
    level_name=excluded.level_name,
    is_active=true,
    deleted_at=null,
    updated_at=now();

  return jsonb_build_object(
    'profile_id',_profile_id,
    'user_id',_legacy_user_id,
    'tenant_id',_tenant_id,
    'role','property_owner'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_membership_municipality_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  _profile_municipality uuid;
  _profile_role text;
BEGIN
  IF NEW.profile_id IS NULL OR NEW.is_active IS NOT TRUE OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.municipality_id,p.role
    INTO _profile_municipality,_profile_role
  FROM public.profiles p
  WHERE p.id=NEW.profile_id
  LIMIT 1;

  IF _profile_role IN ('admin_master','master_admin','master_ops') THEN
    RETURN NEW;
  END IF;

  IF _profile_municipality IS NULL THEN
    UPDATE public.profiles
       SET municipality_id=NEW.tenant_id,
           updated_at=now()
     WHERE id=NEW.profile_id;
    RETURN NEW;
  END IF;

  IF _profile_municipality <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Perfil vinculado a outra Prefeitura';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_profile_single_municipality()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
BEGIN
  IF coalesce(NEW.role,'') IN ('admin_master','master_admin','master_ops') THEN
    NEW.municipality_id := NULL;
    RETURN NEW;
  END IF;

  IF NEW.municipality_id IS NOT NULL THEN
    UPDATE public.tenant_memberships tm
       SET is_active=false,
           deleted_at=coalesce(tm.deleted_at,now()),
           updated_at=now()
     WHERE tm.profile_id=NEW.id
       AND tm.tenant_id<>NEW.municipality_id
       AND tm.is_active=true
       AND tm.deleted_at IS NULL;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.current_role_code()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
  with cp as (
    select p.id as profile_id,p.user_id,p.municipality_id,p.role
    from public.profiles p
    where p.id=public.current_profile_id()
    limit 1
  ),
  membership_role as (
    select r.code::text as code
    from cp
    join public.tenant_memberships tm
      on (
        tm.profile_id=cp.profile_id
        or (
          tm.profile_id is null
          and cp.user_id is not null
          and tm.user_id=cp.user_id
        )
      )
    join public.roles r on r.id=tm.role_id
    where tm.is_active=true
      and tm.deleted_at is null
      and (
        cp.role in ('admin_master','master_admin','master_ops')
        or cp.municipality_id=tm.tenant_id
      )
    order by
      case
        when r.code in ('master_admin','master_ops') then 100
        when r.code='prefeitura_admin' then 90
        when r.code='prefeitura_supervisor' then 80
        else 10
      end desc,
      tm.updated_at desc nulls last
    limit 1
  )
  select coalesce(
    (select code from membership_role),
    (select cp.role from cp limit 1)
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_master()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id=public.current_profile_id()
      AND p.deleted_at IS NULL
      AND p.account_status='active'
      AND coalesce(p.role,'') IN ('admin_master','master_admin','master_ops')
  )
$function$;

CREATE OR REPLACE FUNCTION public.get_current_profile_context()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'neon_auth'
 SET row_security TO 'off'
AS $function$
DECLARE
  _profile_id uuid := public.current_profile_id();
  _subject text := public.current_auth_subject();
  _auth_email text;
  _profile_municipality_id uuid;
  _profile_role text;
  _result jsonb;
BEGIN
  IF _profile_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.municipality_id,p.role
    INTO _profile_municipality_id,_profile_role
  FROM public.profiles p
  WHERE p.id=_profile_id
  LIMIT 1;

  SELECT lower(u.email) INTO _auth_email
  FROM neon_auth."user" u
  WHERE u.id::text=_subject
  LIMIT 1;

  WITH ranked_membership AS (
    SELECT
      tm.tenant_id,
      tm.level_name,
      r.code::text AS role_code,
      CASE
        WHEN r.code IN ('master_admin','master_ops') THEN 100
        WHEN r.code='prefeitura_admin' THEN 90
        WHEN r.code='prefeitura_supervisor' THEN 80
        WHEN r.code IN ('analista','financeiro','setor_intersetorial','fiscal') THEN 50
        ELSE 10
      END AS role_rank
    FROM public.tenant_memberships tm
    JOIN public.roles r ON r.id=tm.role_id
    WHERE tm.is_active=true
      AND tm.deleted_at IS NULL
      AND (
        tm.profile_id=_profile_id
        OR (
          tm.profile_id IS NULL
          AND tm.user_id=(SELECT p.user_id FROM public.profiles p WHERE p.id=_profile_id)
        )
      )
      AND (
        _profile_role IN ('admin_master','master_admin','master_ops')
        OR tm.tenant_id=_profile_municipality_id
      )
    ORDER BY role_rank DESC,tm.updated_at DESC NULLS LAST
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'profile_id',p.id,
    'legacy_user_id',p.user_id,
    'email',coalesce(_auth_email,p.email),
    'profile_email',p.email,
    'full_name',p.full_name,
    'role',coalesce((SELECT role_code FROM ranked_membership),public.current_role_code(),p.role),
    'profile_role',p.role,
    'municipality_id',CASE
      WHEN p.role IN ('admin_master','master_admin','master_ops') THEN NULL
      ELSE coalesce(p.municipality_id,(SELECT tenant_id FROM ranked_membership))
    END,
    'tenant_id',CASE
      WHEN p.role IN ('admin_master','master_admin','master_ops') THEN NULL
      ELSE (SELECT tenant_id FROM ranked_membership)
    END,
    'access_level',
      CASE
        WHEN coalesce((SELECT level_name FROM ranked_membership),'') ~ '(^|[^0-9])3([^0-9]|$)' THEN 3
        WHEN coalesce((SELECT level_name FROM ranked_membership),'') ~ '(^|[^0-9])2([^0-9]|$)' THEN 2
        WHEN coalesce((SELECT level_name FROM ranked_membership),'') ~ '(^|[^0-9])1([^0-9]|$)' THEN 1
        ELSE NULL
      END,
    'account_status',p.account_status,
    'professional_type',p.professional_type,
    'registration_number',p.registration_number,
    'company_name',p.company_name,
    'phone',p.phone,
    'deleted_at',p.deleted_at,
    'is_master',public.is_master()
  )
  INTO _result
  FROM public.profiles p
  WHERE p.id=_profile_id
  LIMIT 1;

  RETURN _result;
END;
$function$;

drop trigger if exists trg_enforce_membership_municipality_scope on public.tenant_memberships;
create trigger trg_enforce_membership_municipality_scope
before insert or update of tenant_id,profile_id,is_active,deleted_at
on public.tenant_memberships
for each row
execute function public.enforce_membership_municipality_scope();

drop trigger if exists trg_enforce_profile_single_municipality on public.profiles;
create trigger trg_enforce_profile_single_municipality
before update of municipality_id,role
on public.profiles
for each row
execute function public.enforce_profile_single_municipality();

commit;

notify pgrst, 'reload schema';
