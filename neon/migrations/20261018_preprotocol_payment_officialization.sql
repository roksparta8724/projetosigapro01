-- SIGAPRO — pre-protocolo separado do processo municipal.
-- O processo oficial so nasce apos a compensacao da guia inicial.
-- A numeracao oficial e atomica e serializada por Prefeitura/ano/prefixo.

alter table public.processes
  add column if not exists pre_protocol_number text,
  add column if not exists officialized_at timestamptz default now(),
  add column if not exists officialized_by_payment_guide_id uuid references public.payment_guides(id) on delete set null;

update public.processes
set officialized_at=coalesce(officialized_at,created_at,now())
where pre_protocol_number is null;

create unique index if not exists processes_tenant_preprotocol_uidx
  on public.processes(tenant_id,pre_protocol_number)
  where pre_protocol_number is not null;

create index if not exists idx_processes_officialized_at
  on public.processes(officialized_at);

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
  _counter_prefix text;
  _next_value bigint;
begin
  if _tenant_id is null then
    raise exception 'Prefeitura invalida para gerar pre-protocolo';
  end if;
  if _year < 2000 or _year > 9999 then
    raise exception 'Ano invalido para gerar pre-protocolo';
  end if;

  _counter_prefix := 'PRE' || _normalized_prefix;

  insert into public.tenant_protocol_counters(
    tenant_id,protocol_year,prefix,last_value,updated_at
  )
  values(_tenant_id,_year,_counter_prefix,1,now())
  on conflict (tenant_id,protocol_year,prefix)
  do update set
    last_value=public.tenant_protocol_counters.last_value+1,
    updated_at=now()
  returning last_value into _next_value;

  return 'PRE-'||_normalized_prefix||'-'||_year::text||'-'||lpad(_next_value::text,5,'0');
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
$function$;

create or replace function public.trg_officialize_preprotocol_after_payment_v1()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
begin
  if new.process_id is not null
     and new.guide_kind='protocolo'
     and (
       coalesce(new.paid,false)=true
       or lower(coalesce(new.status,'')) in ('compensada','confirmed','paid','pago','confirmado')
     )
     and (
       tg_op='INSERT'
       or coalesce(new.paid,false) is distinct from coalesce(old.paid,false)
       or coalesce(new.status,'') is distinct from coalesce(old.status,'')
     ) then
    perform public.officialize_preprotocol_v1(new.process_id,new.id);
  end if;
  return new;
end;
$function$;

drop trigger if exists aaa_officialize_preprotocol_after_payment_v1 on public.payment_guides;
create trigger aaa_officialize_preprotocol_after_payment_v1
after insert or update of paid,status
on public.payment_guides
for each row execute function public.trg_officialize_preprotocol_after_payment_v1();

