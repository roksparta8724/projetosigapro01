select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'municipalities',
    'municipality_branding',
    'municipality_settings',
    'tenant_settings',
    'tenant_branding',
    'tenants',
    'profiles',
    'tenant_memberships',
    'roles',
    'processes',
    'process_documents',
    'process_requirements',
    'process_movements',
    'process_audit_entries',
    'process_reopen_history',
    'payment_guides',
    'properties',
    'process_parties',
    'project_owner_requests',
    'project_owner_links',
    'owner_professional_messages'
  )
order by tablename, policyname;
