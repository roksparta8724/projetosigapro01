-- SIGAPRO — referência financeira oficial após a oficialização do pré-protocolo.
-- Antes da compensação existe apenas PRE-PM-... e DAM-PRE-...
-- Depois da compensação o processo recebe a próxima sequência PM oficial.
-- A guia paga original continua imutável para auditoria/banco, mas passa a ter
-- uma referência oficial vinculada ao número sequencial do processo.

alter table public.payment_guides
  add column if not exists official_process_reference text;

create index if not exists idx_payment_guides_official_process_reference
  on public.payment_guides(municipality_id,official_process_reference)
  where official_process_reference is not null;

create or replace function public.next_tenant_preprotocol_number(
  _tenant_id uuid,
  _prefix text,
  _year integer default extract(year from current_date)::integer
)
returns text
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _normalized_prefix text :=
    upper(regexp_replace(coalesce(nullif(btrim(_prefix),''),'PM'),'[^A-Za-z0-9]','','g'));
  _token text;
begin
  if _tenant_id is null then
    raise exception 'Prefeitura invalida para gerar pre-protocolo';
  end if;

  if _year < 2000 or _year > 9999 then
    raise exception 'Ano invalido para gerar pre-protocolo';
  end if;

  -- O pré-protocolo NÃO toca no contador oficial PM.
  loop
    _token :=
      'PRE-' || _normalized_prefix || '-' ||
      to_char(clock_timestamp(),'YYYYMMDD') || '-' ||
      upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));

    exit when not exists (
      select 1
      from public.processes p
      where p.tenant_id=_tenant_id
        and (p.pre_protocol_number=_token or p.protocol_number=_token)
    );
  end loop;

  return _token;
end;
$function$;

