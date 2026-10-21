-- Página única de arrecadação. Atualização parcial apenas dos campos financeiros.
-- Execução autorizada somente na branch isolada do Neon até homologação.
begin;

create or replace function public.get_municipal_collection_bank_details_v1(_municipality_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public set row_security=off
as $$
declare g jsonb;
begin
  if not public.can_read_municipal_collection_v1(_municipality_id) then
    raise exception 'Sem acesso a configuracao bancaria desta Prefeitura';
  end if;
  select coalesce(general_settings,'{}'::jsonb) into g
  from public.municipality_settings where municipality_id=_municipality_id;
  if g is null then raise exception 'Configuracoes da Prefeitura nao encontradas'; end if;
  return jsonb_build_object(
    'beneficiarioArrecadacao', coalesce(g->>'settlement_beneficiary',g->>'beneficiario_arrecadacao',''),
    'chavePix',coalesce(g->>'pix_key',g->>'chave_pix',''),
    'pixEnabled',coalesce((g->>'pix_enabled')::boolean,true),
    'pixKeyType',coalesce(g->>'pix_key_type','cnpj'),
    'pixMerchantCity',coalesce(g->>'pix_merchant_city',''),
    'bankCode',coalesce(g->>'bank_code',''),
    'bankName',coalesce(g->>'bank_name',''),
    'bankAgency',coalesce(g->>'bank_agency',''),
    'bankAgencyDigit',coalesce(g->>'bank_agency_digit',''),
    'bankAccount',coalesce(g->>'bank_account',''),
    'bankAccountDigit',coalesce(g->>'bank_account_digit',''),
    'bankBeneficiaryDocument',coalesce(g->>'bank_beneficiary_document',''),
    'bankCollectionMode',coalesce(g->>'bank_collection_mode','manual'),
    'bankAgreementCode',coalesce(g->>'bank_agreement_code',''),
    'bankWallet',coalesce(g->>'bank_wallet',''),
    'bankInstructions',coalesce(g->>'bank_instructions','')
  );
end $$;

create or replace function public.save_municipal_collection_bank_details_v1(_municipality_id uuid,_fields jsonb)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public set row_security=off
as $$
declare
  p jsonb;
  k text;
  beneficiary text := btrim(coalesce(_fields->>'beneficiarioArrecadacao',''));
  pix_key text := btrim(coalesce(_fields->>'chavePix',''));
  pix_enabled boolean;
  pix_type text := coalesce(_fields->>'pixKeyType','cnpj');
  pix_city text := btrim(coalesce(_fields->>'pixMerchantCity',''));
  bank_code text := btrim(coalesce(_fields->>'bankCode',''));
  bank_name text := btrim(coalesce(_fields->>'bankName',''));
  bank_mode text := coalesce(_fields->>'bankCollectionMode','manual');
  agreement text := btrim(coalesce(_fields->>'bankAgreementCode',''));
begin
  if not public.is_municipal_payment_admin(_municipality_id) then
    raise exception 'Somente o administrador pode alterar os dados bancarios da Prefeitura';
  end if;
  if _fields is null or jsonb_typeof(_fields)<>'object' then raise exception 'Formulario bancario invalido'; end if;
  for k in select jsonb_object_keys(_fields) loop
    if k <> all(array[
      'beneficiarioArrecadacao','chavePix','pixEnabled','pixKeyType','pixMerchantCity',
      'bankCode','bankName','bankAgency','bankAgencyDigit','bankAccount',
      'bankAccountDigit','bankBeneficiaryDocument','bankCollectionMode','bankAgreementCode',
      'bankWallet','bankInstructions'
    ]) then raise exception 'Campo bancario inesperado: %',k; end if;
  end loop;
  if jsonb_typeof(_fields->'pixEnabled') <> 'boolean' then
    raise exception 'Opcao PIX invalida';
  end if;
  pix_enabled := (_fields->>'pixEnabled')::boolean;
  if pix_type not in ('cpf','cnpj','email','phone','random') then raise exception 'Tipo de chave PIX invalido'; end if;
  if pix_enabled and (beneficiary='' or pix_key='' or pix_city='') then
    raise exception 'Configure beneficiario, chave e cidade para habilitar o PIX';
  end if;
  if bank_code <> '' and bank_code !~ '^[0-9]{3}$' then
    raise exception 'Codigo COMPE deve ter tres digitos';
  end if;
  if bank_mode not in ('manual','agreement','api') then raise exception 'Modalidade bancaria invalida'; end if;
  if bank_mode <> 'manual' and (bank_code='' or bank_name='') then
    raise exception 'Banco e codigo COMPE obrigatorios para convenio/API';
  end if;
  if bank_mode='agreement' and agreement='' then raise exception 'Numero de convenio obrigatorio'; end if;
  if length(beneficiary)>180 or length(pix_key)>130 or length(pix_city)>110 or
    length(bank_name)>150 or length(coalesce(_fields->>'bankInstructions',''))>1500 then
    raise exception 'Campo bancario excede limite';
  end if;
  p := jsonb_build_object(
    'settlement_beneficiary',beneficiary,'beneficiario_arrecadacao',beneficiary,
    'pix_key',pix_key,'chave_pix',pix_key,'pix_enabled',pix_enabled,
    'pix_key_type',pix_type,'pix_merchant_city',pix_city,
    'bank_code',bank_code,'bank_name',bank_name,
    'bank_agency',btrim(coalesce(_fields->>'bankAgency','')),
    'bank_agency_digit',btrim(coalesce(_fields->>'bankAgencyDigit','')),
    'bank_account',btrim(coalesce(_fields->>'bankAccount','')),
    'bank_account_digit',btrim(coalesce(_fields->>'bankAccountDigit','')),
    'bank_beneficiary_document',btrim(coalesce(_fields->>'bankBeneficiaryDocument','')),
    'bank_collection_mode',bank_mode,'bank_agreement_code',agreement,
    'bank_wallet',btrim(coalesce(_fields->>'bankWallet','')),
    'bank_instructions',btrim(coalesce(_fields->>'bankInstructions',''))
  );
  update public.municipality_settings
     set general_settings = coalesce(general_settings,'{}'::jsonb) || p, updated_at = now()
   where municipality_id=_municipality_id;
  if not found then raise exception 'Configuracoes da Prefeitura nao encontradas'; end if;
  return public.get_municipal_collection_bank_details_v1(_municipality_id);
end $$;

revoke all on function public.get_municipal_collection_bank_details_v1(uuid) from public;
revoke all on function public.save_municipal_collection_bank_details_v1(uuid,jsonb) from public;
grant execute on function public.get_municipal_collection_bank_details_v1(uuid) to authenticated;
grant execute on function public.save_municipal_collection_bank_details_v1(uuid,jsonb) to authenticated;
commit;
notify pgrst,'reload schema';
