create extension if not exists "pgcrypto";

alter table if exists public.checklist_templates
  add column if not exists municipality_id uuid references public.municipalities(id) on delete set null;

create index if not exists idx_checklist_templates_municipality_id
  on public.checklist_templates (municipality_id);

update public.checklist_templates ct
set municipality_id = coalesce(
  ct.municipality_id,
  case
    when ct.tenant_id is not null
      and exists (
        select 1
        from public.municipalities m
        where m.id = ct.tenant_id
      )
    then ct.tenant_id
    else null
  end
)
where ct.municipality_id is null;

create or replace function public.can_access_profile_scope(_profile_municipality_id uuid, _profile_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    _profile_user_id = auth.uid()
    or public.is_admin_master()
    or (
      _profile_municipality_id is not null
      and _profile_municipality_id = public.current_municipality_id()
      and public.is_internal_municipality_role()
    )
$$;

alter table public.profiles enable row level security;
alter table public.checklist_templates enable row level security;

drop policy if exists "profiles_delete_scope" on public.profiles;
create policy "profiles_delete_scope"
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

drop policy if exists "profiles_select_scope_v2" on public.profiles;
create policy "profiles_select_scope_v2"
on public.profiles
for select
to authenticated
using (public.can_access_profile_scope(municipality_id, user_id));

drop policy if exists "profiles_update_scope_v2" on public.profiles;
create policy "profiles_update_scope_v2"
on public.profiles
for update
to authenticated
using (public.can_access_profile_scope(municipality_id, user_id))
with check (
  user_id = auth.uid()
  or public.is_admin_master()
  or (
    public.is_municipality_admin()
    and municipality_id = public.current_municipality_id()
  )
);

drop policy if exists "checklists visible by tenant" on public.checklist_templates;
drop policy if exists "checklist_templates_select_municipality_scope" on public.checklist_templates;
create policy "checklist_templates_select_municipality_scope"
on public.checklist_templates
for select
to authenticated
using (
  public.is_admin_master()
  or municipality_id is null
  or municipality_id = public.current_municipality_id()
);

drop policy if exists "checklist_templates_manage_municipality_scope" on public.checklist_templates;
create policy "checklist_templates_manage_municipality_scope"
on public.checklist_templates
for all
to authenticated
using (
  public.is_admin_master()
  or public.can_manage_municipality_scope(municipality_id)
)
with check (
  public.is_admin_master()
  or public.can_manage_municipality_scope(municipality_id)
);

drop policy if exists "processes_update_municipality_scope_v2" on public.processes;
create policy "processes_update_municipality_scope_v2"
on public.processes
for update
to authenticated
using (public.has_process_access(id))
with check (
  public.is_admin_master()
  or (
    municipality_id = public.current_municipality_id()
    and (
      public.is_internal_municipality_role()
      or created_by = auth.uid()
    )
  )
);

drop policy if exists "process_documents_update_municipality_scope_v2" on public.process_documents;
create policy "process_documents_update_municipality_scope_v2"
on public.process_documents
for update
to authenticated
using (public.has_process_access(process_id))
with check (
  public.is_admin_master()
  or (
    municipality_id = public.current_municipality_id()
    and (
      public.is_internal_municipality_role()
      or uploaded_by = auth.uid()
    )
  )
);

drop policy if exists "process_requirements_update_municipality_scope_v2" on public.process_requirements;
create policy "process_requirements_update_municipality_scope_v2"
on public.process_requirements
for update
to authenticated
using (public.has_process_access(process_id))
with check (
  public.is_admin_master()
  or (
    municipality_id = public.current_municipality_id()
    and (
      public.is_internal_municipality_role()
      or response_by = auth.uid()
      or exists (
        select 1
        from public.processes pr
        where pr.id = process_requirements.process_id
          and pr.created_by = auth.uid()
      )
    )
  )
);

drop policy if exists "audit_logs_delete_municipality_scope" on public.audit_logs;
create policy "audit_logs_delete_municipality_scope"
on public.audit_logs
for delete
to authenticated
using (public.is_admin_master());
