-- SIGAPRO: numeração canônica por Prefeitura + ano + prefixo.
-- Elimina sequência global e permite o mesmo número administrativo em municípios distintos.

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

create or replace function public.create_external_process_v2(
  _tenant_id uuid,
  _payload jsonb,
  _protocol_prefix text default 'PM',
  _requested_protocol_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _property_id uuid;
  _process_id uuid;
  _protocol text;
  _guide_number text;
  _guide_id uuid;
  _due_date date := current_date + 2;
  _amount numeric := coalesce(nullif(_payload->>'amount','')::numeric, 35.24);
  _doc jsonb;
  _existing_tenant uuid;
  _prefix text := upper(regexp_replace(coalesce(nullif(_protocol_prefix,''),'PM'), '[^A-Za-z0-9]', '', 'g'));
  _guide_prefix text := upper(regexp_replace(coalesce(nullif(_payload->>'guidePrefix',''),'DAM'), '[^A-Za-z0-9]', '', 'g'));
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if not public.has_tenant_access(_tenant_id) then
    raise exception 'Usuario sem vinculo com a prefeitura';
  end if;

  if _requested_protocol_number is not null and btrim(_requested_protocol_number) <> '' then
    select p.id, p.tenant_id, p.property_id, p.protocol_number
      into _process_id, _existing_tenant, _property_id, _protocol
    from public.processes p
    where p.tenant_id = _tenant_id
      and p.protocol_number = btrim(_requested_protocol_number)
    limit 1;

    if _process_id is not null then
      if _existing_tenant <> _tenant_id then
        raise exception 'Numero de protocolo ja pertence a outra prefeitura';
      end if;

      select g.id, g.guide_number, g.amount, g.due_date
        into _guide_id, _guide_number, _amount, _due_date
      from public.payment_guides g
      where g.process_id = _process_id
      order by case when g.guide_kind = 'protocolo' then 0 else 1 end, g.created_at
      limit 1;

      if _guide_id is null then
        _guide_number := coalesce(
          nullif(_payload->>'guideNumber',''),
          _guide_prefix || '-' || regexp_replace(_protocol, '^[^-]+-', '')
        );

        insert into public.payment_guides(
          tenant_id, municipality_id, process_id, property_id,
          guide_number, municipal_registration, amount, due_date,
          status, paid, guide_kind
        )
        values(
          _tenant_id, _tenant_id, _process_id, _property_id,
          _guide_number, nullif(_payload->>'iptu',''), _amount, _due_date,
          'pendente', false, 'protocolo'
        )
        returning id into _guide_id;
      end if;

      return jsonb_build_object(
        'process_id', _process_id,
        'protocol_number', _protocol,
        'guide_number', _guide_number,
        'due_date', _due_date,
        'amount', _amount,
        'reconciled', true,
        'existing', true
      );
    end if;
  end if;

  insert into public.properties(
    tenant_id, municipality_id, iptu_code, registry_code, address,
    lot, block, usage_type, construction_standard, area_m2
  )
  values(
    _tenant_id,
    _tenant_id,
    coalesce(nullif(_payload->>'iptu',''), 'NAO-INFORMADO'),
    nullif(_payload->>'registration',''),
    coalesce(nullif(_payload->>'address',''), 'Endereco nao informado'),
    nullif(_payload->>'lot',''),
    nullif(_payload->>'block',''),
    nullif(_payload->>'usage',''),
    nullif(_payload->>'constructionStandard',''),
    nullif(_payload->>'area','')::numeric
  )
  returning id into _property_id;

  if _requested_protocol_number is not null and btrim(_requested_protocol_number) <> '' then
    _protocol := btrim(_requested_protocol_number);
  else
    _protocol := public.next_tenant_protocol_number(
      _tenant_id,
      _prefix,
      extract(year from current_date)::integer
    );
  end if;

  insert into public.processes(
    tenant_id, municipality_id, property_id, created_by, created_by_profile_id,
    protocol_number, external_protocol_number, title, process_type, status,
    current_queue, current_department, checklist_type, triage_status,
    triage_assigned_to, triage_notes, sla_stage, sla_due_at,
    sla_hours_remaining, sla_breached
  )
  values(
    _tenant_id, _tenant_id, _property_id, _legacy_user_id, _profile_id,
    _protocol, _protocol,
    coalesce(nullif(_payload->>'title',''),'Projeto sem titulo'),
    coalesce(nullif(_payload->>'type',''),'licenciamento'),
    'pagamento_pendente',
    'Setor de protocolo','Protocolo',
    coalesce(nullif(_payload->>'type',''),'licenciamento'),
    'recebido',
    'Setor de protocolo',
    'Aguardando conferencia inicial e validacao da guia.',
    'Triagem inicial',
    now() + interval '2 days',
    48,
    false
  )
  returning id into _process_id;

  insert into public.process_parties(
    process_id, tenant_id, user_id, profile_id, party_type,
    display_name, document_masked, is_primary
  )
  values
    (
      _process_id, _tenant_id, _legacy_user_id, _profile_id, 'profissional_externo',
      coalesce(nullif(_payload->>'technicalLead',''),'Profissional externo'), null, true
    ),
    (
      _process_id, _tenant_id, null, null, 'proprietario',
      coalesce(nullif(_payload->>'ownerName',''),'Proprietario nao informado'),
      case
        when length(regexp_replace(coalesce(_payload->>'ownerDocument',''), '\D','','g')) < 4 then null
        else '***' || right(regexp_replace(_payload->>'ownerDocument','\D','','g'),4)
      end,
      false
    );

  _guide_number := coalesce(
    nullif(_payload->>'guideNumber',''),
    _guide_prefix || '-' || regexp_replace(_protocol, '^[^-]+-', '')
  );

  insert into public.payment_guides(
    tenant_id, municipality_id, process_id, property_id,
    guide_number, municipal_registration, amount, due_date,
    status, paid, guide_kind
  )
  values(
    _tenant_id, _tenant_id, _process_id, _property_id,
    _guide_number, nullif(_payload->>'iptu',''),
    _amount, _due_date, 'pendente', false, 'protocolo'
  )
  returning id into _guide_id;

  insert into public.process_movements(
    tenant_id, process_id, actor_user_id, actor_profile_id,
    movement_type, from_status, to_status, description, visible_to_external
  )
  values
    (
      _tenant_id, _process_id, _legacy_user_id, _profile_id,
      'protocolo', null, 'pagamento_pendente',
      'Protocolo criado pelo portal externo.', true
    ),
    (
      _tenant_id, _process_id, _legacy_user_id, _profile_id,
      'guia_emitida', 'pagamento_pendente', 'pagamento_pendente',
      'Guia DAM emitida automaticamente para o processo.', true
    );

  insert into public.process_audit_entries(
    tenant_id, process_id, actor_user_id, actor_profile_id,
    category, title, detail, visible_to_external
  )
  values
    (
      _tenant_id, _process_id, _legacy_user_id, _profile_id,
      'sistema', 'Processo protocolado',
      'Cadastro inicial concluido com numeracao oficial.', true
    ),
    (
      _tenant_id, _process_id, _legacy_user_id, _profile_id,
      'financeiro', 'Guia inicial emitida',
      'Guia municipal criada automaticamente no protocolo.', true
    );

  if jsonb_typeof(_payload->'documents') = 'array' then
    for _doc in select value from jsonb_array_elements(_payload->'documents')
    loop
      insert into public.process_documents(
        tenant_id, process_id, uploaded_by, uploaded_by_profile_id,
        title, file_path, file_hash, version, source, is_required, is_valid,
        file_name, mime_type, size_label, preview_url, review_status, annotations
      )
      values(
        _tenant_id, _process_id, _legacy_user_id, _profile_id,
        coalesce(_doc->>'label',_doc->>'fileName','Documento'),
        coalesce(_doc->>'filePath','pending/'||coalesce(_doc->>'fileName',gen_random_uuid()::text)),
        encode(digest(coalesce(_doc->>'fileName',gen_random_uuid()::text),'sha256'),'hex'),
        coalesce(nullif(_doc->>'version','')::integer,1),
        coalesce(nullif(_doc->>'source',''),'profissional'),
        coalesce(nullif(_doc->>'required','')::boolean,true),
        true,
        _doc->>'fileName',
        _doc->>'mimeType',
        _doc->>'sizeLabel',
        case when length(coalesce(_doc->>'previewUrl','')) > 2000000 then null else _doc->>'previewUrl' end,
        coalesce(nullif(_doc->>'reviewStatus',''),'pendente'),
        coalesce(_doc->'annotations','[]'::jsonb)
      );
    end loop;
  end if;

  return jsonb_build_object(
    'process_id', _process_id,
    'protocol_number', _protocol,
    'guide_number', _guide_number,
    'due_date', _due_date,
    'amount', _amount,
    'reconciled', (_requested_protocol_number is not null),
    'existing', false
  );
end;
$function$;

revoke all on function public.create_external_process_v2(uuid,jsonb,text,text) from public;
grant execute on function public.create_external_process_v2(uuid,jsonb,text,text) to authenticated;

-- O RPC v1 não participa mais do fluxo oficial. Mantido apenas para histórico do schema.
revoke all on function public.create_external_process(
  uuid,text,text,text,text,text,text,text,numeric,text,text,text,text,text,jsonb,text
) from public;
revoke all on function public.create_external_process(
  uuid,text,text,text,text,text,text,text,numeric,text,text,text,text,text,jsonb,text
) from authenticated;

-- Estruturas globais antigas, sem consumidores após a migração.
drop function if exists public.gerar_protocolo_oficial();
drop table if exists public.sequencia_protocolo;
drop sequence if exists public.process_protocol_seq;