create or replace function public.officialize_preprotocol_v1(
  _process_id uuid,
  _payment_guide_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _process public.processes%rowtype;
  _guide public.payment_guides%rowtype;
  _official_protocol text;
  _official_guide_reference text;
  _municipality uuid;
  _prefix text := 'PM';
  _guide_prefix text := 'DAM';
begin
  select * into _process
  from public.processes
  where id=_process_id
  for update;

  if _process.id is null then
    raise exception 'Pre-protocolo nao encontrado';
  end if;

  if _process.officialized_at is not null then
    select g.* into _guide
    from public.payment_guides g
    where g.process_id=_process.id
      and g.guide_kind='protocolo'
      and (
        coalesce(g.paid,false)=true
        or lower(coalesce(g.status,'')) in ('compensada','confirmed','paid','pago','confirmado')
      )
    order by g.paid_at desc nulls last,g.created_at desc
    limit 1;

    return jsonb_build_object(
      'process_id',_process.id,
      'protocol_number',_process.protocol_number,
      'pre_protocol_number',_process.pre_protocol_number,
      'officialized_at',_process.officialized_at,
      'official_guide_reference',_guide.official_process_reference,
      'existing',true
    );
  end if;

  select g.* into _guide
  from public.payment_guides g
  where g.process_id=_process_id
    and g.guide_kind='protocolo'
    and (_payment_guide_id is null or g.id=_payment_guide_id)
  order by g.created_at desc
  limit 1
  for update;

  if _guide.id is null then
    raise exception 'Guia inicial nao encontrada para o pre-protocolo';
  end if;

  if not (
    coalesce(_guide.paid,false)=true
    or lower(coalesce(_guide.status,'')) in ('compensada','confirmed','paid','pago','confirmado')
  ) then
    raise exception 'O processo municipal so pode ser criado depois da confirmacao do pagamento';
  end if;

  _municipality := coalesce(_process.municipality_id,_process.tenant_id);

  if lower(coalesce(_process.process_type,'')) like '%habite%' then
    if _process.preprotocol_payload is null then
      raise exception 'Revise e salve o rascunho do Habite-se antes do pagamento; os dados obrigatórios ainda não foram consolidados.';
    end if;
    perform public.validate_habite_se_submission_v1(
      _municipality,
      _process.preprotocol_payload
    );
  end if;

  perform public.assert_municipality_entitlement_v1(_municipality,'processes',1);

  select
    upper(regexp_replace(coalesce(nullif(ms.protocol_prefix,''),'PM'),'[^A-Za-z0-9]','','g')),
    upper(regexp_replace(coalesce(nullif(ms.guide_prefix,''),'DAM'),'[^A-Za-z0-9]','','g'))
    into _prefix,_guide_prefix
  from public.municipality_settings ms
  where ms.municipality_id=_municipality
  limit 1;

  _prefix := coalesce(nullif(_prefix,''),'PM');
  _guide_prefix := coalesce(nullif(_guide_prefix,''),'DAM');

  -- A única sequência oficial é consumida SOMENTE aqui, após a compensação.
  _official_protocol := public.next_tenant_protocol_number(
    _municipality,
    _prefix,
    extract(year from current_date)::integer
  );

  if exists (
    select 1
    from public.processes p
    where p.tenant_id=_process.tenant_id
      and p.protocol_number=_official_protocol
      and p.id<>_process.id
  ) then
    raise exception 'O numero oficial % ja esta em uso. Revise a sequencia antes de oficializar.',_official_protocol;
  end if;

  _official_guide_reference :=
    _guide_prefix || '-' || regexp_replace(_official_protocol,'^[^-]+-','');

  update public.processes
  set protocol_number=_official_protocol,
      external_protocol_number=_official_protocol,
      officialized_at=clock_timestamp(),
      officialized_by_payment_guide_id=_guide.id,
      status='triagem',
      current_department='Setor de Protocolo',
      current_queue='Triagem de Protocolo',
      triage_status='recebido',
      triage_assigned_to=null,
      triage_notes='Pagamento confirmado. Processo aberto para conferencia documental do Setor de Protocolo.',
      sla_stage='Triagem documental apos pagamento',
      sla_due_at=clock_timestamp()+interval '2 days',
      sla_hours_remaining=48,
      sla_breached=false,
      updated_at=clock_timestamp()
  where id=_process.id
  returning * into _process;

  -- Não altera guide_number: a guia efetivamente paga continua auditável.
  -- official_process_reference é a referência sequencial exibida após a oficialização.
  update public.payment_guides
  set official_process_reference=_official_guide_reference
  where id=_guide.id;

  insert into public.process_movements(
    tenant_id,process_id,actor_user_id,actor_profile_id,movement_type,
    from_status,to_status,description,visible_to_external,municipality_id
  )
  values(
    _process.tenant_id,_process.id,public.current_legacy_user_id(),public.current_profile_id(),
    'processo_oficializado','pagamento_pendente','triagem',
    'Pagamento confirmado. O processo municipal '||_official_protocol||
      ' foi criado neste momento. A guia original '||coalesce(_guide.guide_number,'')||
      ' permanece preservada e recebeu a referência oficial '||_official_guide_reference||'.',
    true,_municipality
  );

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,actor_profile_id,category,title,detail,
    visible_to_external,created_at,municipality_id
  )
  values(
    _process.tenant_id,_process.id,public.current_legacy_user_id(),public.current_profile_id(),
    'protocolo','Processo municipal criado apos pagamento',
    'O pre-protocolo '||coalesce(_process.pre_protocol_number,'nao informado')||
      ' recebeu o numero oficial '||_official_protocol||
      ' somente depois da compensacao da guia inicial. Referência financeira oficial: '||
      _official_guide_reference||'.',
    true,clock_timestamp(),_municipality
  );

  return jsonb_build_object(
    'process_id',_process.id,
    'protocol_number',_official_protocol,
    'pre_protocol_number',_process.pre_protocol_number,
    'officialized_at',_process.officialized_at,
    'payment_guide_id',_guide.id,
    'official_guide_reference',_official_guide_reference,
    'existing',false,
    'reserved_sequence',false
  );
end;
$function$;

-- Backfill: processos já oficializados recebem apenas a referência oficial de exibição.
-- A numeração original da guia NÃO é reescrita.
update public.payment_guides g
set official_process_reference =
  upper(regexp_replace(coalesce(nullif(ms.guide_prefix,''),'DAM'),'[^A-Za-z0-9]','','g'))
  || '-' || regexp_replace(p.protocol_number,'^[^-]+-','')
from public.processes p
left join public.municipality_settings ms
  on ms.municipality_id=coalesce(p.municipality_id,p.tenant_id)
where g.process_id=p.id
  and g.guide_kind='protocolo'
  and p.officialized_at is not null
  and p.protocol_number ~ '^[A-Z0-9]+-[0-9]{4}-[0-9]+$'
  and (
    coalesce(g.paid,false)=true
    or lower(coalesce(g.status,'')) in ('compensada','confirmed','paid','pago','confirmado')
  )
  and g.official_process_reference is null;

grant execute on function public.next_tenant_preprotocol_number(uuid,text,integer) to authenticated;
grant execute on function public.officialize_preprotocol_v1(uuid,uuid) to authenticated;

notify pgrst,'reload schema';
