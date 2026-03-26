create extension if not exists "pgcrypto";

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  where p.user_id = auth.uid()
    and p.deleted_at is null
  order by p.updated_at desc nulls last, p.id
  limit 1
$$;

create or replace function public.current_municipality_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.municipality_id
  from public.profiles p
  where p.user_id = auth.uid()
    and p.deleted_at is null
  order by p.updated_at desc nulls last, p.id
  limit 1
$$;

create or replace function public.current_role_code()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.user_id = auth.uid()
    and p.deleted_at is null
  order by p.updated_at desc nulls last, p.id
  limit 1
$$;

create or replace function public.is_admin_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role_code(), '') in ('admin_master', 'master_admin', 'master_ops')
$$;

create or replace function public.is_municipality_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role_code(), '') in ('admin_municipality', 'admin_prefeitura', 'prefeitura_admin')
$$;

create or replace function public.is_internal_municipality_role()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role_code(), '') in (
    'admin_municipality',
    'admin_prefeitura',
    'prefeitura_admin',
    'prefeitura_supervisor',
    'analyst',
    'analista',
    'fiscal',
    'financial',
    'financeiro',
    'counter_service',
    'topography',
    'expedient',
    'setor_intersetorial'
  )
$$;

create or replace function public.can_access_municipality_scope(_municipality_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin_master()
    or (
      _municipality_id is not null
      and _municipality_id = public.current_municipality_id()
    )
$$;

create or replace function public.can_manage_municipality_scope(_municipality_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin_master()
    or (
      public.is_municipality_admin()
      and _municipality_id is not null
      and _municipality_id = public.current_municipality_id()
    )
$$;

alter table if exists public.properties
  add column if not exists municipality_id uuid references public.municipalities(id) on delete set null;

alter table if exists public.processes
  add column if not exists municipality_id uuid references public.municipalities(id) on delete set null;

alter table if exists public.process_parties
  add column if not exists municipality_id uuid references public.municipalities(id) on delete set null;

alter table if exists public.document_templates
  add column if not exists municipality_id uuid references public.municipalities(id) on delete set null;

alter table if exists public.process_documents
  add column if not exists municipality_id uuid references public.municipalities(id) on delete set null;

alter table if exists public.process_movements
  add column if not exists municipality_id uuid references public.municipalities(id) on delete set null;

alter table if exists public.interdepartmental_dispatches
  add column if not exists municipality_id uuid references public.municipalities(id) on delete set null;

alter table if exists public.payment_guides
  add column if not exists municipality_id uuid references public.municipalities(id) on delete set null;

alter table if exists public.signature_blocks
  add column if not exists municipality_id uuid references public.municipalities(id) on delete set null;

alter table if exists public.signatures
  add column if not exists municipality_id uuid references public.municipalities(id) on delete set null;

alter table if exists public.process_requirements
  add column if not exists municipality_id uuid references public.municipalities(id) on delete set null;

alter table if exists public.process_audit_entries
  add column if not exists municipality_id uuid references public.municipalities(id) on delete set null;

alter table if exists public.process_reopen_history
  add column if not exists municipality_id uuid references public.municipalities(id) on delete set null;

alter table if exists public.audit_logs
  add column if not exists municipality_id uuid references public.municipalities(id) on delete set null;

create index if not exists idx_properties_municipality_id on public.properties (municipality_id);
create index if not exists idx_processes_municipality_id on public.processes (municipality_id);
create index if not exists idx_process_parties_municipality_id on public.process_parties (municipality_id);
create index if not exists idx_document_templates_municipality_id on public.document_templates (municipality_id);
create index if not exists idx_process_documents_municipality_id on public.process_documents (municipality_id);
create index if not exists idx_process_movements_municipality_id on public.process_movements (municipality_id);
create index if not exists idx_dispatches_municipality_id on public.interdepartmental_dispatches (municipality_id);
create index if not exists idx_payment_guides_municipality_id on public.payment_guides (municipality_id);
create index if not exists idx_signature_blocks_municipality_id on public.signature_blocks (municipality_id);
create index if not exists idx_signatures_municipality_id on public.signatures (municipality_id);
create index if not exists idx_process_requirements_municipality_id on public.process_requirements (municipality_id);
create index if not exists idx_process_audit_entries_municipality_id on public.process_audit_entries (municipality_id);
create index if not exists idx_process_reopen_history_municipality_id on public.process_reopen_history (municipality_id);
create index if not exists idx_audit_logs_municipality_id on public.audit_logs (municipality_id);

update public.processes p
set municipality_id = coalesce(
  p.municipality_id,
  case
    when exists (select 1 from public.municipalities m where m.id = p.tenant_id) then p.tenant_id
    else null
  end,
  creator.municipality_id
)
from public.profiles creator
where creator.user_id = p.created_by
  and p.municipality_id is null;

update public.properties pr
set municipality_id = coalesce(
  pr.municipality_id,
  case
    when exists (select 1 from public.municipalities m where m.id = pr.tenant_id) then pr.tenant_id
    else null
  end,
  proc.municipality_id
)
from public.processes proc
where proc.property_id = pr.id
  and pr.municipality_id is null;

update public.process_parties pp
set municipality_id = coalesce(pp.municipality_id, proc.municipality_id)
from public.processes proc
where proc.id = pp.process_id
  and pp.municipality_id is null;

update public.document_templates dt
set municipality_id = coalesce(
  dt.municipality_id,
  case
    when dt.tenant_id is not null and exists (select 1 from public.municipalities m where m.id = dt.tenant_id) then dt.tenant_id
    else null
  end
)
where dt.municipality_id is null;

update public.process_documents pd
set municipality_id = coalesce(pd.municipality_id, proc.municipality_id)
from public.processes proc
where proc.id = pd.process_id
  and pd.municipality_id is null;

update public.process_movements pm
set municipality_id = coalesce(pm.municipality_id, proc.municipality_id)
from public.processes proc
where proc.id = pm.process_id
  and pm.municipality_id is null;

update public.interdepartmental_dispatches d
set municipality_id = coalesce(d.municipality_id, proc.municipality_id)
from public.processes proc
where proc.id = d.process_id
  and d.municipality_id is null;

update public.payment_guides pg
set municipality_id = coalesce(pg.municipality_id, proc.municipality_id)
from public.processes proc
where proc.id = pg.process_id
  and pg.municipality_id is null;

update public.signature_blocks sb
set municipality_id = coalesce(sb.municipality_id, proc.municipality_id)
from public.processes proc
where proc.id = sb.process_id
  and sb.municipality_id is null;

update public.signatures s
set municipality_id = coalesce(s.municipality_id, sb.municipality_id)
from public.signature_blocks sb
where sb.id = s.signature_block_id
  and s.municipality_id is null;

update public.process_requirements r
set municipality_id = coalesce(r.municipality_id, proc.municipality_id)
from public.processes proc
where proc.id = r.process_id
  and r.municipality_id is null;

update public.process_audit_entries a
set municipality_id = coalesce(a.municipality_id, proc.municipality_id)
from public.processes proc
where proc.id = a.process_id
  and a.municipality_id is null;

update public.process_reopen_history rh
set municipality_id = coalesce(rh.municipality_id, proc.municipality_id)
from public.processes proc
where proc.id = rh.process_id
  and rh.municipality_id is null;

update public.audit_logs al
set municipality_id = coalesce(
  al.municipality_id,
  case
    when al.tenant_id is not null and exists (select 1 from public.municipalities m where m.id = al.tenant_id) then al.tenant_id
    else null
  end
)
where al.municipality_id is null;

create or replace function public.has_process_access(_process_id uuid, _user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with current_profile as (
    select
      p.user_id,
      p.municipality_id,
      p.role
    from public.profiles p
    where p.user_id = _user_id
      and p.deleted_at is null
    order by p.updated_at desc nulls last, p.id
    limit 1
  )
  select exists (
    select 1
    from public.processes pr
    cross join current_profile cp
    where pr.id = _process_id
      and (
        coalesce(cp.role, '') in ('master_admin', 'master_ops', 'admin_master')
        or (
          pr.municipality_id is not null
          and cp.municipality_id = pr.municipality_id
          and coalesce(cp.role, '') in (
            'prefeitura_admin',
            'prefeitura_supervisor',
            'analista',
            'financeiro',
            'setor_intersetorial',
            'fiscal',
            'admin_municipality',
            'analyst',
            'financial',
            'counter_service',
            'topography',
            'expedient'
          )
        )
        or (
          pr.municipality_id is not null
          and cp.municipality_id = pr.municipality_id
          and pr.created_by = _user_id
        )
        or exists (
          select 1
          from public.process_parties pp
          where pp.process_id = pr.id
            and pp.user_id = _user_id
            and (
              pp.municipality_id is null
              or cp.municipality_id is null
              or pp.municipality_id = cp.municipality_id
            )
        )
      )
  );
$$;

alter table public.properties enable row level security;
alter table public.processes enable row level security;
alter table public.process_parties enable row level security;
alter table public.document_templates enable row level security;
alter table public.process_documents enable row level security;
alter table public.process_movements enable row level security;
alter table public.interdepartmental_dispatches enable row level security;
alter table public.payment_guides enable row level security;
alter table public.signature_blocks enable row level security;
alter table public.signatures enable row level security;
alter table public.process_requirements enable row level security;
alter table public.process_audit_entries enable row level security;
alter table public.process_reopen_history enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "tenant members read properties" on public.properties;
drop policy if exists "properties_select_municipality_scope" on public.properties;
create policy "properties_select_municipality_scope"
on public.properties
for select
to authenticated
using (public.can_access_municipality_scope(municipality_id));

drop policy if exists "properties_insert_municipality_scope" on public.properties;
create policy "properties_insert_municipality_scope"
on public.properties
for insert
to authenticated
with check (
  public.is_admin_master()
  or (
    municipality_id = public.current_municipality_id()
    and (
      public.is_internal_municipality_role()
      or auth.uid() is not null
    )
  )
);

drop policy if exists "properties_update_municipality_scope" on public.properties;
create policy "properties_update_municipality_scope"
on public.properties
for update
to authenticated
using (
  public.is_admin_master()
  or public.can_manage_municipality_scope(municipality_id)
)
with check (
  public.is_admin_master()
  or public.can_manage_municipality_scope(municipality_id)
);

drop policy if exists "properties_delete_municipality_scope" on public.properties;
create policy "properties_delete_municipality_scope"
on public.properties
for delete
to authenticated
using (
  public.is_admin_master()
  or public.can_manage_municipality_scope(municipality_id)
);

drop policy if exists "process visibility scoped by tenant and party" on public.processes;
drop policy if exists "qualified users create processes" on public.processes;
drop policy if exists "participants update processes" on public.processes;
drop policy if exists "processes_select_municipality_scope" on public.processes;
create policy "processes_select_municipality_scope"
on public.processes
for select
to authenticated
using (public.has_process_access(id));

drop policy if exists "processes_insert_municipality_scope" on public.processes;
create policy "processes_insert_municipality_scope"
on public.processes
for insert
to authenticated
with check (
  public.is_admin_master()
  or (
    municipality_id = public.current_municipality_id()
    and created_by = auth.uid()
  )
);

drop policy if exists "processes_update_municipality_scope" on public.processes;
create policy "processes_update_municipality_scope"
on public.processes
for update
to authenticated
using (public.has_process_access(id))
with check (
  public.is_admin_master()
  or municipality_id = public.current_municipality_id()
);

drop policy if exists "processes_delete_municipality_scope" on public.processes;
create policy "processes_delete_municipality_scope"
on public.processes
for delete
to authenticated
using (
  public.is_admin_master()
  or public.can_manage_municipality_scope(municipality_id)
);

drop policy if exists "parties visible with process access" on public.process_parties;
drop policy if exists "process_parties_select_municipality_scope" on public.process_parties;
create policy "process_parties_select_municipality_scope"
on public.process_parties
for select
to authenticated
using (public.has_process_access(process_id));

drop policy if exists "process_parties_insert_municipality_scope" on public.process_parties;
create policy "process_parties_insert_municipality_scope"
on public.process_parties
for insert
to authenticated
with check (
  public.is_admin_master()
  or (
    municipality_id = public.current_municipality_id()
    and public.has_process_access(process_id)
  )
);

drop policy if exists "process_parties_update_municipality_scope" on public.process_parties;
create policy "process_parties_update_municipality_scope"
on public.process_parties
for update
to authenticated
using (
  public.is_admin_master()
  or public.can_manage_municipality_scope(municipality_id)
)
with check (
  public.is_admin_master()
  or public.can_manage_municipality_scope(municipality_id)
);

drop policy if exists "process_parties_delete_municipality_scope" on public.process_parties;
create policy "process_parties_delete_municipality_scope"
on public.process_parties
for delete
to authenticated
using (
  public.is_admin_master()
  or public.can_manage_municipality_scope(municipality_id)
);

drop policy if exists "templates visible by tenant" on public.document_templates;
drop policy if exists "checklists visible by tenant" on public.checklist_templates;
drop policy if exists "document_templates_select_municipality_scope" on public.document_templates;
create policy "document_templates_select_municipality_scope"
on public.document_templates
for select
to authenticated
using (
  public.is_admin_master()
  or municipality_id is null
  or municipality_id = public.current_municipality_id()
);

drop policy if exists "document_templates_manage_municipality_scope" on public.document_templates;
create policy "document_templates_manage_municipality_scope"
on public.document_templates
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

drop policy if exists "documents visible with process access" on public.process_documents;
drop policy if exists "participants upload documents" on public.process_documents;
drop policy if exists "process_documents_select_municipality_scope" on public.process_documents;
create policy "process_documents_select_municipality_scope"
on public.process_documents
for select
to authenticated
using (public.has_process_access(process_id));

drop policy if exists "process_documents_insert_municipality_scope" on public.process_documents;
create policy "process_documents_insert_municipality_scope"
on public.process_documents
for insert
to authenticated
with check (
  public.is_admin_master()
  or (
    municipality_id = public.current_municipality_id()
    and uploaded_by = auth.uid()
    and public.has_process_access(process_id)
  )
);

drop policy if exists "process_documents_update_municipality_scope" on public.process_documents;
create policy "process_documents_update_municipality_scope"
on public.process_documents
for update
to authenticated
using (public.has_process_access(process_id))
with check (
  public.is_admin_master()
  or municipality_id = public.current_municipality_id()
);

drop policy if exists "process_documents_delete_municipality_scope" on public.process_documents;
create policy "process_documents_delete_municipality_scope"
on public.process_documents
for delete
to authenticated
using (
  public.is_admin_master()
  or public.can_manage_municipality_scope(municipality_id)
  or (
    municipality_id = public.current_municipality_id()
    and uploaded_by = auth.uid()
  )
);

drop policy if exists "movements visible with process access" on public.process_movements;
drop policy if exists "process_movements_select_municipality_scope" on public.process_movements;
create policy "process_movements_select_municipality_scope"
on public.process_movements
for select
to authenticated
using (public.has_process_access(process_id));

drop policy if exists "process_movements_insert_municipality_scope" on public.process_movements;
create policy "process_movements_insert_municipality_scope"
on public.process_movements
for insert
to authenticated
with check (
  public.is_admin_master()
  or (
    municipality_id = public.current_municipality_id()
    and public.has_process_access(process_id)
  )
);

drop policy if exists "dispatches visible with process access" on public.interdepartmental_dispatches;
drop policy if exists "dispatches_select_municipality_scope" on public.interdepartmental_dispatches;
create policy "dispatches_select_municipality_scope"
on public.interdepartmental_dispatches
for select
to authenticated
using (public.has_process_access(process_id));

drop policy if exists "dispatches_insert_municipality_scope" on public.interdepartmental_dispatches;
create policy "dispatches_insert_municipality_scope"
on public.interdepartmental_dispatches
for insert
to authenticated
with check (
  public.is_admin_master()
  or (
    municipality_id = public.current_municipality_id()
    and public.has_process_access(process_id)
    and created_by = auth.uid()
  )
);

drop policy if exists "dispatches_update_municipality_scope" on public.interdepartmental_dispatches;
create policy "dispatches_update_municipality_scope"
on public.interdepartmental_dispatches
for update
to authenticated
using (
  public.is_admin_master()
  or public.can_manage_municipality_scope(municipality_id)
)
with check (
  public.is_admin_master()
  or public.can_manage_municipality_scope(municipality_id)
);

drop policy if exists "guides visible with process access" on public.payment_guides;
drop policy if exists "payment_guides_select_municipality_scope" on public.payment_guides;
create policy "payment_guides_select_municipality_scope"
on public.payment_guides
for select
to authenticated
using (public.has_process_access(process_id));

drop policy if exists "payment_guides_insert_municipality_scope" on public.payment_guides;
create policy "payment_guides_insert_municipality_scope"
on public.payment_guides
for insert
to authenticated
with check (
  public.is_admin_master()
  or (
    municipality_id = public.current_municipality_id()
    and public.is_internal_municipality_role()
    and public.has_process_access(process_id)
  )
);

drop policy if exists "payment_guides_update_municipality_scope" on public.payment_guides;
create policy "payment_guides_update_municipality_scope"
on public.payment_guides
for update
to authenticated
using (
  public.is_admin_master()
  or public.can_manage_municipality_scope(municipality_id)
  or (
    municipality_id = public.current_municipality_id()
    and public.current_role_code() in ('financeiro', 'financial', 'prefeitura_admin', 'admin_municipality')
  )
)
with check (
  public.is_admin_master()
  or municipality_id = public.current_municipality_id()
);

drop policy if exists "payment_guides_delete_municipality_scope" on public.payment_guides;
create policy "payment_guides_delete_municipality_scope"
on public.payment_guides
for delete
to authenticated
using (
  public.is_admin_master()
  or public.can_manage_municipality_scope(municipality_id)
);

drop policy if exists "signature blocks visible with process access" on public.signature_blocks;
drop policy if exists "signature_blocks_select_municipality_scope" on public.signature_blocks;
create policy "signature_blocks_select_municipality_scope"
on public.signature_blocks
for select
to authenticated
using (public.has_process_access(process_id));

drop policy if exists "signature_blocks_manage_municipality_scope" on public.signature_blocks;
create policy "signature_blocks_manage_municipality_scope"
on public.signature_blocks
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

drop policy if exists "signatures visible with process access" on public.signatures;
drop policy if exists "signatures_select_municipality_scope" on public.signatures;
create policy "signatures_select_municipality_scope"
on public.signatures
for select
to authenticated
using (
  public.is_admin_master()
  or exists (
    select 1
    from public.signature_blocks sb
    where sb.id = signatures.signature_block_id
      and public.has_process_access(sb.process_id)
  )
);

drop policy if exists "signatures_manage_municipality_scope" on public.signatures;
create policy "signatures_manage_municipality_scope"
on public.signatures
for all
to authenticated
using (
  public.is_admin_master()
  or public.can_manage_municipality_scope(municipality_id)
)
with check (
  public.is_admin_master()
  or municipality_id = public.current_municipality_id()
);

drop policy if exists "requirements visible with process access" on public.process_requirements;
drop policy if exists "requirements managed with process access" on public.process_requirements;
drop policy if exists "requirements updated with process access" on public.process_requirements;
drop policy if exists "process_requirements_select_municipality_scope" on public.process_requirements;
create policy "process_requirements_select_municipality_scope"
on public.process_requirements
for select
to authenticated
using (public.has_process_access(process_id));

drop policy if exists "process_requirements_insert_municipality_scope" on public.process_requirements;
create policy "process_requirements_insert_municipality_scope"
on public.process_requirements
for insert
to authenticated
with check (
  public.is_admin_master()
  or (
    municipality_id = public.current_municipality_id()
    and public.has_process_access(process_id)
  )
);

drop policy if exists "process_requirements_update_municipality_scope" on public.process_requirements;
create policy "process_requirements_update_municipality_scope"
on public.process_requirements
for update
to authenticated
using (public.has_process_access(process_id))
with check (
  public.is_admin_master()
  or municipality_id = public.current_municipality_id()
);

drop policy if exists "process_requirements_delete_municipality_scope" on public.process_requirements;
create policy "process_requirements_delete_municipality_scope"
on public.process_requirements
for delete
to authenticated
using (
  public.is_admin_master()
  or public.can_manage_municipality_scope(municipality_id)
);

drop policy if exists "audit entries visible with process access" on public.process_audit_entries;
drop policy if exists "audit entries insert with process access" on public.process_audit_entries;
drop policy if exists "process_audit_entries_select_municipality_scope" on public.process_audit_entries;
create policy "process_audit_entries_select_municipality_scope"
on public.process_audit_entries
for select
to authenticated
using (public.has_process_access(process_id));

drop policy if exists "process_audit_entries_insert_municipality_scope" on public.process_audit_entries;
create policy "process_audit_entries_insert_municipality_scope"
on public.process_audit_entries
for insert
to authenticated
with check (
  public.is_admin_master()
  or (
    municipality_id = public.current_municipality_id()
    and public.has_process_access(process_id)
  )
);

drop policy if exists "reopen history visible with process access" on public.process_reopen_history;
drop policy if exists "reopen history insert with process access" on public.process_reopen_history;
drop policy if exists "process_reopen_history_select_municipality_scope" on public.process_reopen_history;
create policy "process_reopen_history_select_municipality_scope"
on public.process_reopen_history
for select
to authenticated
using (public.has_process_access(process_id));

drop policy if exists "process_reopen_history_insert_municipality_scope" on public.process_reopen_history;
create policy "process_reopen_history_insert_municipality_scope"
on public.process_reopen_history
for insert
to authenticated
with check (
  public.is_admin_master()
  or (
    municipality_id = public.current_municipality_id()
    and public.has_process_access(process_id)
  )
);

drop policy if exists "audit visible to master and tenant admins" on public.audit_logs;
drop policy if exists "audit_logs_select_municipality_scope" on public.audit_logs;
create policy "audit_logs_select_municipality_scope"
on public.audit_logs
for select
to authenticated
using (
  public.is_admin_master()
  or public.can_manage_municipality_scope(municipality_id)
);

drop policy if exists "audit_logs_insert_municipality_scope" on public.audit_logs;
create policy "audit_logs_insert_municipality_scope"
on public.audit_logs
for insert
to authenticated
with check (
  public.is_admin_master()
  or (
    municipality_id = public.current_municipality_id()
    and actor_user_id = auth.uid()
  )
);
