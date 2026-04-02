with _ as (
  select
    set_config('request.jwt.claim.sub', '17b9f386-cf7a-4f92-8646-e3944d28eb4f', true),
    set_config('request.jwt.claim.role', 'authenticated', true),
    set_config('request.jwt.claims', '{"role":"authenticated","sub":"17b9f386-cf7a-4f92-8646-e3944d28eb4f"}', true)
)
insert into public.account_logs(user_id, action, details)
values ('17b9f386-cf7a-4f92-8646-e3944d28eb4f', 'TEST', '{}'::jsonb)
returning id;
