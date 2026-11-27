-- Migração municipal para homologação. NÃO aplicar em produção sem autorização.
-- Compatível com Neon sem role anon; bloquear acesso público a configurações e segredos.
begin;

create table if not exists public.municipal_collection_configurations (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id) on delete restrict,
  version integer not null,
  mode text not null check (mode in ('sigapro','municipal_system')),
  status text not null default 'not_configured' check (status in ('not_configured','homologation','validated','active','error')),
  supplier_code text,
  supplier_name text,
  api_base_url text,
  environment text not null default 'test' check (environment in ('test','production')),
  integration_type text not null default 'automatic' check (integration_type in ('automatic','controlled_import')),
  secret_ciphertext text,
  secret_fingerprint text,
  public_parameters jsonb not null default '{}'::jsonb,
  capabilities jsonb not null default '{}'::jsonb,
  validation_message text,
  validated_at timestamptz,
  activated_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(municipality_id,version)
);
alter table public.municipal_collection_configurations enable row level security;
revoke all on table public.municipal_collection_configurations from public, authenticated;

create table if not exists public.municipal_collection_operations (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id) on delete restrict,
  guide_id uuid not null references public.payment_guides(id) on delete restrict,
  configuration_id uuid not null references public.municipal_collection_configurations(id) on delete restrict,
  operation text not null check (operation in ('issue','query','pdf','payment','reissue','cancel')),
  idempotency_key text not null,
  status text not null default 'pending' check (status in ('pending','processing','succeeded','failed','unsupported')),
  attempt_count integer not null default 0,
  next_poll_at timestamptz,
  external_reference text,
  response_summary jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(municipality_id,guide_id,operation,idempotency_key)
);
alter table public.municipal_collection_operations enable row level security;
revoke all on table public.municipal_collection_operations from public, authenticated;

