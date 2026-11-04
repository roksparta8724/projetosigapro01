-- SIGAPRO multibank credential boundary. Apply only after QA quality gate.
-- No rows in payment guides/processes/documents are changed.
-- Do not propagate a provider token when municipality's supplier, mode or
-- test/production environment is changed. Each new version is isolated.
begin;
create or replace function public.save_municipal_collection_configuration_v1(
 _municipality_id uuid, _mode text, _supplier_code text, _supplier_name text,
 _api_base_url text, _environment text, _integration_type text,
 _secret_ciphertext text, _secret_fingerprint text,
 _public_parameters jsonb, _capabilities jsonb
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public set row_security=off as $func$
declare
 c public.municipal_collection_configurations;
 previous public.municipal_collection_configurations;
 next_version integer;
 same_scope boolean;
 new_ciphertext text;
 new_fingerprint text;
begin
 if not public.is_municipal_payment_admin(_municipality_id)
 then raise exception 'Sem permissão para administrar arrecadação'; end if;
 if _mode not in ('sigapro','municipal_system')
    or _environment not in ('test','production')
    or _integration_type not in ('automatic','controlled_import')
 then raise exception 'Configuração de arrecadação inválida'; end if;
 if _api_base_url is not null and _api_base_url <> '' and _api_base_url !~ '^https://'
 then raise exception 'A URL oficial deve usar HTTPS'; end if;
 if _mode='municipal_system' and btrim(coalesce(_supplier_code,''))=''
 then raise exception 'Informe o fornecedor municipal'; end if;
 if _secret_ciphertext is not null and btrim(_secret_ciphertext)<>'' and
    _secret_ciphertext !~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
 then raise exception 'Credencial não está cifrada em formato válido'; end if;
 -- Serialize concurrent saves for this municipality, preserving unique version.
 perform 1 from public.municipalities m where m.id=_municipality_id for update;
 if not found then raise exception 'Prefeitura inválida'; end if;
 select * into previous from public.municipal_collection_configurations
 where municipality_id=_municipality_id order by version desc limit 1;
 same_scope := previous.id is not null and
   previous.mode='municipal_system' and _mode='municipal_system'
   and previous.integration_type='automatic' and _integration_type='automatic'
   and previous.environment=_environment
   and previous.supplier_code is not distinct from nullif(btrim(_supplier_code),'');
 new_ciphertext := case
   when _mode<>'municipal_system' or _integration_type<>'automatic' then null
   when nullif(btrim(coalesce(_secret_ciphertext,'')),'') is not null then _secret_ciphertext
   when same_scope then previous.secret_ciphertext
   else null end;
 new_fingerprint := case
   when _mode<>'municipal_system' or _integration_type<>'automatic' then null
   when nullif(btrim(coalesce(_secret_ciphertext,'')),'') is not null then nullif(_secret_fingerprint,'')
   when same_scope then previous.secret_fingerprint
   else null end;
 select coalesce(max(version),0)+1 into next_version
 from public.municipal_collection_configurations where municipality_id=_municipality_id;
 insert into public.municipal_collection_configurations(
  municipality_id,version,mode,status,supplier_code,supplier_name,
  api_base_url,environment,integration_type,secret_ciphertext,
  secret_fingerprint,public_parameters,capabilities,created_by
 ) values (
  _municipality_id,next_version,_mode,'homologation',
  nullif(btrim(_supplier_code),''),nullif(_supplier_name,''),
  nullif(_api_base_url,''),_environment,_integration_type,
  new_ciphertext,new_fingerprint,coalesce(_public_parameters,'{}'::jsonb),
  coalesce(_capabilities,'{}'::jsonb),public.current_profile_id()
 ) returning * into c;
 return public.get_municipal_collection_configuration_v1(_municipality_id);
end $func$;
revoke all on function public.save_municipal_collection_configuration_v1(
 uuid,text,text,text,text,text,text,text,text,jsonb,jsonb) from public;
grant execute on function public.save_municipal_collection_configuration_v1(
 uuid,text,text,text,text,text,text,text,text,jsonb,jsonb) to authenticated;
commit;
notify pgrst,'reload schema';
