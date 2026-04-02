SELECT c.relname as table_name,
       c.relrowsecurity as rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('profiles','tenant_memberships','account_logs')
ORDER BY c.relname;