create table if not exists public.municipal_collection_webhook_events (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id) on delete restrict,
  configuration_id uuid not null references public.municipal_collection_configurations(id) on delete restrict,
  supplier_event_id text not null,
  signature_verified boolean not null default false,
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  processing_status text not null default 'received' check (processing_status in ('received','processed','rejected','failed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(configuration_id,supplier_event_id)
);
alter table public.municipal_collection_webhook_events enable row level security;
revoke all on table public.municipal_collection_webhook_events from public, authenticated;

alter table public.payment_guides
  add column if not exists collection_configuration_id uuid references public.municipal_collection_configurations(id) on delete restrict,
  add column if not exists collection_mode_snapshot text,
  add column if not exists collection_provider_snapshot text,
  add column if not exists collection_configuration_version integer,
  add column if not exists collection_capabilities_snapshot jsonb,
  add column if not exists collection_public_parameters_snapshot jsonb;

create or replace function public.can_read_municipal_collection_v1(_municipality_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public set row_security=off as $$
  select public.is_master() or (public.has_tenant_access(_municipality_id) and public.is_internal_municipality_role())
$$;

create or replace function public.get_municipal_collection_configuration_v1(_municipality_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public set row_security=off as $$
declare c public.municipal_collection_configurations; begin
  if not public.can_read_municipal_collection_v1(_municipality_id) then raise exception 'Sem acesso à configuração de arrecadação'; end if;
  select * into c from public.municipal_collection_configurations where municipality_id=_municipality_id order by version desc limit 1;
  if c.id is null then return jsonb_build_object('municipality_id',_municipality_id,'status','not_configured','mode','sigapro','enabled',false); end if;
  return (to_jsonb(c)-array['secret_ciphertext']) || jsonb_build_object('secret_configured',c.secret_ciphertext is not null);
end $$;

create or replace function public.get_municipal_collection_secret_admin_v1(_municipality_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public set row_security=off as $$
declare c public.municipal_collection_configurations; begin
  if not public.is_municipal_payment_admin(_municipality_id) then raise exception 'Sem permissão para administrar arrecadação'; end if;
  select * into strict c from public.municipal_collection_configurations where municipality_id=_municipality_id order by version desc limit 1;
  return to_jsonb(c);
end $$;

create or replace function public.save_municipal_collection_configuration_v1(
  _municipality_id uuid,_mode text,_supplier_code text,_supplier_name text,_api_base_url text,
  _environment text,_integration_type text,_secret_ciphertext text,_secret_fingerprint text,
  _public_parameters jsonb,_capabilities jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public set row_security=off as $$
declare c public.municipal_collection_configurations; previous public.municipal_collection_configurations; next_version integer; begin
  if not public.is_municipal_payment_admin(_municipality_id) then raise exception 'Sem permissão para administrar arrecadação'; end if;
  if _mode not in ('sigapro','municipal_system') or _environment not in ('test','production') or _integration_type not in ('automatic','controlled_import') then raise exception 'Configuração de arrecadação inválida'; end if;
  if _api_base_url <> '' and _api_base_url !~ '^https://' then raise exception 'A URL oficial deve usar HTTPS'; end if;
  select * into previous from public.municipal_collection_configurations where municipality_id=_municipality_id order by version desc limit 1;
  select coalesce(max(version),0)+1 into next_version from public.municipal_collection_configurations where municipality_id=_municipality_id;
  insert into public.municipal_collection_configurations(municipality_id,version,mode,status,supplier_code,supplier_name,api_base_url,environment,integration_type,secret_ciphertext,secret_fingerprint,public_parameters,capabilities,created_by)
  values(_municipality_id,next_version,_mode,'homologation',nullif(_supplier_code,''),nullif(_supplier_name,''),nullif(_api_base_url,''),_environment,_integration_type,coalesce(_secret_ciphertext,previous.secret_ciphertext),coalesce(_secret_fingerprint,previous.secret_fingerprint),coalesce(_public_parameters,'{}'),coalesce(_capabilities,'{}'),public.current_profile_id()) returning * into c;
  return public.get_municipal_collection_configuration_v1(_municipality_id);
end $$;

create or replace function public.mark_municipal_collection_validation_v1(_municipality_id uuid,_ok boolean,_message text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public set row_security=off as $$ begin
  if not public.is_municipal_payment_admin(_municipality_id) then raise exception 'Sem permissão para administrar arrecadação'; end if;
  update public.municipal_collection_configurations set status=case when _ok then 'validated' else 'error' end,validated_at=case when _ok then now() else null end,validation_message=left(coalesce(_message,''),1000)
  where id=(select id from public.municipal_collection_configurations where municipality_id=_municipality_id order by version desc limit 1);
  return public.get_municipal_collection_configuration_v1(_municipality_id);
end $$;

create or replace function public.activate_municipal_collection_configuration_v1(_municipality_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public set row_security=off as $$
declare target public.municipal_collection_configurations; begin
  if not public.is_municipal_payment_admin(_municipality_id) then raise exception 'Sem permissão para administrar arrecadação'; end if;
  select * into strict target from public.municipal_collection_configurations where municipality_id=_municipality_id order by version desc limit 1 for update;
  if target.status <> 'validated' then raise exception 'Valide a configuração antes de ativar'; end if;
  if target.mode='municipal_system' and target.integration_type='automatic' and target.secret_ciphertext is null then raise exception 'Credencial do sistema municipal ausente'; end if;
  update public.municipal_collection_configurations set status=case when id=target.id then 'active' else case when status='active' then 'validated' else status end end,activated_at=case when id=target.id then now() else activated_at end where municipality_id=_municipality_id;
  return public.get_municipal_collection_configuration_v1(_municipality_id);
end $$;

create or replace function public.snapshot_payment_guide_collection_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog,public set row_security=off as $$ declare c public.municipal_collection_configurations; begin
  select * into c from public.municipal_collection_configurations where municipality_id=new.municipality_id and status='active' order by version desc limit 1;
  if c.id is not null then
    new.collection_configuration_id:=c.id; new.collection_mode_snapshot:=c.mode;
    new.collection_provider_snapshot:=c.supplier_code; new.collection_configuration_version:=c.version;
    new.collection_capabilities_snapshot:=c.capabilities; new.collection_public_parameters_snapshot:=c.public_parameters;
  end if;
  return new;
end $$;
drop trigger if exists snapshot_payment_guide_collection on public.payment_guides;
create trigger snapshot_payment_guide_collection before insert on public.payment_guides for each row execute function public.snapshot_payment_guide_collection_v1();

create or replace function public.authorize_payment_guide_charge_v1(_municipality_id uuid,_guide_code text)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$ declare g public.payment_guides; begin
  select * into strict g from public.payment_guides where municipality_id=_municipality_id and guide_number=_guide_code;
  perform public.assert_dam_writer_v1(g);
  return not coalesce(g.paid,false) and lower(coalesce(g.status,'')) not in ('compensada','paid','pago','confirmed','confirmado') and g.document_snapshot is null and nullif(btrim(g.bank_reference),'') is null and coalesce(g.collection_mode_snapshot,'sigapro') <> 'municipal_system';
end $$;

revoke all on function public.can_read_municipal_collection_v1(uuid) from public;
revoke all on function public.get_municipal_collection_configuration_v1(uuid) from public;
revoke all on function public.get_municipal_collection_secret_admin_v1(uuid) from public;
revoke all on function public.save_municipal_collection_configuration_v1(uuid,text,text,text,text,text,text,text,text,jsonb,jsonb) from public;
revoke all on function public.mark_municipal_collection_validation_v1(uuid,boolean,text) from public;
revoke all on function public.activate_municipal_collection_configuration_v1(uuid) from public;
grant execute on function public.get_municipal_collection_configuration_v1(uuid) to authenticated;
grant execute on function public.get_municipal_collection_secret_admin_v1(uuid) to authenticated;
grant execute on function public.save_municipal_collection_configuration_v1(uuid,text,text,text,text,text,text,text,text,jsonb,jsonb) to authenticated;
grant execute on function public.mark_municipal_collection_validation_v1(uuid,boolean,text) to authenticated;
grant execute on function public.activate_municipal_collection_configuration_v1(uuid) to authenticated;
commit;
notify pgrst,'reload schema';
