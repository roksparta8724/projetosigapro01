-- Compatibilidade segura entre perfis Neon Auth e tabelas legadas que ainda
-- mantêm FK para auth.users. Perfis nativos do Neon usam profile_auth_identities
-- e podem não existir em auth.users; nesse caso actor_user_id deve ficar NULL
-- e actor_profile_id continua registrando o responsável corretamente.

create or replace function public.current_legacy_user_id()
returns uuid
language sql
stable
security definer
set search_path to 'pg_catalog','public'
as $function$
  select case
    when p.user_id is not null
      and exists (
        select 1
        from auth.users u
        where u.id=p.user_id
      )
    then p.user_id
    else null
  end
  from public.profiles p
  where p.id=public.current_profile_id()
    and p.deleted_at is null
    and p.account_status='active'
  limit 1
$function$;

notify pgrst, 'reload schema';
