create or replace function public.current_role_code()
returns text
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  _code text;
begin
  select r.code::text
    into _code
  from public.tenant_memberships tm
  join public.roles r on r.id = tm.role_id
  where tm.user_id = auth.uid()
    and tm.is_active = true
    and tm.deleted_at is null
  order by tm.id
  limit 1;

  if _code is not null and length(trim(_code)) > 0 then
    return _code;
  end if;

  select p.role
    into _code
  from public.profiles p
  where p.user_id = auth.uid()
    and (p.deleted_at is null)
  order by p.updated_at desc nulls last, p.id
  limit 1;

  if _code is not null and length(trim(_code)) > 0 then
    return _code;
  end if;

  select (u.raw_user_meta_data->>'role')::text
    into _code
  from auth.users u
  where u.id = auth.uid();

  return nullif(trim(_code), '');
end;
$$;
