alter table if exists public.profiles
  add column if not exists rg text,
  add column if not exists birth_date date,
  add column if not exists address_line text,
  add column if not exists address_number text,
  add column if not exists address_complement text,
  add column if not exists neighborhood text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists zip_code text;
