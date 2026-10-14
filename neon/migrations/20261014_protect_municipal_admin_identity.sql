-- Protect the canonical municipal administrator identity.
-- Cargo, profissão, legacy tipo fields, or external-flow normalization must never
-- demote a Prefeitura administrator. Only an authenticated Master may change it.

begin;

create or replace function public.guard_prefeitura_admin_role_v1()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $function$
begin
  if old.role = 'prefeitura_admin'
     and coalesce(new.role, '') <> 'prefeitura_admin'
     and not public.is_master() then
    raise exception 'Administrador da Prefeitura só pode ter o papel alterado pelo Master.';
  end if;

  return new;
end;
$function$;

revoke execute on function public.guard_prefeitura_admin_role_v1() from public;

drop trigger if exists trg_guard_prefeitura_admin_role_v1 on public.profiles;
create trigger trg_guard_prefeitura_admin_role_v1
before update of role
on public.profiles
for each row
execute function public.guard_prefeitura_admin_role_v1();

commit;

notify pgrst, 'reload schema';
