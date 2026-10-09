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
  _cnpj text;
begin
  _name := coalesce(nullif(btrim(new.name), ''), 'Prefeitura');
  _city := coalesce(nullif(btrim(to_jsonb(new)->>'city'), ''), _name);
  _state := upper(coalesce(nullif(btrim(new.state), ''), 'SP'));
  _subdomain := coalesce(nullif(btrim(new.subdomain), ''), nullif(btrim(new.slug), ''));
  select nullif(btrim(ms.general_settings->>'cnpj'), '')
    into _cnpj
  from public.municipality_settings ms
  where ms.municipality_id = new.id
  limit 1;
  _cnpj := coalesce(_cnpj, 'technical:' || new.id::text);

  -- O município é a entidade canônica. Se uma raiz técnica legada usa o
  -- mesmo subdomínio com outro UUID, preservamos seus dados/FKs, mas retiramos
  -- dela o endereço público antes de criar/atualizar a raiz canônica.
  if _subdomain is not null then
    update public.tenants
       set subdomain = 'legacy-' || replace(id::text, '-', ''),
           cnpj = 'legacy:' || id::text,
           updated_at = now()
     where id <> new.id
       and lower(coalesce(subdomain, '')) = lower(_subdomain);
  end if;

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
    id, municipality_id, legal_name, display_name, cnpj, city, state, status, subdomain, created_at, updated_at
  )
  values(
    new.id, new.id, _name, _name, _cnpj, _city, _state, _status, _subdomain,
    coalesce(new.created_at, now()), now()
  )
  on conflict (id) do update
    set municipality_id=excluded.municipality_id,
        legal_name=excluded.legal_name,
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

-- Libera subdomínios públicos ocupados por raízes técnicas legadas com UUID
-- diferente. Nenhum tenant histórico é removido e nenhuma FK é reescrita.
update public.tenants t
   set subdomain = 'legacy-' || replace(t.id::text, '-', ''),
       cnpj = 'legacy:' || t.id::text,
       updated_at = now()
  from public.municipalities m
 where t.id <> m.id
   and coalesce(m.subdomain, '') <> ''
   and lower(coalesce(t.subdomain, '')) = lower(m.subdomain);

insert into public.tenants(
  id, municipality_id, legal_name, display_name, cnpj, city, state, status, subdomain, created_at, updated_at
)
select
  m.id,
  m.id,
  coalesce(nullif(btrim(m.name),''),'Prefeitura'),
  coalesce(nullif(btrim(m.name),''),'Prefeitura'),
  coalesce(
    nullif(btrim(ms.general_settings->>'cnpj'),''),
    'technical:' || m.id::text
  ),
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
left join public.municipality_settings ms on ms.municipality_id=m.id
where not exists (select 1 from public.tenants t where t.id=m.id);
