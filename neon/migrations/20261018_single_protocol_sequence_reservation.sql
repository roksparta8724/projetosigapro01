-- SIGAPRO — uma única sequência municipal para Projeto, Habite-se e demais protocolos.
-- O pré-protocolo reserva o próximo número da MESMA sequência PM, mas continua
-- não-oficial até a compensação da guia. Ex.: PRE-PM-2026-00003 -> PM-2026-00003.

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
  _official_reserved text;
begin
  if _tenant_id is null then
    raise exception 'Prefeitura invalida para reservar protocolo';
  end if;

  _official_reserved := public.next_tenant_protocol_number(
    _tenant_id,
    _prefix,
    _year
  );

  return 'PRE-'||_official_reserved;
end;
$function$;

do $repair$
declare
  _row record;
  _prefix text;
  _guide_prefix text;
  _reserved text;
  _suffix text;
begin
  for _row in
    select
      p.id,
      p.tenant_id,
      coalesce(p.municipality_id,p.tenant_id) as municipality_id,
      p.protocol_number,
      p.pre_protocol_number
    from public.processes p
    where p.officialized_at is null
      and p.pre_protocol_number is not null
    order by p.created_at,p.id
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

    -- Sempre remapeia os pré-protocolos legados, pois o contador PREPM antigo
    -- era independente e podia colidir com números PM já existentes.
    _reserved := public.next_tenant_preprotocol_number(
      _row.tenant_id,
      _prefix,
      extract(year from current_date)::integer
    );

    update public.processes
    set protocol_number=_reserved,
        external_protocol_number=_reserved,
        pre_protocol_number=_reserved,
        updated_at=clock_timestamp()
    where id=_row.id;

    _suffix := regexp_replace(_reserved,'^PRE-[^-]+-','');

    update public.payment_guides
    set guide_number=_guide_prefix||'-PRE-'||_suffix
    where process_id=_row.id
      and guide_kind='protocolo'
      and not coalesce(paid,false);

    insert into public.process_audit_entries(
      tenant_id,municipality_id,process_id,actor_user_id,actor_profile_id,
      category,title,detail,visible_to_external,created_at
    )
    values(
      _row.tenant_id,_row.municipality_id,_row.id,null,null,
      'sistema',
      'Sequência única de protocolo reservada',
      'O pré-protocolo passou a reservar a mesma sequência municipal usada pelos processos oficiais. Número reservado: '||
        regexp_replace(_reserved,'^PRE-','')||'. A oficialização ocorrerá após o pagamento, sem gerar outro número.',
      true,clock_timestamp()
    );
  end loop;

  delete from public.tenant_protocol_counters
  where prefix like 'PRE%';
end;
$repair$;

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

  _official_protocol := regexp_replace(
    coalesce(_process.pre_protocol_number,_process.protocol_number),
    '^PRE-',
    ''
  );

  if _official_protocol = coalesce(_process.pre_protocol_number,_process.protocol_number)
     or _official_protocol !~ '^[A-Z0-9]+-[0-9]{4}-[0-9]+$' then
    raise exception 'Reserva de protocolo inválida para oficialização';
  end if;

  if exists (
    select 1
    from public.processes p
    where p.tenant_id=_process.tenant_id
      and p.protocol_number=_official_protocol
      and p.id<>_process.id
  ) then
    raise exception 'O número reservado % já está em uso. Revise a sequência antes de oficializar.',_official_protocol;
  end if;

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
    'Pagamento confirmado. O número reservado '||_official_protocol||
      ' foi oficializado sem criar nova sequência.',
    true,_municipality
  );

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,actor_profile_id,category,title,detail,
    visible_to_external,created_at,municipality_id
  )
  values(
    _process.tenant_id,_process.id,public.current_legacy_user_id(),public.current_profile_id(),
    'protocolo','Pré-protocolo oficializado',
    'O pré-protocolo '||coalesce(_process.pre_protocol_number,'não informado')||
      ' foi convertido no processo '||_official_protocol||
      ' usando a mesma reserva da sequência municipal.',
    true,clock_timestamp(),_municipality
  );

  return jsonb_build_object(
    'process_id',_process.id,
    'protocol_number',_official_protocol,
    'pre_protocol_number',_process.pre_protocol_number,
    'officialized_at',_process.officialized_at,
    'payment_guide_id',_guide.id,
    'existing',false,
    'reserved_sequence',true
  );
end;
$function$;

grant execute on function public.next_tenant_preprotocol_number(uuid,text,integer) to authenticated;
grant execute on function public.officialize_preprotocol_v1(uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
