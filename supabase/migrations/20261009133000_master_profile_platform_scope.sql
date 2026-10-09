-- SIGAPRO: perfis master pertencem à plataforma, não a uma Prefeitura específica.
-- O acesso global continua definido por is_master() e pelos memberships de plataforma.

update public.profiles p
   set municipality_id = null,
       updated_at = now()
 where p.municipality_id is not null
   and p.deleted_at is null
   and (
     coalesce(p.role,'') in ('admin_master','master_admin','master_ops')
     or exists (
       select 1
       from public.tenant_memberships tm
       join public.roles r on r.id=tm.role_id
       where tm.profile_id=p.id
         and tm.is_active=true
         and tm.deleted_at is null
         and r.code in ('master_admin','master_ops')
     )
   );
