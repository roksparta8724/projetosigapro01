alter table public.profiles
  add column if not exists avatar_scale numeric(8,2) default 1,
  add column if not exists avatar_offset_x integer default 0,
  add column if not exists avatar_offset_y integer default 0;
