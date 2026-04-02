-- Simula contexto de JWT para RLS
select set_config('request.jwt.claim.sub', '17b9f386-cf7a-4f92-8646-e3944d28eb4f', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"17b9f386-cf7a-4f92-8646-e3944d28eb4f"}', true);
set local role authenticated;

select id, user_id, role, municipality_id from public.profiles where user_id = '17b9f386-cf7a-4f92-8646-e3944d28eb4f';
select id, tenant_id, user_id, role_id, is_active from public.tenant_memberships where user_id = '17b9f386-cf7a-4f92-8646-e3944d28eb4f';
