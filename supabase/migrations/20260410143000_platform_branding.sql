-- =============================================================================
-- Platform branding table (master/SIGAPRO)
-- =============================================================================

create table if not exists public.platform_branding (
  platform_key text primary key,
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

create index if not exists platform_branding_updated_at_idx
  on public.platform_branding (updated_at desc);

alter table public.platform_branding enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'platform_branding'
      and policyname = 'platform_branding_authenticated'
  ) then
    create policy platform_branding_authenticated
      on public.platform_branding
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;
