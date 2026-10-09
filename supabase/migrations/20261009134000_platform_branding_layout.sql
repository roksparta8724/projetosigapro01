-- SIGAPRO: branding master compartilhado entre navegadores.
alter table public.platform_branding
  add column if not exists logo_alt text,
  add column if not exists footer_text text,
  add column if not exists header_logo_scale numeric not null default 1,
  add column if not exists header_logo_offset_x numeric not null default 0,
  add column if not exists header_logo_offset_y numeric not null default 0,
  add column if not exists header_logo_frame_mode text not null default 'soft-square',
  add column if not exists header_logo_fit_mode text not null default 'contain',
  add column if not exists footer_logo_scale numeric not null default 1,
  add column if not exists footer_logo_offset_x numeric not null default 0,
  add column if not exists footer_logo_offset_y numeric not null default 0,
  add column if not exists footer_logo_frame_mode text not null default 'soft-square',
  add column if not exists footer_logo_fit_mode text not null default 'contain';

alter table public.platform_branding
  drop constraint if exists platform_branding_header_frame_mode_check,
  add constraint platform_branding_header_frame_mode_check
    check (header_logo_frame_mode in ('soft-square','rounded')),
  drop constraint if exists platform_branding_header_fit_mode_check,
  add constraint platform_branding_header_fit_mode_check
    check (header_logo_fit_mode in ('contain','cover')),
  drop constraint if exists platform_branding_footer_frame_mode_check,
  add constraint platform_branding_footer_frame_mode_check
    check (footer_logo_frame_mode in ('soft-square','rounded')),
  drop constraint if exists platform_branding_footer_fit_mode_check,
  add constraint platform_branding_footer_fit_mode_check
    check (footer_logo_fit_mode in ('contain','cover'));
