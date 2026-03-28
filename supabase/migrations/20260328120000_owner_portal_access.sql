-- Proprietario do imovel: solicitacoes, vinculos e mensagens
insert into public.roles (code, label, access_level)
values ('property_owner', 'Proprietario do imovel', 1)
on conflict (code) do nothing;

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

create or replace function public.register_property_owner_account(
  _tenant_id uuid,
  _full_name text,
  _email text,
  _cpf_cnpj text default null,
  _phone text default null,
  _title text default null,
  _bio text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _user_id uuid := auth.uid();
  _tenant public.tenants%rowtype;
  _role_id uuid;
begin
  if _user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select *
    into _tenant
    from public.tenants
   where id = _tenant_id
   limit 1;

  if _tenant.id is null then
    raise exception 'Prefeitura nao encontrada';
  end if;

  if _tenant.status in ('suspenso', 'encerrado') then
    raise exception 'Prefeitura indisponivel para novos cadastros';
  end if;

  select id
    into _role_id
    from public.roles
   where code = 'property_owner'
   limit 1;

  if _role_id is null then
    raise exception 'Papel property_owner nao encontrado';
  end if;

  insert into public.profiles (
    user_id,
    full_name,
    email,
    cpf_cnpj,
    document_masked,
    phone,
    bio
  )
  values (
    _user_id,
    _full_name,
    _email,
    _cpf_cnpj,
    case
      when _cpf_cnpj is null or length(regexp_replace(_cpf_cnpj, '\D', '', 'g')) < 4 then null
      else '***' || right(regexp_replace(_cpf_cnpj, '\D', '', 'g'), 4)
    end,
    _phone,
    _bio
  )
  on conflict (user_id) do update
    set full_name = excluded.full_name,
        email = excluded.email,
        cpf_cnpj = excluded.cpf_cnpj,
        document_masked = excluded.document_masked,
        phone = excluded.phone,
        bio = excluded.bio,
        updated_at = now(),
        deleted_at = null;

  insert into public.tenant_memberships (
    tenant_id,
    user_id,
    role_id,
    department,
    queue_name,
    level_name,
    is_active,
    deleted_at
  )
  values (
    _tenant_id,
    _user_id,
    _role_id,
    coalesce(_title, 'Proprietario do imovel'),
    'Portal do proprietario',
    'Nivel 1',
    true,
    null
  )
  on conflict (tenant_id, user_id, role_id) do update
    set department = excluded.department,
        queue_name = excluded.queue_name,
        level_name = excluded.level_name,
        is_active = true,
        deleted_at = null;

  return jsonb_build_object(
    'user_id', _user_id,
    'tenant_id', _tenant_id,
    'role', 'property_owner'
  );
end;
$$;

grant execute on function public.register_property_owner_account(uuid, text, text, text, text, text, text) to authenticated;
