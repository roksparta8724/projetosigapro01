alter table public.municipalities enable row level security;
alter table public.municipality_branding enable row level security;
alter table public.municipality_settings enable row level security;

drop policy if exists "public_municipalities_read_active" on public.municipalities;
create policy "public_municipalities_read_active"
on public.municipalities
for select
to anon, authenticated
using (
  status is null
  or lower(status) in ('active', 'ativo', 'implementation', 'implantacao')
);

drop policy if exists "public_municipality_branding_read" on public.municipality_branding;
create policy "public_municipality_branding_read"
on public.municipality_branding
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.municipalities m
    where m.id = municipality_branding.municipality_id
      and (m.status is null or lower(m.status) in ('active', 'ativo', 'implementation', 'implantacao'))
  )
);

drop policy if exists "public_municipality_settings_read" on public.municipality_settings;
create policy "public_municipality_settings_read"
on public.municipality_settings
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.municipalities m
    where m.id = municipality_settings.municipality_id
      and (m.status is null or lower(m.status) in ('active', 'ativo', 'implementation', 'implantacao'))
  )
);
