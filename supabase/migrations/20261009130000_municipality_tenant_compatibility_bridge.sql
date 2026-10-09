-- SIGAPRO: ponte temporária de compatibilidade entre municipalities (canônico)
-- e tenants (legado ainda referenciado por algumas FKs).
create or replace function public.sync_municipality_to_legacy_tenant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  _tenant_status public.tenant_status;
  _city text;
  _state text;
  _subdomain text;
begin
  _tenant_status :=
    case lower(coalesce(new.status,'active'))
      when 'active' then 'ativo'::public.tenant_status
      when 'ativo' then 'ativo'::public.tenant_status
      when 'implementation' then 'implantacao'::public.tenant_status
      when 'implantacao' then 'implantacao'::public.tenant_status
      when 'inactive' then 'suspenso'::public.tenant_status
      when 'blocked' then 'suspenso'::public.tenant_status
      when 'suspended' then 'suspenso'::public.tenant_status
      when 'suspenso' then 'suspenso'::public.tenant_status
      when 'closed' then 'encerrado'::public.tenant_status
      when 'ended' then 'encerrado'::public.tenant_status
      when 'encerrado' then 'encerrado'::public.tenant_status
      else 'implantacao'::public.tenant_status
    end;

  _city := coalesce(
    nullif(trim(to_jsonb(new)->>'city'),''),
    nullif(trim(new.name),''),
    'Municipio'
  );
  _state := coalesce(nullif(upper(trim(new.state)),''), 'ND');
  _subdomain := coalesce(nullif(trim(new.subdomain),''), nullif(trim(new.slug),''), null);

  insert into public.tenants(
    id, legal_name, display_name, city, state, status, subdomain, updated_at
  )
  values(
    new.id,
    new.name,
    new.name,
    _city,
    _state,
    _tenant_status,
    _subdomain,
    now()
  )
  on conflict (id) do update
    set legal_name=excluded.legal_name,
        display_name=excluded.display_name,
        city=excluded.city,
        state=excluded.state,
        status=excluded.status,
        subdomain=excluded.subdomain,
        updated_at=now();

  return new;
end;
$function$;

drop trigger if exists trg_sync_municipality_to_legacy_tenant on public.municipalities;

create trigger trg_sync_municipality_to_legacy_tenant
after insert or update
on public.municipalities
for each row
execute function public.sync_municipality_to_legacy_tenant();

-- Garante o espelho dos registros atuais sem mudar seus UUIDs.
update public.municipalities
set updated_at=updated_at;
