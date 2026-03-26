do $$
begin
  if to_regclass('public.account_logs') is null then
    create table public.account_logs (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      action text not null,
      details jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  end if;
end
$$;

alter table if exists public.account_logs
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists user_id uuid,
  add column if not exists action text,
  add column if not exists details jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'account_logs'
      and column_name = 'user_id'
  ) then
    begin
      alter table public.account_logs
        drop constraint if exists account_logs_user_id_fkey;
    exception
      when undefined_table then
        null;
    end;

    alter table public.account_logs
      alter column user_id drop not null;

    delete from public.account_logs al
    where al.user_id is not null
      and not exists (
        select 1
        from auth.users u
        where u.id = al.user_id
      );

    alter table public.account_logs
      add constraint account_logs_user_id_fkey
      foreign key (user_id)
      references auth.users(id)
      on delete cascade;

    alter table public.account_logs
      alter column user_id set not null;
  end if;
end
$$;

create index if not exists idx_account_logs_user_id
  on public.account_logs (user_id);

create index if not exists idx_account_logs_created_at
  on public.account_logs (created_at desc);

create or replace function public.log_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
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

drop trigger if exists profile_update_log on public.profiles;

create trigger profile_update_log
after update on public.profiles
for each row
execute function public.log_profile_update();
