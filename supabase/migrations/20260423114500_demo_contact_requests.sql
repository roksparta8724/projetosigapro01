create extension if not exists pgcrypto;

create table if not exists public.demo_contact_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text not null,
  organization text not null,
  role_title text not null,
  message text,
  origin text not null default 'demo_modal_contact',
  interest text not null default 'apresentacao_sigapro',
  status text not null default 'new',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint demo_contact_requests_origin_check check (origin in ('demo_modal_contact', 'solicitacao_demonstracao')),
  constraint demo_contact_requests_status_check check (status in ('new', 'contacted', 'qualified', 'archived'))
);

create index if not exists idx_demo_contact_requests_created_at
  on public.demo_contact_requests (created_at desc);

create index if not exists idx_demo_contact_requests_status
  on public.demo_contact_requests (status);

drop trigger if exists trg_demo_contact_requests_touch_updated_at on public.demo_contact_requests;
create trigger trg_demo_contact_requests_touch_updated_at
  before update on public.demo_contact_requests
  for each row
  execute function public.touch_updated_at();

alter table public.demo_contact_requests enable row level security;

drop policy if exists "Public can submit demo contact requests" on public.demo_contact_requests;
create policy "Public can submit demo contact requests"
  on public.demo_contact_requests
  for insert
  to anon, authenticated
  with check (
    length(trim(full_name)) > 1
    and position('@' in email) > 1
    and length(trim(phone)) > 4
    and length(trim(organization)) > 1
    and length(trim(role_title)) > 1
    and origin in ('demo_modal_contact', 'solicitacao_demonstracao')
  );

drop policy if exists "Master can manage demo contact requests" on public.demo_contact_requests;
create policy "Master can manage demo contact requests"
  on public.demo_contact_requests
  for all
  to authenticated
  using (public.is_admin_master())
  with check (public.is_admin_master());

grant insert on public.demo_contact_requests to anon, authenticated;
grant select, update, delete on public.demo_contact_requests to authenticated;
