alter table if exists public.tenant_memberships
  add column if not exists account_status text not null default 'active',
  add column if not exists user_type text,
  add column if not exists department text,
  add column if not exists blocked_at timestamptz,
  add column if not exists blocked_by uuid,
  add column if not exists block_reason text,
  add column if not exists last_access_at timestamptz,
  add column if not exists deleted_at timestamptz;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tenant_memberships'
      and column_name = 'is_active'
  ) then
    update public.tenant_memberships
    set account_status = case
      when deleted_at is not null then 'inactive'
      when blocked_at is not null then 'blocked'
      when is_active = false then 'inactive'
      else 'active'
    end
    where account_status is null
       or account_status not in ('active', 'blocked', 'inactive');
  else
    update public.tenant_memberships
    set account_status = case
      when deleted_at is not null then 'inactive'
      when blocked_at is not null then 'blocked'
      else 'active'
    end
    where account_status is null
       or account_status not in ('active', 'blocked', 'inactive');
  end if;
end $$;

create index if not exists idx_tenant_memberships_account_status
  on public.tenant_memberships (account_status);

create index if not exists idx_tenant_memberships_tenant_status
  on public.tenant_memberships (tenant_id, account_status);
