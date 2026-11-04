-- Modalidade operacional por prefeitura. Sem alterações em guias anteriores.
-- Aplicar PRIMEIRO na branch Neon isolada de homologação.
begin;

create or replace function public.get_active_municipal_collection_configuration_v1(_municipality_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  c public.municipal_collection_configurations;
begin
  if not public.can_read_municipal_collection_v1(_municipality_id) then
    raise exception 'Sem acesso à modalidade de arrecadação desta prefeitura';
  end if;
  select * into c from public.municipal_collection_configurations
   where municipality_id = _municipality_id and status = 'active'
   order by version desc limit 1;
  if c.id is null then
    return jsonb_build_object('municipality_id',_municipality_id,'mode','sigapro','status','not_configured','enabled',false);
  end if;
  return jsonb_build_object(
    'municipality_id',c.municipality_id,
    'mode',c.mode,
    'status',c.status,
    'enabled',true,
    'supplier_code',c.supplier_code,
    'supplier_name',c.supplier_name,
    'integration_type',c.integration_type,
    'version',c.version
  );
end $$;

revoke all on function public.get_active_municipal_collection_configuration_v1(uuid) from public;
grant execute on function public.get_active_municipal_collection_configuration_v1(uuid) to authenticated;

commit;
notify pgrst,'reload schema';
