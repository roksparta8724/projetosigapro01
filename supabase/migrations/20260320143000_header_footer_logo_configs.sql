alter table public.tenant_settings
  add column if not exists header_logo_scale double precision default 1,
  add column if not exists header_logo_offset_x double precision default 0,
  add column if not exists header_logo_offset_y double precision default 0,
  add column if not exists header_logo_frame_mode text default 'soft-square',
  add column if not exists header_logo_fit_mode text default 'contain',
  add column if not exists footer_logo_scale double precision default 1,
  add column if not exists footer_logo_offset_x double precision default 0,
  add column if not exists footer_logo_offset_y double precision default 0,
  add column if not exists footer_logo_frame_mode text default 'soft-square',
  add column if not exists footer_logo_fit_mode text default 'contain';

update public.tenant_settings
set
  header_logo_scale = coalesce(header_logo_scale, logo_scale, 1),
  header_logo_offset_x = coalesce(header_logo_offset_x, logo_offset_x, 0),
  header_logo_offset_y = coalesce(header_logo_offset_y, logo_offset_y, 0),
  header_logo_frame_mode = coalesce(header_logo_frame_mode, logo_frame_mode, 'soft-square'),
  header_logo_fit_mode = coalesce(header_logo_fit_mode, logo_fit_mode, 'contain'),
  footer_logo_scale = coalesce(footer_logo_scale, logo_scale, 1),
  footer_logo_offset_x = coalesce(footer_logo_offset_x, logo_offset_x, 0),
  footer_logo_offset_y = coalesce(footer_logo_offset_y, logo_offset_y, 0),
  footer_logo_frame_mode = coalesce(footer_logo_frame_mode, logo_frame_mode, 'soft-square'),
  footer_logo_fit_mode = coalesce(footer_logo_fit_mode, logo_fit_mode, 'contain');
