select n.nspname as schema,
       p.proname as name,
       pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'is_admin_master',
    'is_municipality_admin',
    'current_municipality_id',
    'is_master_user',
    'is_tenant_member',
    'current_role_code',
    'has_process_access',
    'can_manage_municipality_scope',
    'can_access_municipality_scope',
    'can_access_profile_scope',
    'is_internal_municipality_role'
  )
order by name;
