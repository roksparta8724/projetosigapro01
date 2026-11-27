-- SIGAPRO: only the canonical active platform owner can create an operator.
-- No email-only promotion, municipal takeover, password logging or session change.
create or replace function public.provision_platform_staff_account(
  _email text,
  _full_name text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','neon_auth'
set row_security to 'off'
as $body$
declare
  _actor uuid := public.current_profile_id();
  _email_normalized text := lower(btrim(coalesce(_email,'')));
  _name text := btrim(coalesce(_full_name,''));
  _auth_id text;
  _auth_banned boolean;
  _linked uuid;
  _profile_id uuid;
  _current_role text;
  _current_city uuid;
begin
  if _actor is null or not exists (
    select 1 from public.profiles p where p.id = _actor
      and p.deleted_at is null
      and p.account_status = 'active'
      and p.municipality_id is null
      and p.role in ('admin_master','master_admin')
  ) then
    raise exception 'Somente o Administrador Geral SIGAPRO pode cadastrar funcionarios' using errcode='42501';
  end if;

  if _email_normalized !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'E-mail invalido';
  end if;
  if length(_name) < 3 or length(_name) > 120 then
    raise exception 'Nome completo invalido';
  end if;

  select u.id::text, u.banned into _auth_id, _auth_banned
    from neon_auth."user" u
    where lower(btrim(u.email)) = _email_normalized
    limit 1;

  if _auth_id is null then
    return jsonb_build_object('ready',false,'reason','auth_missing');
  end if;
  if coalesce(_auth_banned,false) then
    raise exception 'Identidade Neon Auth bloqueada';
  end if;

  select pai.profile_id into _linked
  from public.profile_auth_identities pai
  where pai.provider='neon'
    and pai.provider_user_id=_auth_id
    and pai.is_active=true
  limit 1;

  if _linked is not null then
    select p.role,p.municipality_id into _current_role,_current_city
      from public.profiles p where p.id=_linked
        and p.account_status='active' and p.deleted_at is null;
    if _current_role='master_ops' and _current_city is null then
      return jsonb_build_object('ready',true,'profile_id',_linked,'email',_email_normalized);
    end if;
    raise exception 'Conta ja vinculada a outro perfil; promocao automatica proibida';
  end if;

  if exists (
    select 1 from public.profiles p
    where lower(btrim(coalesce(p.email,'')))=_email_normalized
      and p.deleted_at is null
  ) then
    raise exception 'E-mail ja cadastrado em outro perfil; requer revisao manual';
  end if;

  insert into public.profiles(full_name,email,tipo,role,account_status,municipality_id,updated_at)
  values(_name,_email_normalized,'interno','master_ops','active',null,now())
  returning id into _profile_id;

  insert into public.profile_auth_identities(profile_id,provider,provider_user_id,is_active,last_used_at)
  values(_profile_id,'neon',_auth_id,true,now());

  return jsonb_build_object('ready',true,'profile_id',_profile_id,'email',_email_normalized);
end;
$body$;

revoke all on function public.provision_platform_staff_account(text,text) from public;
grant execute on function public.provision_platform_staff_account(text,text) to authenticated;
