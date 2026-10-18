-- SIGAPRO — hardening do ciclo pre-protocolo -> pagamento -> processo oficial.
-- Mantem pre-protocolo fora do fluxo municipal e libera despacho somente depois da triagem.

CREATE OR REPLACE FUNCTION public.guard_plan_process_insert_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare _municipality_id uuid := coalesce(new.municipality_id,new.tenant_id); _creator_role text;
begin
  perform public.assert_municipality_entitlement_v1(_municipality_id,'module:Protocolo digital',0);
  if new.officialized_at is not null then
    perform public.assert_municipality_entitlement_v1(_municipality_id,'processes',1);
  end if;
  if new.created_by_profile_id is not null then
    select p.role into _creator_role from public.profiles p where p.id=new.created_by_profile_id;
    if _creator_role in ('profissional','profissional_externo','proprietario_consulta') then
      perform public.assert_municipality_entitlement_v1(_municipality_id,'module:Acesso externo',0);
    end if;
  end if;
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.trg_notify_process_flow_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _municipality uuid;
  _area text;
  _source uuid := public.current_profile_id();
  _url text;
  _area_notified boolean := false;
begin
  _municipality := coalesce(new.municipality_id,new.tenant_id);
  _url := '/processos/'||new.id::text;

  if new.officialized_at is null then
    return new;
  end if;

  if tg_op='INSERT' then
    if new.status::text <> 'rascunho' then
      perform public.notify_municipal_area_v1(
        _municipality,'protocolos',
        'Novo protocolo recebido',
        'O processo '||new.protocol_number||' entrou na fila de Protocolo.',
        'protocolo',new.id,_url,'protocolo','normal',_source,
        'process:new:'||new.id::text
      );
    end if;
    return new;
  end if;

  if new.analysis_assigned_to_profile_id is distinct from old.analysis_assigned_to_profile_id
     and new.analysis_assigned_to_profile_id is not null then
    perform public.enqueue_notification_v1(
      new.analysis_assigned_to_profile_id,
      'Nova análise atribuída',
      'O processo '||new.protocol_number||' foi atribuído a você para análise técnica.',
      'analise',new.id,_url||'?aba=analise','analise','alta',_source,
      'analysis-assigned:'||new.id::text||':'||new.analysis_assigned_to_profile_id::text,
      '{}'::jsonb
    );
  end if;

  if new.current_department is distinct from old.current_department
     or new.current_queue is distinct from old.current_queue then
    _area := public.operational_area_from_label(
      coalesce(nullif(new.current_department,''),nullif(new.current_queue,''))
    );

    if _area in ('protocolos','analise','financeiro') then
      perform public.notify_municipal_area_v1(
        _municipality,_area,
        'Processo recebido no setor',
        'O processo '||new.protocol_number||' foi encaminhado para '||
          coalesce(nullif(new.current_department,''),nullif(new.current_queue,''),_area)||'.',
        'tramite',new.id,_url,'tramite','normal',_source,
        'process-area:'||new.id::text||':'||coalesce(_area,'')
      );
      _area_notified := true;
    end if;
  end if;

  if new.status is distinct from old.status then
    perform public.notify_process_owner_v1(
      new.id,
      'Atualização do processo',
      'O processo '||new.protocol_number||' avançou para a etapa '||replace(new.status::text,'_',' ')||'.',
      'processo',_url,'processo','normal',_source,
      'process-status:'||new.id::text||':'||new.status::text
    );

    if not _area_notified then
      _area := public.operational_area_from_label(
        coalesce(nullif(new.current_department,''),nullif(new.current_queue,''))
      );

      if _area not in ('protocolos','analise','financeiro') then
        _area := case
          when new.status::text in ('protocolo','triagem','pendencia_documental')
            then 'protocolos'
          when new.status::text in ('guia_emitida','pagamento_pendente','pagamento_confirmado')
            then 'financeiro'
          when new.status::text in (
            'distribuicao','analise_tecnica','exigencia','reapresentacao',
            'deferido','indeferido'
          )
            then 'analise'
          else ''
        end;
      end if;

      if _area in ('protocolos','analise','financeiro') then
        perform public.notify_municipal_area_v1(
          _municipality,_area,
          'Etapa do processo atualizada',
          'O processo '||new.protocol_number||' está agora em '||
            replace(new.status::text,'_',' ')||'.',
          'processo',new.id,_url,'processo','normal',_source,
          'process-status-area:'||new.id::text||':'||new.status::text||':'||_area
        );
      end if;
    end if;
  end if;

  return new;
