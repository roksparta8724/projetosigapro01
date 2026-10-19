-- SIGAPRO — Habite-se usa a MESMA sequencia oficial dos demais protocolos.
-- Antes do pagamento existe somente pre-protocolo; nao pode consumir numero PM oficial.

alter table public.processes
  alter column officialized_at drop default;

do $repair$
declare
  _row record;
  _pre text;
  _prefix text;
  _guide_prefix text;
  _year integer;
  _suffix text;
begin
  for _row in
    select
      p.id,
      p.tenant_id,
      coalesce(p.municipality_id,p.tenant_id) as municipality_id,
      p.protocol_number,
      p.process_type,
      p.created_by_profile_id,
      g.id as guide_id,
      g.guide_number
    from public.processes p
    join public.profiles creator on creator.id=p.created_by_profile_id
    join lateral (
      select pg.*
      from public.payment_guides pg
      where pg.process_id=p.id
        and pg.guide_kind='protocolo'
      order by pg.created_at asc
      limit 1
    ) g on true
    where p.officialized_at is not null
      and p.officialized_by_payment_guide_id is null
      and creator.role in ('profissional','profissional_externo','proprietario_consulta')
      and not coalesce(g.paid,false)
      and lower(coalesce(g.status,'pendente')) not in ('compensada','confirmed','paid','pago','confirmado')
      and not exists (
        select 1
        from public.process_movements m
        where m.process_id=p.id
          and m.movement_type in ('payment_confirmed','processo_oficializado')
      )
  loop
    select
      upper(regexp_replace(coalesce(nullif(ms.protocol_prefix,''),'PM'),'[^A-Za-z0-9]','','g')),
      upper(regexp_replace(coalesce(nullif(ms.guide_prefix,''),'DAM'),'[^A-Za-z0-9]','','g'))
      into _prefix,_guide_prefix
    from public.municipality_settings ms
    where ms.municipality_id=_row.municipality_id
    limit 1;

    _prefix := coalesce(nullif(_prefix,''),'PM');
    _guide_prefix := coalesce(nullif(_guide_prefix,''),'DAM');
    _year := extract(year from current_date)::integer;

    _pre := public.next_tenant_preprotocol_number(
      _row.tenant_id,
      _prefix,
      _year
    );

    update public.processes
    set protocol_number=_pre,
        external_protocol_number=_pre,
        pre_protocol_number=_pre,
        officialized_at=null,
        officialized_by_payment_guide_id=null,
        status='pagamento_pendente',
        current_department='Portal Externo',
        current_queue='Aguardando pagamento',
        triage_status='recebido',
        triage_assigned_to=null,
        triage_notes='Pre-protocolo aguardando a compensacao da guia inicial. Ainda nao e processo municipal.',
        sla_stage='Aguardando confirmacao da guia de protocolo',
        sla_due_at=clock_timestamp()+interval '2 days',
        sla_hours_remaining=48,
        sla_breached=false,
        updated_at=clock_timestamp()
    where id=_row.id;

    _suffix := regexp_replace(_pre,'^PRE-[^-]+-','');

    update public.payment_guides
    set guide_number=_guide_prefix||'-PRE-'||_suffix
    where id=_row.guide_id;

    insert into public.process_audit_entries(
      tenant_id,municipality_id,process_id,actor_user_id,actor_profile_id,
      category,title,detail,visible_to_external,created_at
    )
    values(
      _row.tenant_id,_row.municipality_id,_row.id,null,null,
      'sistema',
      'Fluxo de pre-protocolo corrigido',
      'O cadastro ainda nao possuia pagamento confirmado e foi devolvido ao estado de pre-protocolo. A numeracao oficial sera atribuida somente apos a compensacao da guia inicial.',
      true,clock_timestamp()
    );
  end loop;
end;
$repair$;

