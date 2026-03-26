insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
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

create policy "process documents read public"
on storage.objects
for select
to public
using (bucket_id = 'process-documents');

create policy "process documents upload authenticated"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'process-documents');

create policy "process documents update authenticated"
on storage.objects
for update
to authenticated
using (bucket_id = 'process-documents')
with check (bucket_id = 'process-documents');

create policy "profile assets read public"
on storage.objects
for select
to public
using (bucket_id = 'profile-assets');

create policy "profile assets upload authenticated"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'profile-assets');

create policy "profile assets update authenticated"
on storage.objects
for update
to authenticated
using (bucket_id = 'profile-assets')
with check (bucket_id = 'profile-assets');
