-- Force create platform_branding if missing (idempotent)
create table if not exists public.platform_branding (
  id uuid primary key default gen_random_uuid(),
  platform_key text not null default 'sigapro',
  logo_url text,
  logo_object_key text,
  logo_file_name text,
  logo_mime_type text,
  header_logo_url text,
  header_logo_object_key text,
  header_logo_file_name text,
  header_logo_mime_type text,
  footer_logo_url text,
  footer_logo_object_key text,
  footer_logo_file_name text,
  footer_logo_mime_type text,
  updated_at timestamptz default now(),
  updated_by uuid
);

create unique index if not exists platform_branding_platform_key_idx
  on public.platform_branding (platform_key);

alter table public.platform_branding enable row level security;

-- Allow authenticated users to read platform branding
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'platform_branding'
      and policyname = 'platform_branding_read'
  ) then
    create policy platform_branding_read
      on public.platform_branding
      for select
      to authenticated
      using (true);
  end if;
end $$;
