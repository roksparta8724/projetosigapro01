-- SIGAPRO Neon-first compatibility hardening
-- Target: Neon PostgreSQL + Neon Data API.
-- Do NOT run this file against Supabase.
-- Idempotent by design.

begin;

create or replace function public.current_auth_subject()
returns text
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
  select coalesce(
    nullif(btrim((nullif(current_setting('request.jwt.claims', true), ''))::jsonb ->> 'sub'), ''),
    nullif(btrim(current_setting('request.jwt.claim.sub', true)), '')
  );
$function$;

create or replace function public.log_profile_update()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
set row_security to 'off'
as $function$
declare
  _legacy_user_id uuid := coalesce(new.user_id, old.user_id);
  _target_profile_id uuid := coalesce(new.id, old.id);
  _actor_profile_id uuid := public.current_profile_id();
  _old_safe jsonb;
  _new_safe jsonb;
begin
  if _legacy_user_id is not null
     and not exists (select 1 from auth.users au where au.id = _legacy_user_id) then
    _legacy_user_id := null;
  end if;

  _old_safe := to_jsonb(old)
    - array['cpf','cpf_cnpj','document_masked','phone','telefone','blocked_by','blocked_by_profile_id'];
  _new_safe := to_jsonb(new)
    - array['cpf','cpf_cnpj','document_masked','phone','telefone','blocked_by','blocked_by_profile_id'];

  insert into public.account_logs(profile_id,user_id,action,details)
  values(
    _target_profile_id,
    _legacy_user_id,
    'PROFILE_UPDATED',
    jsonb_build_object(
      'profile_id',_target_profile_id,
      'actor_profile_id',_actor_profile_id,
      'old',_old_safe,
      'new',_new_safe
    )
  );

  return new;
end;
$function$;

grant usage on schema public to anonymous;
grant select on public.municipalities to anonymous;
grant select on public.municipality_branding to anonymous;

drop policy if exists municipalities_select_public on public.municipalities;
create policy municipalities_select_public
  on public.municipalities
  for select
  to anonymous
  using (status is null or lower(status) in ('active','ativo','implementation','implantacao'));

drop policy if exists municipality_branding_select_public on public.municipality_branding;
create policy municipality_branding_select_public
  on public.municipality_branding
  for select
  to anonymous
  using (
    exists (
      select 1
      from public.municipalities m
      where m.id = municipality_branding.municipality_id
        and (m.status is null or lower(m.status) in ('active','ativo','implementation','implantacao'))
    )
  );

-- municipality_settings intentionally remains private before authentication.
revoke all on public.municipality_settings from anonymous;

grant select on public.tenant_memberships to authenticated;

drop policy if exists tenant_memberships_select_scoped on public.tenant_memberships;
create policy tenant_memberships_select_scoped
  on public.tenant_memberships
  for select
  to authenticated
  using (
    tenant_memberships.profile_id = public.current_profile_id()
    or exists (
      select 1
      from public.profiles p
      where p.id = public.current_profile_id()
        and p.user_id is not null
        and p.user_id = tenant_memberships.user_id
    )
    or public.can_manage_tenant(tenant_memberships.tenant_id)
  );

commit;
