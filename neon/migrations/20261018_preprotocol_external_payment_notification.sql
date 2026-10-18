-- SIGAPRO — notificacao externa do pre-protocolo aponta para Pagamentos, nunca para uma pagina de processo inexistente.

CREATE OR REPLACE FUNCTION public.trg_notify_payment_guide_flow_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _process public.processes%rowtype;
  _municipality uuid;
  _source uuid := public.current_profile_id();
  _url text;
  _label text;
  _responsible_area text;
begin
  if new.process_id is null then return new; end if;

  select * into _process from public.processes where id=new.process_id;
  if _process.id is null then return new; end if;

  _municipality := coalesce(new.municipality_id,_process.municipality_id,_process.tenant_id);
  _url := case
    when _process.officialized_at is null
      then '/externo/pagamentos?preprotocolo='||coalesce(_process.pre_protocol_number,_process.protocol_number)
    else '/processos/'||new.process_id::text
  end;
  _label := case coalesce(new.guide_kind,'')
    when 'protocolo' then 'Guia de Protocolo'
    when 'iss_obra' then 'Guia de ISSQN / Obra'
    when 'aprovacao_final' then 'Guia de Aprovação / Alvará'
    else 'Guia de recolhimento'
  end;
  _responsible_area := case
    when coalesce(new.guide_kind,'')='protocolo' then 'protocolos'
    else 'financeiro'
  end;

  if tg_op='INSERT' then
    perform public.notify_process_owner_v1(
      new.process_id,
      case
        when _process.officialized_at is null then _label||' do pré-protocolo emitida'
        else _label||' emitida'
      end,
      case
        when _process.officialized_at is null
          then 'A '||_label||' do pré-protocolo '||
            coalesce(_process.pre_protocol_number,_process.protocol_number)||
            ' foi emitida. O processo municipal será criado após a compensação.'
        else 'A '||_label||' do processo '||_process.protocol_number||' foi emitida.'
      end,
      'financeiro',_url,'financeiro','alta',_source,
      'guide:new:'||new.id::text
    );

    if _process.officialized_at is not null then
      perform public.notify_municipal_area_v1(
        _municipality,_responsible_area,
        'Nova guia emitida',
        _process.protocol_number||': '||_label||' disponível para acompanhamento.',
        'financeiro',new.process_id,_url,'financeiro','normal',_source,
        'guide:area:'||new.id::text||':'||_responsible_area
      );
    end if;
    return new;
  end if;

  if (
    coalesce(new.paid,false) is distinct from coalesce(old.paid,false)
    or coalesce(new.status,'') is distinct from coalesce(old.status,'')
  ) and (
    coalesce(new.paid,false)
    or lower(coalesce(new.status,'')) in ('paid','compensada','pago','confirmed','confirmado')
  ) then
    perform public.notify_process_owner_v1(
      new.process_id,
      'Pagamento confirmado',
      _process.protocol_number||': '||_label||' compensada.',
      'financeiro',_url,'financeiro','normal',_source,
      'guide:paid:owner:'||new.id::text
    );

    perform public.notify_process_analyst_v1(
      new.process_id,
      'Pagamento liberado para continuidade',
      _process.protocol_number||': '||_label||' foi compensada.',
      'financeiro',_url||'?aba=analise','financeiro','normal',_source,
      'guide:paid:analyst:'||new.id::text
    );

    perform public.notify_municipal_area_v1(
      _municipality,_responsible_area,
      'Pagamento confirmado',
      _process.protocol_number||': '||_label||' foi compensada.',
      'financeiro',new.process_id,_url,'financeiro','normal',_source,
      'guide:paid:area:'||new.id::text||':'||_responsible_area
    );
  end if;

  return new;
exception when others then
  raise warning 'SIGAPRO notification payment-guide-flow: %',sqlerrm;
  return new;
end;
$function$
;

notify pgrst, 'reload schema';
