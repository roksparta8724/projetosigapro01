-- SIGAPRO 2026-10-14
-- Administrador da Prefeitura = governanca administrativa, nunca operador de workflow.
-- Esta migration fica versionada para o deploy final; NAO foi aplicada ao banco oficial nesta etapa.

create or replace function public.guard_prefeitura_admin_operational_write_v1()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  _role_code text := coalesce(public.current_role_code(), '');
begin
  if _role_code = 'prefeitura_admin' then
    raise exception
      'Administrador da Prefeitura possui acesso somente administrativo e de consulta; alteracoes operacionais do processo devem ser executadas pelo setor responsavel.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function public.guard_prefeitura_admin_operational_write_v1() from public;

do $block$
declare
  _table text;
  _tables text[] := array[
    'processes',
    'process_documents',
    'process_requirements',
    'process_messages',
    'process_movements',
    'process_audit_entries',
    'process_parties',
    'process_party_private_data',
    'process_reopen_history',
    'interdepartmental_dispatches',
    'payment_guides',
    'signature_blocks',
    'signatures'
  ];
begin
  foreach _table in array _tables loop
    if to_regclass('public.' || _table) is not null then
      execute format(
        'drop trigger if exists trg_guard_prefeitura_admin_operational_write_v1 on public.%I',
        _table
      );
      execute format(
        'create trigger trg_guard_prefeitura_admin_operational_write_v1
           before insert or update or delete on public.%I
           for each row
           execute function public.guard_prefeitura_admin_operational_write_v1()',
        _table
      );
    end if;
  end loop;
end;
$block$;

notify pgrst, 'reload schema';
