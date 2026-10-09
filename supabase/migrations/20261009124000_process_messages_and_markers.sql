-- SIGAPRO: alinha estruturas de mensagens e marcadores ao ambiente oficial.

create table if not exists public.process_markers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  process_id uuid not null references public.processes(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  color text not null default '#2563eb' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  municipality_id uuid references public.municipalities(id) on delete set null
);

create unique index if not exists process_markers_process_label_uidx
  on public.process_markers(process_id, lower(label));

alter table public.process_markers enable row level security;

drop policy if exists process_markers_select_scoped on public.process_markers;
create policy process_markers_select_scoped
  on public.process_markers
  for select
  to authenticated
  using (public.has_process_access(process_id));

revoke all on table public.process_markers from authenticated;
grant select on table public.process_markers to authenticated;

create table if not exists public.process_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  process_id uuid not null references public.processes(id) on delete cascade,
  sender_user_id uuid,
  sender_profile_id uuid references public.profiles(id) on delete set null,
  sender_name text not null,
  sender_role text not null,
  audience text not null default 'misto'
    check (audience in ('interno','externo','misto')),
  recipient_name text,
  message text not null check (char_length(message) between 1 and 4000),
  created_at timestamptz not null default now(),
  municipality_id uuid references public.municipalities(id) on delete set null
);

alter table public.process_messages enable row level security;

drop policy if exists process_messages_select_scoped on public.process_messages;
create policy process_messages_select_scoped
  on public.process_messages
  for select
  to authenticated
  using (
    public.has_process_access(process_id)
    and (
      public.is_master()
      or public.is_internal_municipality_role()
      or audience in ('externo','misto')
    )
  );

revoke all on table public.process_messages from authenticated;
grant select on table public.process_messages to authenticated;
