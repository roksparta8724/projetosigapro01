alter table if exists public.tenant_settings
  add column if not exists logo_alt text,
  add column if not exists logo_updated_at timestamptz,
  add column if not exists logo_updated_by uuid,
  add column if not exists logo_frame_mode text default 'soft-square',
  add column if not exists logo_fit_mode text default 'contain';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'institutional-branding',
  'institutional-branding',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do nothing;

drop policy if exists "institutional branding read public" on storage.objects;
create policy "institutional branding read public"
on storage.objects
for select
to public
using (bucket_id = 'institutional-branding');

drop policy if exists "institutional branding upload authenticated" on storage.objects;
create policy "institutional branding upload authenticated"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'institutional-branding'
  and (
    public.is_master_user(auth.uid())
    or exists (
      select 1
      from public.tenant_memberships tm
      join public.roles r on r.id = tm.role_id
      where tm.user_id = auth.uid()
        and tm.is_active = true
        and tm.deleted_at is null
        and r.code = 'prefeitura_admin'
        and split_part(name, '/', 1) = tm.tenant_id::text
    )
  )
);

drop policy if exists "institutional branding update authenticated" on storage.objects;
create policy "institutional branding update authenticated"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'institutional-branding'
  and (
    public.is_master_user(auth.uid())
    or exists (
      select 1
      from public.tenant_memberships tm
      join public.roles r on r.id = tm.role_id
      where tm.user_id = auth.uid()
        and tm.is_active = true
        and tm.deleted_at is null
        and r.code = 'prefeitura_admin'
        and split_part(name, '/', 1) = tm.tenant_id::text
    )
  )
)
with check (
  bucket_id = 'institutional-branding'
  and (
    public.is_master_user(auth.uid())
    or exists (
      select 1
      from public.tenant_memberships tm
      join public.roles r on r.id = tm.role_id
      where tm.user_id = auth.uid()
        and tm.is_active = true
        and tm.deleted_at is null
        and r.code = 'prefeitura_admin'
        and split_part(name, '/', 1) = tm.tenant_id::text
    )
  )
);

drop policy if exists "institutional branding delete authenticated" on storage.objects;
create policy "institutional branding delete authenticated"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'institutional-branding'
  and (
    public.is_master_user(auth.uid())
    or exists (
      select 1
      from public.tenant_memberships tm
      join public.roles r on r.id = tm.role_id
      where tm.user_id = auth.uid()
        and tm.is_active = true
        and tm.deleted_at is null
        and r.code = 'prefeitura_admin'
        and split_part(name, '/', 1) = tm.tenant_id::text
    )
  )
);
