insert into public.roles (code, label)
select 'property_owner'::public.platform_role, 'Proprietário do imóvel'
where not exists (
  select 1
  from public.roles
  where code = 'property_owner'::public.platform_role
);

create table if not exists public.project_owner_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.processes(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  professional_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  responded_by uuid,
  notes text
);

create table if not exists public.project_owner_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.processes(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  professional_user_id uuid not null references auth.users(id) on delete cascade,
  chat_enabled boolean not null default true,
  linked_at timestamptz not null default now(),
  linked_by uuid
);

create table if not exists public.owner_professional_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.processes(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  professional_user_id uuid not null references auth.users(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  is_system_message boolean not null default false
);

create index if not exists project_owner_requests_owner_idx on public.project_owner_requests(owner_user_id);
create index if not exists project_owner_requests_professional_idx on public.project_owner_requests(professional_user_id);
create index if not exists project_owner_links_owner_idx on public.project_owner_links(owner_user_id);
create index if not exists project_owner_links_professional_idx on public.project_owner_links(professional_user_id);
create index if not exists owner_professional_messages_owner_idx on public.owner_professional_messages(owner_user_id);
create index if not exists owner_professional_messages_professional_idx on public.owner_professional_messages(professional_user_id);

alter table public.project_owner_requests enable row level security;
alter table public.project_owner_links enable row level security;
alter table public.owner_professional_messages enable row level security;

drop policy if exists "owner requests read own" on public.project_owner_requests;
create policy "owner requests read own"
on public.project_owner_requests
for select
to authenticated
using (
  owner_user_id = auth.uid()
  or professional_user_id = auth.uid()
);

drop policy if exists "owner requests insert own" on public.project_owner_requests;
create policy "owner requests insert own"
on public.project_owner_requests
for insert
to authenticated
with check (
  owner_user_id = auth.uid()
);

drop policy if exists "owner requests update professional" on public.project_owner_requests;
create policy "owner requests update professional"
on public.project_owner_requests
for update
to authenticated
using (
  professional_user_id = auth.uid()
)
with check (
  professional_user_id = auth.uid()
);

drop policy if exists "owner links read own" on public.project_owner_links;
create policy "owner links read own"
on public.project_owner_links
for select
to authenticated
using (
  owner_user_id = auth.uid()
  or professional_user_id = auth.uid()
);

drop policy if exists "owner links insert professional" on public.project_owner_links;
create policy "owner links insert professional"
on public.project_owner_links
for insert
to authenticated
with check (
  professional_user_id = auth.uid()
);

drop policy if exists "owner links update professional" on public.project_owner_links;
create policy "owner links update professional"
on public.project_owner_links
for update
to authenticated
using (
  professional_user_id = auth.uid()
)
with check (
  professional_user_id = auth.uid()
);

drop policy if exists "owner messages read own" on public.owner_professional_messages;
create policy "owner messages read own"
on public.owner_professional_messages
for select
to authenticated
using (
  owner_user_id = auth.uid()
  or professional_user_id = auth.uid()
);

drop policy if exists "owner messages insert own" on public.owner_professional_messages;
create policy "owner messages insert own"
on public.owner_professional_messages
for insert
to authenticated
with check (
  sender_user_id = auth.uid()
  and (owner_user_id = auth.uid() or professional_user_id = auth.uid())
);
