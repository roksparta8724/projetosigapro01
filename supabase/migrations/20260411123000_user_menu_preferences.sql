create table if not exists public.user_menu_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  hidden_items text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.user_menu_preferences enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_menu_preferences'
      and policyname = 'user_menu_preferences_select_own'
  ) then
    create policy user_menu_preferences_select_own
      on public.user_menu_preferences
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_menu_preferences'
      and policyname = 'user_menu_preferences_upsert_own'
  ) then
    create policy user_menu_preferences_upsert_own
      on public.user_menu_preferences
      for insert
      to authenticated
      with check (auth.uid() = user_id);

    create policy user_menu_preferences_update_own
      on public.user_menu_preferences
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;
