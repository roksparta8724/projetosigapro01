-- QA-only migration: make payment provider credentials tenant- and environment-bound.
-- No payments, processes, municipal settings or historical guides are updated.
-- Each municipality can use a different bank or external municipal collection system.
begin;

create or replace function public.save_municipal_payment_connection_v1(
  _municipality_id uuid,
  _provider text,
  _environment text,
  _credentials_ciphertext text default null,
  _credential_fingerprint text default null,
  _webhook_secret_ciphertext text default null,
  _webhook_fingerprint text default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public set row_security=off as $$
declare
  old_connection public.municipal_payment_provider_connections;
  keep_current boolean;
  new_credential text;
  new_fingerprint text;
  new_webhook text;
  new_webhook_fingerprint text;
begin
  if not public.is_municipal_payment_admin(_municipality_id) then
    raise exception 'Sem permissão para administrar pagamentos desta Prefeitura';
  end if;
  if _provider not in ('mercado_pago','bank_direct','manual') then
    raise exception 'Provedor de pagamento inválido';
  end if;
  if _environment not in ('test','production') then
    raise exception 'Ambiente de pagamento inválido';
  end if;

  select * into old_connection from public.municipal_payment_provider_connections
    where municipality_id=_municipality_id for update;
  keep_current := old_connection.municipality_id is not null
    and old_connection.provider=_provider
    and old_connection.environment=_environment
    and _provider='mercado_pago';

  -- Never carry a test token into production or another provider. A blank input
  -- keeps a credential ONLY if provider AND environment are unchanged.
  new_credential := case when _provider='mercado_pago'
    then coalesce(nullif(_credentials_ciphertext,''),case when keep_current then old_connection.credentials_ciphertext end)
    else null end;
  new_fingerprint := case when _provider='mercado_pago'
    then coalesce(nullif(_credential_fingerprint,''),case when keep_current then old_connection.credential_fingerprint end)
    else null end;
  new_webhook := case when _provider='mercado_pago'
    then coalesce(nullif(_webhook_secret_ciphertext,''),case when keep_current then old_connection.webhook_secret_ciphertext end)
    else null end;
  new_webhook_fingerprint := case when _provider='mercado_pago'
    then coalesce(nullif(_webhook_fingerprint,''),case when keep_current then old_connection.webhook_fingerprint end)
    else null end;

  insert into public.municipal_payment_provider_connections(
    municipality_id,provider,environment,status,
    credentials_ciphertext,credential_fingerprint,
    webhook_secret_ciphertext,webhook_fingerprint,
    last_tested_at,last_test_status,last_test_message,updated_by,updated_at
  ) values (
    _municipality_id,_provider,_environment,
    case when _provider='manual' then 'active' else 'configured' end,
    new_credential,new_fingerprint,new_webhook,new_webhook_fingerprint,
    null,null,null,public.current_profile_id(),now()
  ) on conflict (municipality_id) do update set
    provider=excluded.provider,environment=excluded.environment,
    status=excluded.status,
    credentials_ciphertext=excluded.credentials_ciphertext,
    credential_fingerprint=excluded.credential_fingerprint,
    webhook_secret_ciphertext=excluded.webhook_secret_ciphertext,
    webhook_fingerprint=excluded.webhook_fingerprint,
    last_tested_at=null,last_test_status=null,last_test_message=null,
    updated_by=excluded.updated_by,updated_at=now();

  return public.get_municipal_payment_connection_v1(_municipality_id);
end $$;

create or replace function public.activate_municipal_payment_connection_v1(_municipality_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public set row_security=off as $$
declare
  connection public.municipal_payment_provider_connections;
begin
  if not public.is_municipal_payment_admin(_municipality_id) then
    raise exception 'Sem permissão para administrar pagamentos desta Prefeitura';
  end if;
  select * into connection from public.municipal_payment_provider_connections
    where municipality_id=_municipality_id for update;
  if connection.municipality_id is null then raise exception 'Conexão municipal ainda não cadastrada'; end if;
  if connection.provider='bank_direct' then
    raise exception 'Banco/convênio cadastrado, mas ainda sem adaptador homologado para emissão automática';
  end if;
  if connection.provider='mercado_pago' then
    if connection.environment='production' then
      raise exception 'Cobrança real Mercado Pago bloqueada até homologação bancária e autorização da Prefeitura';
    end if;
    if connection.last_test_status<>'ok' or connection.credentials_ciphertext is null then
      raise exception 'Teste a credencial municipal antes de ativar o Mercado Pago';
    end if;
  elsif connection.provider<>'manual' then
    raise exception 'Provedor ainda não homologado';
  end if;
  update public.municipal_payment_provider_connections set
    status='active',updated_by=public.current_profile_id(),updated_at=now()
    where municipality_id=_municipality_id;
  return public.get_municipal_payment_connection_v1(_municipality_id);
end $$;

revoke all on function public.save_municipal_payment_connection_v1(uuid,text,text,text,text,text,text) from public;
revoke all on function public.activate_municipal_payment_connection_v1(uuid) from public;
grant execute on function public.save_municipal_payment_connection_v1(uuid,text,text,text,text,text,text) to authenticated;
grant execute on function public.activate_municipal_payment_connection_v1(uuid) to authenticated;
commit;
notify pgrst,'reload schema';
