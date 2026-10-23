-- Apply ONLY to isolated Neon QA before any rollout to production.
-- Defense in depth: an admin must not bypass bank-readiness checks by calling
-- mark_municipal_collection_validation_v1 directly.
-- Does not alter existing payment guides, processes or documents.
begin;

create or replace function public.activate_municipal_collection_configuration_v1(_municipality_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public set row_security=off as $$
declare
  target public.municipal_collection_configurations;
  provider public.municipal_payment_provider_connections;
  bank jsonb;
  document text;
begin
  if not public.is_municipal_payment_admin(_municipality_id) then
    raise exception 'Sem permissão para administrar arrecadação';
  end if;
  select * into strict target from public.municipal_collection_configurations
    where municipality_id=_municipality_id order by version desc limit 1 for update;
  if target.status <> 'validated' then
    raise exception 'Valide a configuração antes de ativar';
  end if;

  if target.mode='sigapro' then
    select * into provider from public.municipal_payment_provider_connections
      where municipality_id=_municipality_id;
    if provider.municipality_id is null or provider.status <> 'active' then
      raise exception 'Provedor bancário da Prefeitura não está ativo';
    end if;
    if provider.environment <> target.environment then
      raise exception 'Ambiente bancário incompatível com a modalidade configurada';
    end if;
    if provider.provider='bank_direct' then
      raise exception 'Convênio bancário direto ainda não possui adaptador homologado';
    end if;
    if provider.provider='manual' and (
      coalesce((target.capabilities->>'payment')::boolean,false) or
      coalesce((target.capabilities->>'query')::boolean,false)
    ) then
      raise exception 'Baixa manual não permite consultas ou confirmação automática';
    end if;
    if provider.provider not in ('manual','mercado_pago') then
      raise exception 'Provedor bancário sem integração homologada';
    end if;
    if target.environment='production' then
      select general_settings into bank from public.municipality_settings
        where municipality_id=_municipality_id;
      document := regexp_replace(coalesce(bank->>'bank_beneficiary_document',''),'[^0-9]','','g');
      if document !~ '^[0-9]{14}$'
         or btrim(coalesce(bank->>'settlement_beneficiary',bank->>'beneficiario_arrecadacao',''))='' then
        raise exception 'Conta arrecadadora municipal sem beneficiário e CNPJ oficiais';
      end if;
    end if;
  elsif target.mode='municipal_system' then
    if target.integration_type='automatic' then
      raise exception 'Emissão automática do fornecedor municipal ainda não homologada';
    end if;
    if target.integration_type<>'controlled_import' then
      raise exception 'Selecione importação controlada de documento oficial';
    end if;
  else
    raise exception 'Modalidade de arrecadação inválida';
  end if;

  update public.municipal_collection_configurations
    set status=case when id=target.id then 'active'
                    when status='active' then 'validated' else status end,
        activated_at=case when id=target.id then now() else activated_at end
    where municipality_id=_municipality_id;
  return public.get_municipal_collection_configuration_v1(_municipality_id);
end $$;

revoke all on function public.activate_municipal_collection_configuration_v1(uuid) from public;
grant execute on function public.activate_municipal_collection_configuration_v1(uuid) to authenticated;
commit;
notify pgrst,'reload schema';
