-- Canonical municipal protocol intake flow.
-- External professional -> Setor de Protocolo -> triage -> protocol payment confirmation
-- -> explicit dispatch by Protocol -> Análise Urbanística.
-- Existing processes already dispatched are not rewound; they remain in their current department.

begin;

CREATE OR REPLACE FUNCTION public.create_external_process(_tenant_id uuid, _title text, _process_type text, _address text, _iptu_code text, _registry_code text, _lot text DEFAULT NULL::text, _block text DEFAULT NULL::text, _area_m2 numeric DEFAULT NULL::numeric, _usage_type text DEFAULT NULL::text, _owner_name text DEFAULT NULL::text, _owner_document text DEFAULT NULL::text, _technical_lead text DEFAULT NULL::text, _notes text DEFAULT NULL::text, _documents jsonb DEFAULT '[]'::jsonb, _guide_prefix text DEFAULT 'DAM'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _property_id uuid;
  _process_id uuid;
  _protocol text;
  _guide_number text;
  _due_date date := (current_date + interval '2 days')::date;
  _doc jsonb;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if not public.has_tenant_access(_tenant_id) then
    raise exception 'Usuario sem vinculo com a prefeitura';
  end if;

  insert into public.properties(
    tenant_id,iptu_code,registry_code,address,lot,block,usage_type,area_m2
  )
  values(
    _tenant_id,_iptu_code,nullif(_registry_code,''),_address,
    nullif(_lot,''),nullif(_block,''),nullif(_usage_type,''),_area_m2
  )
  returning id into _property_id;

  insert into public.processes(
    tenant_id,property_id,created_by,created_by_profile_id,
    protocol_number,external_protocol_number,title,process_type,status,
    current_queue,current_department,checklist_type,triage_status,
    triage_assigned_to,triage_notes,sla_stage,sla_due_at,
    sla_hours_remaining,sla_breached
  )
  values(
    _tenant_id,_property_id,_legacy_user_id,_profile_id,
    null,null,_title,_process_type,'triagem',
    'Triagem de Protocolo','Setor de Protocolo',_process_type,'recebido',
    'Setor de Protocolo','Aguardando triagem documental pelo Setor de Protocolo.',
    'Triagem de Protocolo',now()+interval '2 days',48,false
  )
  returning id,protocol_number into _process_id,_protocol;

  _guide_number := coalesce(nullif(_guide_prefix,''),'DAM') || '-' ||
                   split_part(_protocol,'-',2) || '-' || split_part(_protocol,'-',3);

  insert into public.process_parties(
    process_id,tenant_id,user_id,profile_id,party_type,display_name,document_masked,is_primary
  )
  values
    (
      _process_id,_tenant_id,_legacy_user_id,_profile_id,'profissional_externo',
      coalesce(nullif(_technical_lead,''),'Profissional externo'),null,true
    ),
    (
      _process_id,_tenant_id,null,null,'proprietario',
      coalesce(nullif(_owner_name,''),'Proprietario nao informado'),
      case
        when _owner_document is null or length(regexp_replace(_owner_document,'\D','','g'))<4 then null
        else '***' || right(regexp_replace(_owner_document,'\D','','g'),4)
      end,
      false
    );

  insert into public.payment_guides(
    tenant_id,process_id,property_id,guide_number,municipal_registration,amount,due_date,status
  )
  values(
    _tenant_id,_process_id,_property_id,_guide_number,_iptu_code,35.24,_due_date,'pendente'
  );

  insert into public.process_movements(
    tenant_id,process_id,actor_user_id,actor_profile_id,movement_type,
    from_status,to_status,description,visible_to_external
  )
  values
    (
      _tenant_id,_process_id,_legacy_user_id,_profile_id,'protocolo',
      null,'triagem','Protocolo criado pelo portal externo e enviado ao Setor de Protocolo.',true
    ),
    (
      _tenant_id,_process_id,_legacy_user_id,_profile_id,'guia_emitida',
      'triagem','triagem',
      'Guia DAM emitida automaticamente; a baixa ocorre após a triagem do Protocolo.',true
    );

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,actor_profile_id,category,title,detail,visible_to_external
  )
  values
    (
      _tenant_id,_process_id,_legacy_user_id,_profile_id,'sistema',
      'Processo protocolado','Cadastro inicial concluido com numeracao oficial.',true
    ),
    (
      _tenant_id,_process_id,_legacy_user_id,_profile_id,'financeiro',
      'Guia inicial emitida','Guia DAM criada automaticamente no protocolo.',true
    );

  if jsonb_typeof(_documents)='array' then
    for _doc in select value from jsonb_array_elements(_documents)
    loop
      insert into public.process_documents(
        tenant_id,process_id,uploaded_by,uploaded_by_profile_id,title,file_path,file_hash,
        version,source,is_required,is_valid,file_name,mime_type,size_label,preview_url,
        review_status,annotations
      )
      values(
        _tenant_id,_process_id,_legacy_user_id,_profile_id,
        coalesce(_doc->>'label',_doc->>'fileName','Documento'),
        coalesce(_doc->>'filePath','pending/'||coalesce(_doc->>'fileName',gen_random_uuid()::text)),
        coalesce(_doc->>'fileHash',encode(extensions.digest(coalesce(_doc->>'fileName',gen_random_uuid()::text),'sha256'),'hex')),
        coalesce((_doc->>'version')::integer,1),
        coalesce(_doc->>'source','profissional'),
        coalesce((_doc->>'required')::boolean,true),
        true,
        _doc->>'fileName',_doc->>'mimeType',_doc->>'sizeLabel',
        case when length(coalesce(_doc->>'previewUrl',''))>2000000 then null else _doc->>'previewUrl' end,
        coalesce(_doc->>'reviewStatus','pendente'),
        coalesce(_doc->'annotations','[]'::jsonb)
      );
    end loop;
  end if;

  return jsonb_build_object(
    'process_id',_process_id,
    'protocol_number',_protocol,
    'guide_number',_guide_number,
    'due_date',_due_date,
    'amount',35.24
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_external_process_v2(_tenant_id uuid, _payload jsonb, _protocol_prefix text DEFAULT 'PM'::text, _requested_protocol_number text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _property_id uuid;
  _process_id uuid;
  _protocol text;
  _guide_number text;
  _guide_id uuid;
  _due_date date := current_date + 2;
  _amount numeric;
  _doc jsonb;
  _existing_tenant uuid;
  _prefix text := 'PM';
  _guide_prefix text := 'DAM';
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if not public.has_tenant_access(_tenant_id) then
    raise exception 'Usuario sem vinculo com a prefeitura';
  end if;

  select
    upper(regexp_replace(coalesce(nullif(ms.protocol_prefix,''),'PM'),'[^A-Za-z0-9]','','g')),
    upper(regexp_replace(coalesce(nullif(ms.guide_prefix,''),'DAM'),'[^A-Za-z0-9]','','g'))
    into _prefix,_guide_prefix
  from public.municipality_settings ms
  where ms.municipality_id=_tenant_id
  limit 1;

  _prefix := coalesce(nullif(_prefix,''),'PM');
  _guide_prefix := coalesce(nullif(_guide_prefix,''),'DAM');
  _amount := public.resolve_municipal_guide_amount(
    _tenant_id,'protocolo',null,null,null
  );

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
        _guide_number := _guide_prefix || '-' || regexp_replace(_protocol, '^[^-]+-', '');

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
    'triagem',
    'Triagem de Protocolo','Setor de Protocolo',
    coalesce(nullif(_payload->>'type',''),'licenciamento'),
    'recebido',
    'Setor de protocolo',
    'Aguardando conferencia inicial e validacao da guia.',
    'Triagem de Protocolo',
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

  _guide_number := _guide_prefix || '-' || regexp_replace(_protocol, '^[^-]+-', '');

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
      'protocolo', null, 'triagem',
      'Protocolo criado pelo portal externo e enviado ao Setor de Protocolo.', true
    ),
    (
      _tenant_id, _process_id, _legacy_user_id, _profile_id,
      'guia_emitida', 'triagem', 'triagem',
      'Guia DAM emitida automaticamente; a baixa ocorre após a triagem do Protocolo.', true
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
        encode(extensions.digest(coalesce(_doc->>'fileName',gen_random_uuid()::text),'sha256'),'hex'),
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

  SELECT coalesce(nullif(trim(p.full_name),''),nullif(trim(p.email),''),'Funcionario do Protocolo')
    INTO _actor_name
  FROM public.profiles p
  WHERE p.id=_profile_id
  LIMIT 1;

  UPDATE public.processes
     SET triage_status=_effective_status,
         status=CASE
           WHEN _effective_status='concluido' THEN 'pagamento_pendente'::public.process_status
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
           ELSE 'Pagamento do Protocolo'
         END,
         sla_stage=CASE
           WHEN _effective_status='recebido' THEN 'Recepção de Protocolo'
           WHEN _effective_status='em_triagem' THEN 'Triagem de Protocolo'
           ELSE 'Aguardando pagamento do protocolo'
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
      WHEN _effective_status='concluido' THEN 'pagamento_pendente'::public.process_status
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
        WHEN 'concluido' THEN 'Conferencia documental concluida. O fluxo aguarda a baixa da guia inicial quando aplicavel.'
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
$function$;

CREATE OR REPLACE FUNCTION public.confirm_process_payment_guide(_process_id uuid, _guide_kind text)
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
  _from_status public.process_status;
  _triage_status text;
  _to_status public.process_status;
  _guide public.payment_guides%rowtype;
  _movement public.process_movements%rowtype;
  _audit public.process_audit_entries%rowtype;
  _audit_category text;
BEGIN
  IF _profile_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado ou sem perfil';
  END IF;

  IF _guide_kind NOT IN ('protocolo','iss_obra','aprovacao_final') THEN
    RAISE EXCEPTION 'Tipo de guia invalido';
  END IF;

  SELECT p.tenant_id,p.municipality_id,p.status,p.triage_status
    INTO _tenant_id,_municipality_id,_from_status,_triage_status
  FROM public.processes p
  WHERE p.id=_process_id
  FOR UPDATE;

  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'Processo nao encontrado';
  END IF;

  IF NOT public.has_process_access(_process_id) THEN
    RAISE EXCEPTION 'Sem acesso ao processo';
  END IF;

  IF _guide_kind='protocolo' THEN
    IF _triage_status <> 'concluido' THEN
      RAISE EXCEPTION 'Conclua a triagem documental antes de confirmar a guia inicial';
    END IF;

    IF NOT (
      public.is_master()
      OR _role_code='prefeitura_admin'
      OR _role_code='setor_intersetorial'
    ) THEN
      RAISE EXCEPTION 'A baixa da guia inicial pertence ao Setor de Protocolo';
    END IF;
    _audit_category := 'protocolo';
  ELSE
    IF NOT (
      public.is_master()
      OR _role_code='prefeitura_admin'
      OR _role_code='financeiro'
      OR _role_code='fiscal'
    ) THEN
      RAISE EXCEPTION 'Esta baixa pertence ao Setor Financeiro';
    END IF;
    _audit_category := 'financeiro';
  END IF;

  SELECT pg.*
    INTO _guide
  FROM public.payment_guides pg
  WHERE pg.process_id=_process_id
    AND pg.guide_kind=_guide_kind
  LIMIT 1
  FOR UPDATE;

  IF _guide.id IS NULL THEN
    RAISE EXCEPTION 'Guia nao encontrada para este processo';
  END IF;

  IF coalesce(_guide.paid,false)=true
     OR coalesce(_guide.status,'') IN ('compensada','confirmed','paid') THEN
    RAISE EXCEPTION 'Guia ja esta paga';
  END IF;

  _to_status :=
    CASE _guide_kind
      WHEN 'protocolo' THEN 'pagamento_confirmado'::public.process_status
      WHEN 'iss_obra' THEN 'analise_tecnica'::public.process_status
      WHEN 'aprovacao_final' THEN 'deferido'::public.process_status
    END;

  UPDATE public.payment_guides
     SET paid=true,
         paid_at=now(),
         status='compensada'
   WHERE id=_guide.id
   RETURNING * INTO _guide;

  UPDATE public.processes
     SET status=_to_status,
         triage_status=CASE
           WHEN _guide_kind='protocolo' THEN 'concluido'
           ELSE triage_status
         END,
         current_department=CASE
           WHEN _guide_kind='protocolo' THEN 'Setor de Protocolo'
           WHEN _guide_kind='iss_obra' THEN 'Análise Urbanística'
           ELSE 'Processo concluído'
         END,
         current_queue=CASE
           WHEN _guide_kind='protocolo' THEN 'Pronto para Despacho'
           WHEN _guide_kind='iss_obra' THEN 'Análise Urbanística'
           ELSE 'Concluído'
         END,
         sla_stage=CASE
           WHEN _guide_kind='protocolo' THEN 'Despacho para Análise Urbanística'
           WHEN _guide_kind='iss_obra' THEN 'Análise Urbanística após ISSQN'
           ELSE 'habite-se e aprovacao final'
         END,
         sla_breached=false,
         updated_at=now()
   WHERE id=_process_id;

  INSERT INTO public.process_movements(
    tenant_id,process_id,actor_user_id,movement_type,
    from_status,to_status,description,created_at,
    visible_to_external,municipality_id,actor_profile_id
  )
  VALUES(
    _tenant_id,_process_id,_legacy_user_id,'payment_confirmed',
    _from_status,_to_status,
    CASE WHEN _guide_kind='protocolo'
      THEN 'Pagamento inicial confirmado pelo Setor de Protocolo'
      ELSE 'Pagamento confirmado pelo Setor Financeiro: '||_guide_kind
    END,
    now(),true,_municipality_id,_profile_id
  )
  RETURNING * INTO _movement;

  INSERT INTO public.process_audit_entries(
    tenant_id,process_id,actor_user_id,category,title,detail,
    visible_to_external,created_at,municipality_id,actor_profile_id
  )
  VALUES(
    _tenant_id,_process_id,_legacy_user_id,_audit_category,
    CASE WHEN _guide_kind='protocolo'
      THEN 'Pagamento do protocolo confirmado'
      ELSE 'Pagamento confirmado'
    END,
    'Guia '||_guide_kind||' confirmada e compensada.',
    true,now(),_municipality_id,_profile_id
  )
  RETURNING * INTO _audit;

  RETURN jsonb_build_object(
    'process_id',_process_id,
    'guide',to_jsonb(_guide),
    'from_status',_from_status::text,
    'to_status',_to_status::text,
    'movement',to_jsonb(_movement),
    'audit',to_jsonb(_audit)
  );
END;
$function$;

grant execute on function public.set_process_triage(uuid,text,text) to authenticated;
grant execute on function public.confirm_process_payment_guide(uuid,text) to authenticated;

commit;

notify pgrst, 'reload schema';
