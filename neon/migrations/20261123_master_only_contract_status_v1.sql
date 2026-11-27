-- SIGAPRO 23/11/2026 — only platform owner may alter tenant contract state.
-- The municipal RLS policy permits editing institutional data, but never status.
create or replace function public.guard_municipality_contract_status_master()
returns trigger language plpgsql security invoker
set search_path to 'pg_catalog','public'
as $body$
begin
  if new.status is distinct from old.status
     and current_user = 'authenticated'
     and not exists (
       select 1 from public.profiles actor
       where actor.id=public.current_profile_id()
         and actor.role in ('admin_master','master_admin')
         and actor.deleted_at is null and actor.account_status='active'
     ) then
    raise exception 'Somente o Administrador Geral SIGAPRO pode alterar o status do contrato' using errcode='42501';
  end if;
  return new;
end;
$body$;
do $install$
begin
  if not exists (select 1 from pg_trigger
       where tgrelid='public.municipalities'::regclass
       and tgname='trg_guard_municipality_contract_status_master'
       and not tgisinternal) then
    create trigger trg_guard_municipality_contract_status_master
      before update of status on public.municipalities
      for each row execute function public.guard_municipality_contract_status_master();
  end if;
end;
$install$;
