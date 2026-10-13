-- Per-municipality bring-your-own-storage (BYOS) contract.
-- Default remains SIGAPRO Cloudflare R2. A municipality may later activate its
-- own S3-compatible cloud/server without exposing credentials to the browser.

begin;

create table if not exists public.municipal_storage_connections (
  municipality_id uuid primary key references public.municipalities(id) on delete cascade,
  provider text not null default 'sigapro_r2'
    check (provider in ('sigapro_r2','s3_compatible')),
  status text not null default 'active'
    check (status in ('inactive','configured','active','error')),
  endpoint_url text,
  region text not null default 'us-east-1',
  bucket_documents text,
  base_path text not null default '',
  force_path_style boolean not null default false,
  credentials_ciphertext text,
  credential_fingerprint text,
  last_tested_at timestamptz,
  last_test_status text,
  last_test_message text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

alter table public.municipal_storage_connections enable row level security;
revoke all on table public.municipal_storage_connections from anon, authenticated;

create or replace function public.is_municipal_storage_admin(_municipality_id uuid)
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

create or replace function public.get_municipal_storage_connection_v1(_municipality_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _row public.municipal_storage_connections%rowtype;
begin
  if not public.is_municipal_storage_admin(_municipality_id) then
    raise exception 'Sem permissao para administrar o armazenamento desta Prefeitura';
  end if;

  select * into _row
  from public.municipal_storage_connections
  where municipality_id=_municipality_id;

  if _row.municipality_id is null then
    return jsonb_build_object(
      'municipality_id',_municipality_id,
      'provider','sigapro_r2',
      'status','active',
      'endpoint_url','',
      'region','us-east-1',
      'bucket_documents','',
      'base_path','',
      'force_path_style',false,
      'credentials_configured',false,
      'credential_fingerprint','',
      'last_tested_at',null,
      'last_test_status',null,
      'last_test_message',null
    );
  end if;

  return jsonb_build_object(
    'municipality_id',_row.municipality_id,
    'provider',_row.provider,
    'status',_row.status,
    'endpoint_url',coalesce(_row.endpoint_url,''),
    'region',coalesce(_row.region,'us-east-1'),
    'bucket_documents',coalesce(_row.bucket_documents,''),
    'base_path',coalesce(_row.base_path,''),
    'force_path_style',_row.force_path_style,
    'credentials_configured',_row.credentials_ciphertext is not null,
    'credential_fingerprint',coalesce(_row.credential_fingerprint,''),
    'last_tested_at',_row.last_tested_at,
    'last_test_status',_row.last_test_status,
    'last_test_message',_row.last_test_message,
    'updated_at',_row.updated_at
  );
end;
$function$;

create or replace function public.get_municipal_storage_secret_admin_v1(_municipality_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _row public.municipal_storage_connections%rowtype;
begin
  if not public.is_municipal_storage_admin(_municipality_id) then
    raise exception 'Sem permissao para administrar o armazenamento desta Prefeitura';
  end if;

  select * into _row
  from public.municipal_storage_connections
  where municipality_id=_municipality_id;

  if _row.municipality_id is null then
    return jsonb_build_object(
      'municipality_id',_municipality_id,
      'provider','sigapro_r2',
      'status','active'
    );
  end if;

  return jsonb_build_object(
    'municipality_id',_row.municipality_id,
    'provider',_row.provider,
    'status',_row.status,
    'endpoint_url',coalesce(_row.endpoint_url,''),
    'region',coalesce(_row.region,'us-east-1'),
    'bucket_documents',coalesce(_row.bucket_documents,''),
    'base_path',coalesce(_row.base_path,''),
    'force_path_style',_row.force_path_style,
    'credentials_ciphertext',_row.credentials_ciphertext,
    'credential_fingerprint',coalesce(_row.credential_fingerprint,'')
  );
end;
$function$;

create or replace function public.resolve_municipal_storage_secret_v1(_municipality_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _row public.municipal_storage_connections%rowtype;
begin
  if not public.has_tenant_access(_municipality_id) and not public.is_master() then
    raise exception 'Sem acesso ao armazenamento desta Prefeitura';
  end if;

  select * into _row
  from public.municipal_storage_connections
  where municipality_id=_municipality_id;

  if _row.municipality_id is null or _row.provider <> 's3_compatible' or _row.status <> 'active' then
    return jsonb_build_object(
      'municipality_id',_municipality_id,
      'provider','sigapro_r2',
      'status','active'
    );
  end if;

  return jsonb_build_object(
    'municipality_id',_row.municipality_id,
    'provider',_row.provider,
    'status',_row.status,
    'endpoint_url',coalesce(_row.endpoint_url,''),
    'region',coalesce(_row.region,'us-east-1'),
    'bucket_documents',coalesce(_row.bucket_documents,''),
    'base_path',coalesce(_row.base_path,''),
    'force_path_style',_row.force_path_style,
    'credentials_ciphertext',_row.credentials_ciphertext,
    'credential_fingerprint',coalesce(_row.credential_fingerprint,'')
  );
end;
$function$;

create or replace function public.save_municipal_storage_connection_v1(
  _municipality_id uuid,
  _endpoint_url text,
  _region text,
  _bucket_documents text,
  _base_path text,
  _force_path_style boolean,
  _credentials_ciphertext text default null,
  _credential_fingerprint text default null
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
  if not public.is_municipal_storage_admin(_municipality_id) then
    raise exception 'Sem permissao para administrar o armazenamento desta Prefeitura';
  end if;

  if nullif(btrim(coalesce(_endpoint_url,'')),'') is null then
    raise exception 'Endpoint do armazenamento e obrigatorio';
  end if;
  if nullif(btrim(coalesce(_bucket_documents,'')),'') is null then
    raise exception 'Bucket de documentos e obrigatorio';
  end if;

  insert into public.municipal_storage_connections(
    municipality_id,provider,status,endpoint_url,region,bucket_documents,
    base_path,force_path_style,credentials_ciphertext,credential_fingerprint,
    last_tested_at,last_test_status,last_test_message,updated_by,updated_at
  )
  values(
    _municipality_id,'s3_compatible','configured',
    btrim(_endpoint_url),coalesce(nullif(btrim(_region),''),'us-east-1'),
    btrim(_bucket_documents),trim(both '/' from coalesce(_base_path,'')),
    coalesce(_force_path_style,false),_credentials_ciphertext,_credential_fingerprint,
    null,null,null,_profile_id,now()
  )
  on conflict (municipality_id) do update set
    provider='s3_compatible',
    status='configured',
    endpoint_url=excluded.endpoint_url,
    region=excluded.region,
    bucket_documents=excluded.bucket_documents,
    base_path=excluded.base_path,
    force_path_style=excluded.force_path_style,
    credentials_ciphertext=coalesce(excluded.credentials_ciphertext,public.municipal_storage_connections.credentials_ciphertext),
    credential_fingerprint=coalesce(excluded.credential_fingerprint,public.municipal_storage_connections.credential_fingerprint),
    last_tested_at=null,
    last_test_status=null,
    last_test_message=null,
    updated_by=_profile_id,
    updated_at=now();

  return public.get_municipal_storage_connection_v1(_municipality_id);
end;
$function$;

create or replace function public.mark_municipal_storage_test_v1(
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
  if not public.is_municipal_storage_admin(_municipality_id) then
    raise exception 'Sem permissao para administrar o armazenamento desta Prefeitura';
  end if;

  update public.municipal_storage_connections
  set last_tested_at=now(),
      last_test_status=case when _ok then 'ok' else 'error' end,
      last_test_message=left(coalesce(_message,''),1000),
      status=case when _ok then 'configured' else 'error' end,
      updated_at=now()
  where municipality_id=_municipality_id;

  return public.get_municipal_storage_connection_v1(_municipality_id);
end;
$function$;

create or replace function public.activate_municipal_storage_connection_v1(_municipality_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
begin
  if not public.is_municipal_storage_admin(_municipality_id) then
    raise exception 'Sem permissao para administrar o armazenamento desta Prefeitura';
  end if;

  if not exists (
    select 1
    from public.municipal_storage_connections
    where municipality_id=_municipality_id
      and provider='s3_compatible'
      and last_test_status='ok'
      and credentials_ciphertext is not null
      and nullif(btrim(coalesce(endpoint_url,'')),'') is not null
      and nullif(btrim(coalesce(bucket_documents,'')),'') is not null
  ) then
    raise exception 'Teste a conexao com sucesso antes de ativar o armazenamento da Prefeitura';
  end if;

  update public.municipal_storage_connections
  set status='active',
      updated_by=public.current_profile_id(),
      updated_at=now()
  where municipality_id=_municipality_id;

  return public.get_municipal_storage_connection_v1(_municipality_id);
end;
$function$;

create or replace function public.use_sigapro_storage_v1(_municipality_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
begin
  if not public.is_municipal_storage_admin(_municipality_id) then
    raise exception 'Sem permissao para administrar o armazenamento desta Prefeitura';
  end if;

  insert into public.municipal_storage_connections(
    municipality_id,provider,status,updated_by,updated_at
  )
  values(
    _municipality_id,'sigapro_r2','active',public.current_profile_id(),now()
  )
  on conflict (municipality_id) do update set
    provider='sigapro_r2',
    status='active',
    updated_by=public.current_profile_id(),
    updated_at=now();

  return public.get_municipal_storage_connection_v1(_municipality_id);
end;
$function$;

grant execute on function public.get_municipal_storage_connection_v1(uuid) to authenticated;
grant execute on function public.get_municipal_storage_secret_admin_v1(uuid) to authenticated;
grant execute on function public.resolve_municipal_storage_secret_v1(uuid) to authenticated;
grant execute on function public.save_municipal_storage_connection_v1(uuid,text,text,text,text,boolean,text,text) to authenticated;
grant execute on function public.mark_municipal_storage_test_v1(uuid,boolean,text) to authenticated;
grant execute on function public.activate_municipal_storage_connection_v1(uuid) to authenticated;
grant execute on function public.use_sigapro_storage_v1(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
