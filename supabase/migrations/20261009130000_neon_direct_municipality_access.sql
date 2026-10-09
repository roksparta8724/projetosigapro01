-- SIGAPRO: acesso municipal compatível com Better Auth/Neon.
-- Um perfil ativo vinculado diretamente ao município deve poder operar nesse escopo,
-- mesmo quando não existe tenant_membership legado.

create or replace function public.has_tenant_access(target_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
set row_security = off
as $function$
  with cp as (
    select
      p.id as profile_id,
      p.user_id as legacy_user_id,
      p.municipality_id
    from public.profiles p
    where p.id=public.current_profile_id()
      and p.deleted_at is null
      and p.account_status='active'
    limit 1
  )
  select
    public.is_master()
    or exists (
      select 1
      from cp
      where cp.municipality_id=target_tenant
    )
    or exists (
      select 1
      from cp
      join public.tenant_memberships tm
        on tm.profile_id=cp.profile_id
        or (
          tm.profile_id is null
          and cp.legacy_user_id is not null
          and tm.user_id=cp.legacy_user_id
        )
      where tm.tenant_id=target_tenant
        and tm.is_active=true
        and tm.deleted_at is null
    )
$function$;

revoke all on function public.has_tenant_access(uuid) from public;
grant execute on function public.has_tenant_access(uuid) to authenticated;
