-- SIGAPRO Municipal — provedor de pagamento por Prefeitura.
-- PREPARAÇÃO SOMENTE: não é aplicada automaticamente.
-- Segredos são armazenados apenas como ciphertext AES-GCM gerado no servidor.

begin;

create table if not exists public.municipal_payment_provider_connections (
  municipality_id uuid primary key references public.municipalities(id) on delete cascade,
  provider text not null default 'manual'
    check (provider in ('mercado_pago','bank_direct','manual')),
  environment text not null default 'test'
    check (environment in ('test','production')),
  status text not null default 'inactive'
    check (status in ('inactive','configured','active','error')),
  credentials_ciphertext text,
  credential_fingerprint text,
  webhook_secret_ciphertext text,
  webhook_fingerprint text,
  last_tested_at timestamptz,
  last_test_status text,
  last_test_message text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

alter table public.municipal_payment_provider_connections enable row level security;
-- This Neon project has authenticated but not the optional anon role.
revoke all on table public.municipal_payment_provider_connections from public, authenticated;

create or replace function public.is_municipal_payment_admin(_municipality_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
  select
    public.is_master()
    or (
      public.has_tenant_access(_municipality_id)
      and public.current_role_code() = 'prefeitura_admin'
    )
$function$;

create or replace function public.get_municipal_payment_connection_v1(_municipality_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _row public.municipal_payment_provider_connections%rowtype;
begin
  if not public.is_municipal_payment_admin(_municipality_id) then
    raise exception 'Sem permissao para administrar pagamentos desta Prefeitura';
  end if;

  select * into _row
  from public.municipal_payment_provider_connections
  where municipality_id=_municipality_id;

  if _row.municipality_id is null then
    return jsonb_build_object(
      'municipality_id',_municipality_id,
      'provider','manual',
      'environment','test',
      'status','inactive',
      'credentials_configured',false,
      'credential_fingerprint','',
      'webhook_configured',false,
      'webhook_fingerprint',''
    );
  end if;

  return jsonb_build_object(
    'municipality_id',_row.municipality_id,
    'provider',_row.provider,
    'environment',_row.environment,
    'status',_row.status,
    'credentials_configured',_row.credentials_ciphertext is not null,
    'credential_fingerprint',coalesce(_row.credential_fingerprint,''),
    'webhook_configured',_row.webhook_secret_ciphertext is not null,
    'webhook_fingerprint',coalesce(_row.webhook_fingerprint,''),
    'last_tested_at',_row.last_tested_at,
    'last_test_status',_row.last_test_status,
    'last_test_message',_row.last_test_message,
    'updated_at',_row.updated_at
  );
end;
$function$;

create or replace function public.get_municipal_payment_secret_admin_v1(_municipality_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _row public.municipal_payment_provider_connections%rowtype;
begin
  if not public.is_municipal_payment_admin(_municipality_id) then
    raise exception 'Sem permissao para administrar pagamentos desta Prefeitura';
  end if;

  select * into _row
  from public.municipal_payment_provider_connections
  where municipality_id=_municipality_id;

  if _row.municipality_id is null then
    return jsonb_build_object(
      'municipality_id',_municipality_id,
      'provider','manual',
      'environment','test',
      'status','inactive'
    );
  end if;

  return jsonb_build_object(
    'municipality_id',_row.municipality_id,
    'provider',_row.provider,
    'environment',_row.environment,
    'status',_row.status,
    'credentials_ciphertext',_row.credentials_ciphertext,
    'credential_fingerprint',coalesce(_row.credential_fingerprint,''),
    'webhook_secret_ciphertext',_row.webhook_secret_ciphertext,
    'webhook_fingerprint',coalesce(_row.webhook_fingerprint,'')
  );
end;
$function$;

create or replace function public.resolve_municipal_payment_secret_v1(_municipality_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _row public.municipal_payment_provider_connections%rowtype;
begin
  if not public.has_tenant_access(_municipality_id) and not public.is_master() then
    raise exception 'Sem acesso ao provedor de pagamento desta Prefeitura';
  end if;

  select * into _row
  from public.municipal_payment_provider_connections
  where municipality_id=_municipality_id;

  if _row.municipality_id is null then
    return jsonb_build_object(
      'municipality_id',_municipality_id,
      'provider','manual',
      'environment','test',
      'status','inactive'
    );
  end if;

  return jsonb_build_object(
    'municipality_id',_row.municipality_id,
    'provider',_row.provider,
    'environment',_row.environment,
    'status',_row.status,
    'credentials_ciphertext',_row.credentials_ciphertext,
    'credential_fingerprint',coalesce(_row.credential_fingerprint,''),
    'webhook_secret_ciphertext',_row.webhook_secret_ciphertext,
    'webhook_fingerprint',coalesce(_row.webhook_fingerprint,'')
  );
end;
$function$;

create or replace function public.save_municipal_payment_connection_v1(
  _municipality_id uuid,
  _provider text,
  _environment text,
  _credentials_ciphertext text default null,
  _credential_fingerprint text default null,
  _webhook_secret_ciphertext text default null,
  _webhook_fingerprint text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _profile_id uuid := public.current_profile_id();
begin
  if not public.is_municipal_payment_admin(_municipality_id) then
    raise exception 'Sem permissao para administrar pagamentos desta Prefeitura';
  end if;

  if _provider not in ('mercado_pago','bank_direct','manual') then
    raise exception 'Provedor de pagamento invalido';
  end if;
  if _environment not in ('test','production') then
    raise exception 'Ambiente de pagamento invalido';
  end if;

  insert into public.municipal_payment_provider_connections(
    municipality_id,provider,environment,status,
    credentials_ciphertext,credential_fingerprint,
    webhook_secret_ciphertext,webhook_fingerprint,
    last_tested_at,last_test_status,last_test_message,
    updated_by,updated_at
  )
  values(
    _municipality_id,_provider,_environment,
    case when _provider='manual' then 'active' else 'configured' end,
    _credentials_ciphertext,_credential_fingerprint,
    _webhook_secret_ciphertext,_webhook_fingerprint,
    null,null,null,_profile_id,now()
  )
  on conflict (municipality_id) do update set
    provider=excluded.provider,
    environment=excluded.environment,
    status=case when excluded.provider='manual' then 'active' else 'configured' end,
    credentials_ciphertext=coalesce(excluded.credentials_ciphertext,public.municipal_payment_provider_connections.credentials_ciphertext),
    credential_fingerprint=coalesce(excluded.credential_fingerprint,public.municipal_payment_provider_connections.credential_fingerprint),
    webhook_secret_ciphertext=coalesce(excluded.webhook_secret_ciphertext,public.municipal_payment_provider_connections.webhook_secret_ciphertext),
    webhook_fingerprint=coalesce(excluded.webhook_fingerprint,public.municipal_payment_provider_connections.webhook_fingerprint),
    last_tested_at=null,
    last_test_status=null,
    last_test_message=null,
    updated_by=_profile_id,
    updated_at=now();

  return public.get_municipal_payment_connection_v1(_municipality_id);
end;
$function$;

create or replace function public.mark_municipal_payment_test_v1(
  _municipality_id uuid,
  _ok boolean,
  _message text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
begin
  if not public.is_municipal_payment_admin(_municipality_id) then
    raise exception 'Sem permissao para administrar pagamentos desta Prefeitura';
  end if;

  update public.municipal_payment_provider_connections
  set last_tested_at=now(),
      last_test_status=case when _ok then 'ok' else 'error' end,
      last_test_message=left(coalesce(_message,''),1000),
      status=case when _ok then 'configured' else 'error' end,
      updated_at=now()
  where municipality_id=_municipality_id;

  return public.get_municipal_payment_connection_v1(_municipality_id);
end;
$function$;

create or replace function public.activate_municipal_payment_connection_v1(_municipality_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
begin
  if not public.is_municipal_payment_admin(_municipality_id) then
    raise exception 'Sem permissao para administrar pagamentos desta Prefeitura';
  end if;

  if not exists (
    select 1
    from public.municipal_payment_provider_connections
    where municipality_id=_municipality_id
      and (
        provider='manual'
        or (
          last_test_status='ok'
          and credentials_ciphertext is not null
        )
      )
  ) then
    raise exception 'Teste a conexao com sucesso antes de ativar o provedor';
  end if;

  update public.municipal_payment_provider_connections
  set status='active',
      updated_by=public.current_profile_id(),
      updated_at=now()
  where municipality_id=_municipality_id;

  return public.get_municipal_payment_connection_v1(_municipality_id);
end;
$function$;

-- PostgreSQL grants function EXECUTE to PUBLIC by default; revoke before granting tenant-scoped access.
revoke all on function public.is_municipal_payment_admin(uuid) from public;
revoke all on function public.get_municipal_payment_connection_v1(uuid) from public;
revoke all on function public.get_municipal_payment_secret_admin_v1(uuid) from public;
revoke all on function public.resolve_municipal_payment_secret_v1(uuid) from public;
revoke all on function public.save_municipal_payment_connection_v1(uuid,text,text,text,text,text,text) from public;
revoke all on function public.mark_municipal_payment_test_v1(uuid,boolean,text) from public;
revoke all on function public.activate_municipal_payment_connection_v1(uuid) from public;

grant execute on function public.get_municipal_payment_connection_v1(uuid) to authenticated;
grant execute on function public.get_municipal_payment_secret_admin_v1(uuid) to authenticated;
grant execute on function public.resolve_municipal_payment_secret_v1(uuid) to authenticated;
grant execute on function public.save_municipal_payment_connection_v1(uuid,text,text,text,text,text,text) to authenticated;
grant execute on function public.mark_municipal_payment_test_v1(uuid,boolean,text) to authenticated;
grant execute on function public.activate_municipal_payment_connection_v1(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