exception when others then
  raise warning 'SIGAPRO notification process-flow: %',sqlerrm;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.officialize_preprotocol_v1(_process_id uuid, _payment_guide_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
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
    raise exception 'O processo so pode ser criado depois da confirmacao do pagamento';
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

  _official_protocol := public.next_tenant_protocol_number(
    _process.tenant_id,
    _prefix,
    extract(year from current_date)::integer
  );

  update public.processes
  set protocol_number=_official_protocol,
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
$function$
;

CREATE OR REPLACE FUNCTION public.set_process_triage(_process_id uuid, _triage_status text, _notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _role_code text := public.current_role_code();
  _tenant_id uuid;
  _municipality_id uuid;
  _process_status public.process_status;
  _previous_triage text;
  _protocol_paid boolean := false;
  _actor_name text;
  _effective_status text := lower(trim(coalesce(_triage_status,'')));
  _movement public.process_movements%rowtype;
  _audit public.process_audit_entries%rowtype;
BEGIN
  IF _profile_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado ou sem perfil';
  END IF;

  IF _effective_status NOT IN ('recebido','em_triagem','concluido') THEN
    RAISE EXCEPTION 'Status de triagem invalido';
  END IF;

  SELECT p.tenant_id,p.municipality_id,p.status,p.triage_status
    INTO _tenant_id,_municipality_id,_process_status,_previous_triage
  FROM public.processes p
  WHERE p.id=_process_id
  FOR UPDATE;

  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'Processo nao encontrado';
  END IF;

  IF NOT public.has_process_access(_process_id) THEN
    RAISE EXCEPTION 'Sem acesso ao processo';
  END IF;

  IF NOT (
    public.is_master()
    OR _role_code='prefeitura_admin'
    OR _role_code='setor_intersetorial'
  ) THEN
    RAISE EXCEPTION 'Somente o Setor de Protocolo pode executar a triagem';
  END IF;

  SELECT exists(
    select 1
    from public.payment_guides g
    where g.process_id=_process_id
      and g.guide_kind='protocolo'
      and (
        coalesce(g.paid,false)=true
        or lower(coalesce(g.status,'')) in ('compensada','confirmed','paid','pago','confirmado')
      )
  ) into _protocol_paid;

  SELECT coalesce(nullif(trim(p.full_name),''),nullif(trim(p.email),''),'Funcionario do Protocolo')
    INTO _actor_name
  FROM public.profiles p
  WHERE p.id=_profile_id
  LIMIT 1;

  UPDATE public.processes
     SET triage_status=_effective_status,
         status=CASE
           WHEN _effective_status='concluido' and _protocol_paid
             THEN 'pagamento_confirmado'::public.process_status
           WHEN _effective_status='concluido'
             THEN 'pagamento_pendente'::public.process_status
           ELSE 'triagem'::public.process_status
         END,
         triage_assigned_to=CASE
           WHEN _effective_status='recebido' THEN NULL
           ELSE _actor_name
         END,
         triage_notes=coalesce(nullif(trim(_notes),''),triage_notes),
         current_department='Setor de Protocolo',
         current_queue=CASE
           WHEN _effective_status='recebido' THEN 'Recepção'
           WHEN _effective_status='em_triagem' THEN 'Triagem de Protocolo'
           ELSE case when _protocol_paid then 'Pronto para Despacho' else 'Pagamento do Protocolo' end
         END,
         sla_stage=CASE
           WHEN _effective_status='recebido' THEN 'Recepção de Protocolo'
           WHEN _effective_status='em_triagem' THEN 'Triagem de Protocolo'
           ELSE case
             when _protocol_paid then 'Triagem concluida — pronto para despacho'
             else 'Aguardando pagamento do protocolo'
           end
         END,
         updated_at=now()
   WHERE id=_process_id;

  INSERT INTO public.process_movements(
    tenant_id,process_id,actor_user_id,movement_type,
    from_status,to_status,description,created_at,
    visible_to_external,municipality_id,actor_profile_id
  )
  VALUES(
    _tenant_id,_process_id,_legacy_user_id,'triage',
    _process_status,
    CASE
      WHEN _effective_status='concluido' and _protocol_paid
        THEN 'pagamento_confirmado'::public.process_status
      WHEN _effective_status='concluido'
        THEN 'pagamento_pendente'::public.process_status
      ELSE 'triagem'::public.process_status
    END,
    CASE _effective_status
      WHEN 'em_triagem' THEN 'Triagem iniciada pelo Setor de Protocolo'
      WHEN 'concluido' THEN 'Triagem concluida pelo Setor de Protocolo'
      ELSE 'Processo devolvido para recepcao do Protocolo'
    END,
    now(),true,_municipality_id,_profile_id
  )
  RETURNING * INTO _movement;

  INSERT INTO public.process_audit_entries(
    tenant_id,process_id,actor_user_id,category,title,detail,
    visible_to_external,created_at,municipality_id,actor_profile_id
  )
  VALUES(
    _tenant_id,_process_id,_legacy_user_id,'protocolo',
    CASE _effective_status
      WHEN 'em_triagem' THEN 'Triagem iniciada'
      WHEN 'concluido' THEN 'Triagem concluida'
      ELSE 'Triagem redefinida'
    END,
    coalesce(nullif(trim(_notes),''),
      CASE _effective_status
        WHEN 'em_triagem' THEN 'Conferencia documental iniciada pelo Protocolo.'
        WHEN 'concluido' THEN case
          when _protocol_paid
            then 'Conferencia documental concluida. Pagamento ja compensado; processo liberado para despacho.'
          else 'Conferencia documental concluida. O fluxo aguarda a baixa da guia inicial quando aplicavel.'
        end
        ELSE 'Processo retornado para a recepcao.'
      END
    ),
    true,now(),_municipality_id,_profile_id
  )
  RETURNING * INTO _audit;

  RETURN jsonb_build_object(
    'process_id',_process_id,
    'previous_triage_status',_previous_triage,
    'triage_status',_effective_status,
    'assigned_to',CASE WHEN _effective_status='recebido' THEN NULL ELSE _actor_name END,
    'movement',to_jsonb(_movement),
    'audit',to_jsonb(_audit)
  );
END;
$function$
;

notify pgrst, 'reload schema';
