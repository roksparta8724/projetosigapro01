begin;

alter table public.departments enable row level security;

grant select on table public.departments to authenticated;

drop policy if exists departments_read_same_municipality on public.departments;

create policy departments_read_same_municipality
  on public.departments
  for select
  to authenticated
  using (
    public.is_master()
    or exists (
      select 1
        from public.profiles p
       where p.id = public.current_profile_id()
         and p.municipality_id = departments.municipality_id
         and p.deleted_at is null
         and p.account_status = 'active'
    )
  );

commit;
