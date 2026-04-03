-- Ensure required storage buckets exist (idempotent)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'institutional-branding',
    'institutional-branding',
    true,
    10485760,
    array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
  ),
  (
    'process-documents',
    'process-documents',
    true,
    52428800,
    array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
  ),
  (
    'profile-assets',
    'profile-assets',
    true,
    10485760,
    array['image/png', 'image/jpeg', 'image/webp']
  )
on conflict (id) do nothing;

alter table if exists storage.objects enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'sigapro branding read public'
  ) then
    create policy "sigapro branding read public"
    on storage.objects
    for select
    to public
    using (bucket_id = 'institutional-branding');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'sigapro branding upload authenticated'
  ) then
    create policy "sigapro branding upload authenticated"
    on storage.objects
    for insert
    to authenticated
    with check (bucket_id = 'institutional-branding');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'sigapro branding update authenticated'
  ) then
    create policy "sigapro branding update authenticated"
    on storage.objects
    for update
    to authenticated
    using (bucket_id = 'institutional-branding')
    with check (bucket_id = 'institutional-branding');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'sigapro branding delete authenticated'
  ) then
    create policy "sigapro branding delete authenticated"
    on storage.objects
    for delete
    to authenticated
    using (bucket_id = 'institutional-branding');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'sigapro process documents read public'
  ) then
    create policy "sigapro process documents read public"
    on storage.objects
    for select
    to public
    using (bucket_id = 'process-documents');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'sigapro process documents upload authenticated'
  ) then
    create policy "sigapro process documents upload authenticated"
    on storage.objects
    for insert
    to authenticated
    with check (bucket_id = 'process-documents');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'sigapro process documents update authenticated'
  ) then
    create policy "sigapro process documents update authenticated"
    on storage.objects
    for update
    to authenticated
    using (bucket_id = 'process-documents')
    with check (bucket_id = 'process-documents');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'sigapro process documents delete authenticated'
  ) then
    create policy "sigapro process documents delete authenticated"
    on storage.objects
    for delete
    to authenticated
    using (bucket_id = 'process-documents');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'sigapro profile assets read public'
  ) then
    create policy "sigapro profile assets read public"
    on storage.objects
    for select
    to public
    using (bucket_id = 'profile-assets');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'sigapro profile assets upload authenticated'
  ) then
    create policy "sigapro profile assets upload authenticated"
    on storage.objects
    for insert
    to authenticated
    with check (bucket_id = 'profile-assets');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'sigapro profile assets update authenticated'
  ) then
    create policy "sigapro profile assets update authenticated"
    on storage.objects
    for update
    to authenticated
    using (bucket_id = 'profile-assets')
    with check (bucket_id = 'profile-assets');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'sigapro profile assets delete authenticated'
  ) then
    create policy "sigapro profile assets delete authenticated"
    on storage.objects
    for delete
    to authenticated
    using (bucket_id = 'profile-assets');
  end if;
end $$;
