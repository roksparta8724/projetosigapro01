-- SIGAPRO: canonicaliza papeis legados no ponto central de autorização.

create or replace function public.current_role_code()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
set row_security = off
as $function$
  with cp as (
    select public.current_profile_id() as profile_id
  ),
  membership_role as (
    select r.code::text as code
    from cp
    join public.tenant_memberships tm
      on tm.profile_id=cp.profile_id
      or (
        tm.profile_id is null
        and tm.user_id=(select p.user_id from public.profiles p where p.id=cp.profile_id)
      )
    join public.roles r on r.id=tm.role_id
    where tm.is_active=true
      and tm.deleted_at is null
    order by
      case
        when r.code::text in ('master_admin','master_ops','admin_master','master') then 100
        when r.code::text in ('prefeitura_admin','admin_prefeitura','admin_municipality') then 90
        when r.code::text in ('prefeitura_supervisor','secretario','diretor') then 80
        else 10
      end desc,
      tm.updated_at desc nulls last
    limit 1
  ),
  raw_role as (
    select coalesce(
      (select code from membership_role),
      (select p.role from public.profiles p join cp on cp.profile_id=p.id limit 1),
      ''
    ) as code
  )
  select case
    when code in ('admin_master','master') then 'master_admin'
    when code in ('admin_prefeitura','admin_municipality') then 'prefeitura_admin'
    when code in ('secretario','diretor') then 'prefeitura_supervisor'
    when code in ('profissional','professional') then 'profissional_externo'
    else code
  end
  from raw_role
$function$;

revoke all on function public.current_role_code() from public;
grant execute on function public.current_role_code() to authenticated;
