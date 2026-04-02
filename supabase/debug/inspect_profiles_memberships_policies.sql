SELECT c.relname as table_name,
       c.relrowsecurity as rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('profiles','tenant_memberships','account_logs');

SELECT p.schemaname, p.tablename, p.policyname, p.cmd, p.qual, p.with_check
FROM pg_policies p
WHERE p.schemaname = 'public'
  AND p.tablename IN ('profiles','tenant_memberships','account_logs')
ORDER BY p.tablename, p.policyname;

SELECT tg.tgname AS trigger_name,
       c.relname AS table_name,
       pg_get_triggerdef(tg.oid, true) AS definition
FROM pg_trigger tg
JOIN pg_class c ON c.oid = tg.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('profiles','tenant_memberships','account_logs')
  AND NOT tg.tgisinternal
ORDER BY c.relname, tg.tgname;
