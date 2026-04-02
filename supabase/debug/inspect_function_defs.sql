select p.proname,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'current_municipality_id',
    'current_role_code',
    'is_admin_master',
    'is_municipality_admin',
    'is_master_user',
    'is_tenant_member',
    'has_process_access',
    'can_manage_municipality_scope',
    'can_access_municipality_scope',
    'can_access_profile_scope',
    'is_internal_municipality_role'
  )
order by p.proname;
