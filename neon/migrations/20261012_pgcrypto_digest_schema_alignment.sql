-- SIGAPRO: corrige chamadas a pgcrypto em funcoes SECURITY DEFINER.
-- O pgcrypto esta instalado no schema "extensions"; as funcoes abaixo usam
-- search_path restrito por seguranca, portanto digest() precisa ser qualificado.
-- Migração idempotente: só altera funções que ainda usam digest() sem schema.

do $migration$
declare
  _fn record;
  _definition text;
begin
  if not exists (
    select 1
      from pg_extension e
      join pg_namespace n on n.oid=e.extnamespace
     where e.extname='pgcrypto'
       and n.nspname='extensions'
  ) then
    raise exception 'pgcrypto precisa estar instalado no schema extensions';
  end if;

  for _fn in
    select p.oid, p.proname
      from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public'
       and p.proname in (
         'create_external_process',
         'create_external_process_v2',
         'sync_process_documents'
       )
       and p.prokind='f'
  loop
    _definition := pg_get_functiondef(_fn.oid);

    if position('digest(' in _definition) > 0
       and position('extensions.digest(' in _definition) = 0 then
      _definition := replace(_definition, 'digest(', 'extensions.digest(');
      execute _definition;
    end if;
  end loop;

  perform extensions.digest('sigapro'::text,'sha256'::text);
end
$migration$;
