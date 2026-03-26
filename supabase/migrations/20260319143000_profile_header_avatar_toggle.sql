alter table if exists public.profiles
  add column if not exists use_avatar_in_header boolean not null default false;
