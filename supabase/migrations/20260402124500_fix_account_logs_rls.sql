alter table public.account_logs enable row level security;

drop policy if exists "admin full access logs" on public.account_logs;
drop policy if exists "user view own logs" on public.account_logs;
drop policy if exists "account_logs_insert_self_or_admin" on public.account_logs;

create policy "account_logs_read_scope"
on public.account_logs
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin_master()
  or public.is_municipality_admin()
);

create policy "account_logs_insert_scope"
on public.account_logs
for insert
to authenticated
with check (
  user_id = auth.uid()
  or public.is_admin_master()
  or public.is_municipality_admin()
);

create policy "account_logs_manage_scope"
on public.account_logs
for update
to authenticated
using (
  public.is_admin_master()
  or public.is_municipality_admin()
)
with check (
  public.is_admin_master()
  or public.is_municipality_admin()
);

create policy "account_logs_delete_scope"
on public.account_logs
for delete
to authenticated
using (
  public.is_admin_master()
  or public.is_municipality_admin()
);

create or replace function public.log_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  _log_user_id uuid;
begin
  _log_user_id := coalesce(new.user_id, old.user_id);

  if _log_user_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from auth.users u
    where u.id = _log_user_id
  ) then
    return new;
  end if;

  insert into public.account_logs(user_id, action, details)
  values (
    _log_user_id,
    'PROFILE_UPDATED',
    jsonb_build_object(
      'profile_id', new.id,
      'old', row_to_json(old),
      'new', row_to_json(new)
    )
  );

  return new;
end;
$$;
