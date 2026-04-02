alter table public.profiles
  add column if not exists role text,
  add column if not exists deleted_at timestamptz;

alter table public.tenant_memberships
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'tenant_memberships')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end
$$;

alter table public.profiles enable row level security;
alter table public.tenant_memberships enable row level security;

create policy "profiles_select_scope_v3"
on public.profiles
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin_master()
  or (
    public.is_municipality_admin()
    and municipality_id = public.current_municipality_id()
  )
);

create policy "profiles_insert_scope_v3"
on public.profiles
for insert
to authenticated
with check (
  user_id = auth.uid()
  or public.is_admin_master()
  or (
    public.is_municipality_admin()
    and municipality_id = public.current_municipality_id()
  )
);

create policy "profiles_update_scope_v3"
on public.profiles
for update
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin_master()
  or (
    public.is_municipality_admin()
    and municipality_id = public.current_municipality_id()
  )
)
with check (
  user_id = auth.uid()
  or public.is_admin_master()
  or (
    public.is_municipality_admin()
    and municipality_id = public.current_municipality_id()
  )
);

create policy "profiles_delete_scope_v3"
on public.profiles
for delete
to authenticated
using (
  public.is_admin_master()
  or (
    public.is_municipality_admin()
    and municipality_id = public.current_municipality_id()
  )
);

create policy "tenant_memberships_select_scope_v3"
on public.tenant_memberships
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin_master()
  or (
    public.is_municipality_admin()
    and tenant_id = public.current_municipality_id()
  )
);

create policy "tenant_memberships_insert_scope_v3"
on public.tenant_memberships
for insert
to authenticated
with check (
  public.is_admin_master()
  or (
    public.is_municipality_admin()
    and tenant_id = public.current_municipality_id()
  )
);

create policy "tenant_memberships_update_scope_v3"
on public.tenant_memberships
for update
to authenticated
using (
  public.is_admin_master()
  or (
    public.is_municipality_admin()
    and tenant_id = public.current_municipality_id()
  )
)
with check (
  public.is_admin_master()
  or (
    public.is_municipality_admin()
    and tenant_id = public.current_municipality_id()
  )
);

create policy "tenant_memberships_delete_scope_v3"
on public.tenant_memberships
for delete
to authenticated
using (
  public.is_admin_master()
  or (
    public.is_municipality_admin()
    and tenant_id = public.current_municipality_id()
  )
);

create index if not exists idx_tenant_memberships_user_id
  on public.tenant_memberships (user_id);

create index if not exists idx_tenant_memberships_tenant_id
  on public.tenant_memberships (tenant_id);