-- Recalcula o contador oficial apenas com processos realmente oficializados.
-- Assim um Habite-se sem pagamento nao "queima" numero da sequencia PM.
with official_max as (
  select
    p.tenant_id,
    extract(year from p.created_at)::integer as protocol_year,
    upper(regexp_replace(coalesce(nullif(ms.protocol_prefix,''),'PM'),'[^A-Za-z0-9]','','g')) as prefix,
    coalesce(
      max(
        case
          when p.officialized_at is not null
           and p.protocol_number ~ ('^'||
             upper(regexp_replace(coalesce(nullif(ms.protocol_prefix,''),'PM'),'[^A-Za-z0-9]','','g'))||
             '-[0-9]{4}-[0-9]+$')
          then nullif(regexp_replace(p.protocol_number,'.*-',''),'')::bigint
          else null
        end
      ),
      0
    ) as max_value
  from public.processes p
  left join public.municipality_settings ms
    on ms.municipality_id=coalesce(p.municipality_id,p.tenant_id)
  group by p.tenant_id,extract(year from p.created_at)::integer,
           upper(regexp_replace(coalesce(nullif(ms.protocol_prefix,''),'PM'),'[^A-Za-z0-9]','','g'))
)
insert into public.tenant_protocol_counters(
  tenant_id,protocol_year,prefix,last_value,updated_at
)
select tenant_id,protocol_year,coalesce(nullif(prefix,''),'PM'),max_value,clock_timestamp()
from official_max
where max_value > 0
on conflict (tenant_id,protocol_year,prefix)
do update set
  last_value=excluded.last_value,
  updated_at=excluded.updated_at;

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
  _prefix text := 'PM';
  _official_protocol text;
  _municipality uuid;
begin
  select * into _process
  from public.processes
  where id=_process_id
  for update;

  if _process.id is null then
    raise exception 'Pre-protocolo nao encontrado';
  end if;

  if _process.officialized_at is not null then
    return jsonb_build_object(
      'process_id',_process.id,
      'protocol_number',_process.protocol_number,
      'pre_protocol_number',_process.pre_protocol_number,
      'officialized_at',_process.officialized_at,
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

  perform public.assert_municipality_entitlement_v1(_municipality,'processes',1);

  select upper(regexp_replace(coalesce(nullif(ms.protocol_prefix,''),'PM'),'[^A-Za-z0-9]','','g'))
    into _prefix
  from public.municipality_settings ms
  where ms.municipality_id=_municipality
  limit 1;
  _prefix := coalesce(nullif(_prefix,''),'PM');

  perform pg_advisory_xact_lock(
    hashtextextended(
      _municipality::text||':'||extract(year from current_date)::int::text||':'||_prefix,
      0
    )
  );

  -- Unica sequencia oficial para Projeto, Habite-se e demais protocolos.
  -- Este contador so e consumido depois do pagamento.
  _official_protocol := public.next_tenant_protocol_number(
    _process.tenant_id,
    _prefix,
    extract(year from current_date)::integer
  );

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

  insert into public.process_movements(
    tenant_id,process_id,actor_user_id,actor_profile_id,movement_type,
    from_status,to_status,description,visible_to_external,municipality_id
  )
  values(
    _process.tenant_id,_process.id,public.current_legacy_user_id(),public.current_profile_id(),
    'processo_oficializado','pagamento_pendente','triagem',
    'Pagamento confirmado. Numero oficial atribuido: '||_official_protocol||
      '. Pre-protocolo: '||coalesce(_process.pre_protocol_number,'nao informado')||'.',
    true,_municipality
  );

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,actor_profile_id,category,title,detail,
    visible_to_external,created_at,municipality_id
  )
  values(
    _process.tenant_id,_process.id,public.current_legacy_user_id(),public.current_profile_id(),
    'protocolo','Processo criado apos confirmacao do pagamento',
    'Processo '||_official_protocol||' criado atomicamente a partir do pre-protocolo '||
      coalesce(_process.pre_protocol_number,'nao informado')||'.',
    true,clock_timestamp(),_municipality
  );

  return jsonb_build_object(
    'process_id',_process.id,
    'protocol_number',_official_protocol,
    'pre_protocol_number',_process.pre_protocol_number,
    'officialized_at',_process.officialized_at,
    'payment_guide_id',_guide.id,
    'existing',false
  );
end;
$function$;

grant execute on function public.officialize_preprotocol_v1(uuid,uuid) to authenticated;
notify pgrst, 'reload schema';
