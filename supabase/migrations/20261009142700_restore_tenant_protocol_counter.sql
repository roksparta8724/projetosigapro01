-- SIGAPRO: restaura a infraestrutura canônica de numeração por Prefeitura.
-- Migration corretiva: migrations posteriores chamam next_tenant_protocol_number(),
-- portanto a função, contador e unicidade por tenant precisam existir em qualquer ambiente.

create table if not exists public.tenant_protocol_counters (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  protocol_year integer not null check (protocol_year between 2000 and 9999),
  prefix text not null check (char_length(prefix) between 1 and 16),
  last_value bigint not null default 0 check (last_value >= 0),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, protocol_year, prefix)
);

revoke all on table public.tenant_protocol_counters from public;
revoke all on table public.tenant_protocol_counters from authenticated;

insert into public.tenant_protocol_counters(tenant_id,protocol_year,prefix,last_value)
select
  p.tenant_id,
  (parts.match)[2]::integer,
  upper((parts.match)[1]),
  max(((parts.match)[3])::bigint)
from public.processes p
cross join lateral (
  select regexp_match(p.protocol_number, '^([A-Za-z0-9]+)-([0-9]{4})-([0-9]+)$') as match
) parts
where parts.match is not null
group by p.tenant_id,(parts.match)[2],upper((parts.match)[1])
on conflict (tenant_id,protocol_year,prefix)
do update set
  last_value = greatest(public.tenant_protocol_counters.last_value, excluded.last_value),
  updated_at = now();

create or replace function public.next_tenant_protocol_number(
  _tenant_id uuid,
  _prefix text,
  _year integer default extract(year from current_date)::integer
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $function$
declare
  _normalized_prefix text :=
    upper(regexp_replace(coalesce(nullif(btrim(_prefix),''),'PM'),'[^A-Za-z0-9]','','g'));
  _next_value bigint;
begin
  if _tenant_id is null then
    raise exception 'Prefeitura invalida para gerar protocolo';
  end if;

  if _year < 2000 or _year > 9999 then
    raise exception 'Ano invalido para gerar protocolo';
  end if;

  insert into public.tenant_protocol_counters(
    tenant_id,protocol_year,prefix,last_value,updated_at
  )
  values(_tenant_id,_year,_normalized_prefix,1,now())
  on conflict (tenant_id,protocol_year,prefix)
  do update set
    last_value = public.tenant_protocol_counters.last_value + 1,
    updated_at = now()
  returning last_value into _next_value;

  return _normalized_prefix || '-' || _year::text || '-' || lpad(_next_value::text,5,'0');
end;
$function$;

revoke all on function public.next_tenant_protocol_number(uuid,text,integer) from public;
revoke all on function public.next_tenant_protocol_number(uuid,text,integer) from authenticated;

alter table public.processes
  drop constraint if exists processes_protocol_number_key;

create unique index if not exists processes_tenant_protocol_uidx
  on public.processes(tenant_id,protocol_number);

create or replace function public.generate_process_protocol()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  _prefix text;
begin
  if new.protocol_number is null or btrim(new.protocol_number)='' then
    select nullif(btrim(ms.protocol_prefix),'')
      into _prefix
    from public.municipality_settings ms
    where ms.municipality_id = new.tenant_id
    limit 1;

    new.protocol_number := public.next_tenant_protocol_number(
      new.tenant_id,
      coalesce(_prefix,'PM'),
      extract(year from current_date)::integer
    );
  end if;

  if new.external_protocol_number is null or btrim(new.external_protocol_number)='' then
    new.external_protocol_number := new.protocol_number;
  end if;

  return new;
end;
$function$;
