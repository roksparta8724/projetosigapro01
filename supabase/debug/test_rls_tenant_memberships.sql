with _ as (
  select
    set_config('request.jwt.claim.sub', '17b9f386-cf7a-4f92-8646-e3944d28eb4f', true),
    set_config('request.jwt.claim.role', 'authenticated', true),
    set_config('request.jwt.claims', '{"role":"authenticated","sub":"17b9f386-cf7a-4f92-8646-e3944d28eb4f"}', true)
)
select id, tenant_id, user_id, role_id, is_active, deleted_at
from public.tenant_memberships
where user_id = '17b9f386-cf7a-4f92-8646-e3944d28eb4f';
