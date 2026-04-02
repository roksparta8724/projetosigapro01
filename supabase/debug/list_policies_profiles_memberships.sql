SELECT p.schemaname, p.tablename, p.policyname, p.cmd, p.qual, p.with_check
FROM pg_policies p
WHERE p.schemaname = 'public' AND p.tablename IN ('profiles','tenant_memberships','account_logs')
ORDER BY p.tablename, p.policyname;
