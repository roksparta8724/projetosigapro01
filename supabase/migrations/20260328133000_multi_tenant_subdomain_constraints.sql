alter table if exists public.municipalities
  add column if not exists subdomain text;

create unique index if not exists municipalities_subdomain_unique
  on public.municipalities (lower(subdomain));

alter table public.municipalities
  drop constraint if exists municipalities_subdomain_reserved_check;

alter table public.municipalities
  add constraint municipalities_subdomain_reserved_check
  check (
    subdomain is null
    or lower(subdomain) not in (
      'www',
      'app',
      'admin',
      'api',
      'support',
      'docs',
      'mail',
      'root',
      'status',
      'auth'
    )
  );
