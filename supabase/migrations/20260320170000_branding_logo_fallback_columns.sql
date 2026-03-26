alter table if exists public.tenant_branding
  add column if not exists logo_scale double precision default 1,
  add column if not exists logo_offset_x double precision default 0,
  add column if not exists logo_offset_y double precision default 0,
  add column if not exists header_logo_scale double precision default 1,
  add column if not exists header_logo_offset_x double precision default 0,
  add column if not exists header_logo_offset_y double precision default 0,
  add column if not exists footer_logo_scale double precision default 1,
  add column if not exists footer_logo_offset_x double precision default 0,
  add column if not exists footer_logo_offset_y double precision default 0,
  add column if not exists logo_alt text,
  add column if not exists logo_updated_at timestamptz,
  add column if not exists logo_updated_by uuid,
  add column if not exists logo_frame_mode text default 'soft-square',
  add column if not exists logo_fit_mode text default 'contain',
  add column if not exists header_logo_frame_mode text default 'soft-square',
  add column if not exists header_logo_fit_mode text default 'contain',
  add column if not exists footer_logo_frame_mode text default 'soft-square',
  add column if not exists footer_logo_fit_mode text default 'contain';

update public.tenant_branding
set
  logo_scale = coalesce(logo_scale, 1),
  logo_offset_x = coalesce(logo_offset_x, 0),
  logo_offset_y = coalesce(logo_offset_y, 0),
  header_logo_scale = coalesce(header_logo_scale, logo_scale, 1),
  header_logo_offset_x = coalesce(header_logo_offset_x, logo_offset_x, 0),
  header_logo_offset_y = coalesce(header_logo_offset_y, logo_offset_y, 0),
  footer_logo_scale = coalesce(footer_logo_scale, logo_scale, 1),
  footer_logo_offset_x = coalesce(footer_logo_offset_x, logo_offset_x, 0),
  footer_logo_offset_y = coalesce(footer_logo_offset_y, logo_offset_y, 0),
  header_logo_frame_mode = coalesce(header_logo_frame_mode, logo_frame_mode, 'soft-square'),
  header_logo_fit_mode = coalesce(header_logo_fit_mode, logo_fit_mode, 'contain'),
  footer_logo_frame_mode = coalesce(footer_logo_frame_mode, logo_frame_mode, 'soft-square'),
  footer_logo_fit_mode = coalesce(footer_logo_fit_mode, logo_fit_mode, 'contain');

drop policy if exists "tenant admins manage branding" on public.tenant_branding;

create policy "tenant admins manage branding"
on public.tenant_branding
for all
to authenticated
using (
  public.is_master_user(auth.uid())
  or exists (
    select 1
    from public.tenant_memberships tm
    join public.roles r on r.id = tm.role_id
    where tm.user_id = auth.uid()
      and tm.tenant_id = tenant_branding.tenant_id
      and tm.is_active = true
      and tm.deleted_at is null
      and r.code = 'prefeitura_admin'
  )
)
with check (
  public.is_master_user(auth.uid())
  or exists (
    select 1
    from public.tenant_memberships tm
    join public.roles r on r.id = tm.role_id
    where tm.user_id = auth.uid()
      and tm.tenant_id = tenant_branding.tenant_id
      and tm.is_active = true
      and tm.deleted_at is null
      and r.code = 'prefeitura_admin'
  )
);
