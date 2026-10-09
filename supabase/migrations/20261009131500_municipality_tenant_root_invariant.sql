-- SIGAPRO: garante a invariável municipality <-> tenant root.
-- municipalities é a entidade municipal canônica; tenants permanece como raiz técnica
-- exigida pelas FKs de isolamento multi-tenant.

create or replace function public.sync_municipality_tenant_root()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  _status public.tenant_status;
  _name text;
  _city text;
  _state text;
  _subdomain text;
begin
  _name := coalesce(nullif(btrim(new.name), ''), 'Prefeitura');
  _city := coalesce(nullif(btrim(to_jsonb(new)->>'city'), ''), _name);
  _state := upper(coalesce(nullif(btrim(new.state), ''), 'SP'));
  _subdomain := coalesce(nullif(btrim(new.subdomain), ''), nullif(btrim(new.slug), ''));

  _status := case lower(coalesce(new.status, 'active'))
    when 'active' then 'ativo'::public.tenant_status
    when 'ativo' then 'ativo'::public.tenant_status
    when 'implementation' then 'implantacao'::public.tenant_status
    when 'implantacao' then 'implantacao'::public.tenant_status
    when 'blocked' then 'suspenso'::public.tenant_status
    when 'inactive' then 'suspenso'::public.tenant_status
    when 'suspenso' then 'suspenso'::public.tenant_status
    when 'closed' then 'encerrado'::public.tenant_status
    when 'encerrado' then 'encerrado'::public.tenant_status
    else 'implantacao'::public.tenant_status
  end;

  insert into public.tenants(
    id, legal_name, display_name, cnpj, city, state, status, subdomain, created_at, updated_at
  )
  values(
    new.id, _name, _name, '', _city, _state, _status, _subdomain,
    coalesce(new.created_at, now()), now()
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

drop trigger if exists trg_sync_municipality_tenant_root on public.municipalities;
create trigger trg_sync_municipality_tenant_root
after insert or update
on public.municipalities
for each row
execute function public.sync_municipality_tenant_root();

insert into public.tenants(
  id, legal_name, display_name, cnpj, city, state, status, subdomain, created_at, updated_at
)
select
  m.id,
  coalesce(nullif(btrim(m.name),''),'Prefeitura'),
  coalesce(nullif(btrim(m.name),''),'Prefeitura'),
  '',
  coalesce(
    nullif(btrim(to_jsonb(m)->>'city'),''),
    coalesce(nullif(btrim(m.name),''),'Prefeitura')
  ),
  upper(coalesce(nullif(btrim(m.state),''),'SP')),
  case lower(coalesce(m.status,'active'))
    when 'active' then 'ativo'::public.tenant_status
    when 'ativo' then 'ativo'::public.tenant_status
    when 'implementation' then 'implantacao'::public.tenant_status
    when 'implantacao' then 'implantacao'::public.tenant_status
    when 'blocked' then 'suspenso'::public.tenant_status
    when 'inactive' then 'suspenso'::public.tenant_status
    when 'suspenso' then 'suspenso'::public.tenant_status
    when 'closed' then 'encerrado'::public.tenant_status
    when 'encerrado' then 'encerrado'::public.tenant_status
    else 'implantacao'::public.tenant_status
  end,
  coalesce(nullif(btrim(m.subdomain),''),nullif(btrim(m.slug),'')),
  coalesce(m.created_at,now()),
  now()
from public.municipalities m
where not exists (select 1 from public.tenants t where t.id=m.id);