create or replace function public.has_process_access(_process_id uuid, _user_id uuid default null)
returns boolean
language sql
stable security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
  with cp as (
    select
      p.id as profile_id,
      p.user_id as legacy_user_id,
      p.municipality_id,
      coalesce(public.current_role_code(),p.role,'') as role_code
    from public.profiles p
    where p.id=public.current_profile_id()
      and p.deleted_at is null
      and p.account_status='active'
    limit 1
  ),
  effective as (
    select
      cp.*,
      coalesce(_user_id,cp.legacy_user_id) as effective_legacy_user_id
    from cp
  )
  select exists (
    select 1
    from public.processes pr
    cross join effective e
    where pr.id=_process_id
      and (
        (
          pr.officialized_at is null
          and (
            pr.created_by_profile_id=e.profile_id
            or (e.effective_legacy_user_id is not null and pr.created_by=e.effective_legacy_user_id)
            or exists (
              select 1 from public.process_parties pp
              where pp.process_id=pr.id
                and (
                  pp.profile_id=e.profile_id
                  or (e.effective_legacy_user_id is not null and pp.user_id=e.effective_legacy_user_id)
                )
            )
          )
        )
        or
        (
          pr.officialized_at is not null
          and (
            public.is_master()
            or (
              pr.municipality_id is not null
              and e.municipality_id=pr.municipality_id
              and e.role_code in (
                'prefeitura_admin','prefeitura_supervisor','analista','financeiro',
                'setor_intersetorial','fiscal','admin_municipality','analyst',
                'financial','counter_service','topography','expedient'
              )
            )
            or pr.created_by_profile_id=e.profile_id
            or (e.effective_legacy_user_id is not null and pr.created_by=e.effective_legacy_user_id)
            or exists (
              select 1 from public.process_parties pp
              where pp.process_id=pr.id
                and (
                  pp.profile_id=e.profile_id
                  or (e.effective_legacy_user_id is not null and pp.user_id=e.effective_legacy_user_id)
                )
            )
            or exists (
              select 1 from public.project_owner_links pol
              where pol.project_id=pr.id
                and e.profile_id in (pol.owner_profile_id,pol.professional_profile_id)
            )
          )
        )
      )
  )
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
  _professional_party_id uuid;
  _owner_party_id uuid;
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
      and (
        p.protocol_number = btrim(_requested_protocol_number)
        or p.pre_protocol_number = btrim(_requested_protocol_number)
      )
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
        _guide_number := _guide_prefix || '-PRE-' || regexp_replace(_protocol, '^PRE-[^-]+-', '');

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
        'existing', true,
        'pre_protocol_number', (select p.pre_protocol_number from public.processes p where p.id=_process_id),
        'is_official', (select p.officialized_at is not null from public.processes p where p.id=_process_id)
      );
    end if;
  end if;

  insert into public.properties(
    tenant_id, municipality_id, iptu_code, registry_code, address,
    lot, block, usage_type, building_type, work_type, construction_standard, area_m2
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
    nullif(_payload->>'buildingType',''),
    nullif(_payload->>'workType',''),
    nullif(_payload->>'constructionStandard',''),
    nullif(_payload->>'area','')::numeric
  )
  returning id into _property_id;

  if _requested_protocol_number is not null and btrim(_requested_protocol_number) <> '' then
    _protocol := btrim(_requested_protocol_number);
  else
    _protocol := public.next_tenant_preprotocol_number(
      _tenant_id,
      _prefix,
      extract(year from current_date)::integer
    );
  end if;

  insert into public.processes(
    tenant_id, municipality_id, property_id, created_by, created_by_profile_id,
    protocol_number, external_protocol_number, pre_protocol_number, officialized_at, title, process_type, status,
    current_queue, current_department, checklist_type, triage_status,
    triage_assigned_to, triage_notes, sla_stage, sla_due_at,
    sla_hours_remaining, sla_breached
  )
  values(
    _tenant_id, _tenant_id, _property_id, _legacy_user_id, _profile_id,
    _protocol, _protocol, _protocol, null,
    coalesce(nullif(_payload->>'title',''),'Projeto sem titulo'),
    coalesce(nullif(_payload->>'type',''),'licenciamento'),
    'pagamento_pendente',
    'Aguardando pagamento','Portal Externo',
    coalesce(nullif(_payload->>'type',''),'licenciamento'),
    'recebido',
    null,
    'Pre-protocolo aguardando a compensacao da guia inicial. Ainda nao e processo municipal.',
    'Aguardando confirmacao da guia de protocolo',
    now() + interval '2 days',
    48,
    false
  )
  returning id into _process_id;

  insert into public.process_parties(
    process_id, tenant_id, municipality_id, user_id, profile_id, party_type,
    display_name, document_masked, is_primary
  )
  values (
    _process_id, _tenant_id, _tenant_id, _legacy_user_id, _profile_id, 'profissional_externo',
    coalesce(nullif(_payload->>'technicalLead',''),'Profissional externo'),
    case
      when length(regexp_replace(coalesce(_payload->>'professionalDocument',''), '\D','','g')) < 4 then null
      else '***' || right(regexp_replace(_payload->>'professionalDocument','\D','','g'),4)
    end,
    true
  )
  returning id into _professional_party_id;

  insert into public.process_party_private_data(
    process_id, party_id, tenant_id, municipality_id,
    document_number, registration_number, professional_type,
    email, phone, company_name
  )
  values(
    _process_id, _professional_party_id, _tenant_id, _tenant_id,
    nullif(_payload->>'professionalDocument',''),
    nullif(_payload->>'professionalRegistration',''),
    nullif(_payload->>'professionalType',''),
    nullif(_payload->>'professionalEmail',''),
    nullif(_payload->>'professionalPhone',''),
    nullif(_payload->>'professionalCompany','')
  )
  on conflict (party_id) do update set
    document_number=excluded.document_number,
    registration_number=excluded.registration_number,
    professional_type=excluded.professional_type,
    email=excluded.email,
    phone=excluded.phone,
    company_name=excluded.company_name,
    updated_at=clock_timestamp();

  insert into public.process_parties(
    process_id, tenant_id, municipality_id, user_id, profile_id, party_type,
    display_name, document_masked, is_primary
  )
  values (
    _process_id, _tenant_id, _tenant_id, null, null, 'proprietario',
    coalesce(nullif(_payload->>'ownerName',''),'Proprietario nao informado'),
    case
      when length(regexp_replace(coalesce(_payload->>'ownerDocument',''), '\D','','g')) < 4 then null
      else '***' || right(regexp_replace(_payload->>'ownerDocument','\D','','g'),4)
    end,
    false
  )
  returning id into _owner_party_id;

  insert into public.process_party_private_data(
    process_id, party_id, tenant_id, municipality_id,
    document_number, identity_document_number, identity_document_type,
    email, phone
  )
  values(
    _process_id, _owner_party_id, _tenant_id, _tenant_id,
    nullif(_payload->>'ownerDocument',''),
    nullif(_payload->>'ownerIdentityDocument',''),
    case
      when nullif(_payload->>'ownerIdentityDocument','') is null then null
      else 'RG/RNE/IDENTIDADE'
    end,
    nullif(_payload->>'ownerEmail',''),
    nullif(_payload->>'ownerPhone','')
  )
  on conflict (party_id) do update set
    document_number=excluded.document_number,
    identity_document_number=excluded.identity_document_number,
    identity_document_type=excluded.identity_document_type,
    email=excluded.email,
    phone=excluded.phone,
    updated_at=clock_timestamp();

  _guide_number := _guide_prefix || '-PRE-' || regexp_replace(_protocol, '^PRE-[^-]+-', '');

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
      'pre_protocolo', null, 'pagamento_pendente',
      'Pre-protocolo criado pelo portal externo. O processo municipal sera criado somente apos a confirmacao do pagamento.', true
    ),
    (
      _tenant_id, _process_id, _legacy_user_id, _profile_id,
      'guia_emitida', 'pagamento_pendente', 'pagamento_pendente',
      'Guia DAM emitida para o pre-protocolo; a compensacao oficializa o processo municipal.', true
    );

  insert into public.process_audit_entries(
    tenant_id, process_id, actor_user_id, actor_profile_id,
    category, title, detail, visible_to_external
  )
  values
    (
      _tenant_id, _process_id, _legacy_user_id, _profile_id,
      'sistema', 'Pre-protocolo registrado',
      'Cadastro recebido sem numeracao de processo. A numeracao oficial sera atribuida atomicamente apos a compensacao da guia inicial.', true
    ),
    (
      _tenant_id, _process_id, _legacy_user_id, _profile_id,
      'financeiro', 'Guia inicial do pre-protocolo emitida',
      'Guia municipal criada sem abrir processo na Prefeitura antes do pagamento.', true
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
    'existing', false,
    'pre_protocol_number', _protocol,
    'is_official', false
  );
end;
$function$


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
      WHEN 'protocolo' THEN 'triagem'::public.process_status
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
           WHEN _guide_kind='protocolo' THEN 'recebido'
           ELSE triage_status
         END,
         current_department=CASE
           WHEN _guide_kind='protocolo' THEN 'Setor de Protocolo'
           WHEN _guide_kind='iss_obra' THEN 'Análise Urbanística'
           ELSE 'Processo concluído'
         END,
         current_queue=CASE
           WHEN _guide_kind='protocolo' THEN 'Triagem de Protocolo'
           WHEN _guide_kind='iss_obra' THEN 'Análise Urbanística'
           ELSE 'Concluído'
         END,
         sla_stage=CASE
           WHEN _guide_kind='protocolo' THEN 'Triagem documental apos pagamento'
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
      THEN 'Pagamento inicial confirmado; pre-protocolo oficializado como processo municipal'
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
$function$


grant execute on function public.next_tenant_preprotocol_number(uuid,text,integer) to authenticated;
grant execute on function public.officialize_preprotocol_v1(uuid,uuid) to authenticated;
notify pgrst, 'reload schema';
