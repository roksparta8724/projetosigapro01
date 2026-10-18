-- SIGAPRO — etapa financeira própria do Habite-se após vistoria/conferência.
alter table public.payment_guides
  add column if not exists requested_by_profile_id uuid,
  add column if not exists requested_by_name text,
  add column if not exists requested_at timestamptz,
  add column if not exists issued_by_profile_id uuid,
  add column if not exists issued_by_name text,
  add column if not exists owner_name_snapshot text,
  add column if not exists owner_document_snapshot text,
  add column if not exists professional_name_snapshot text,
  add column if not exists area_m2_snapshot numeric,
  add column if not exists usage_snapshot text,
  add column if not exists construction_standard_snapshot text;


alter table public.payment_guides
  drop constraint if exists payment_guides_guide_kind_check;

alter table public.payment_guides
  add constraint payment_guides_guide_kind_check
  check (
    guide_kind is null
    or guide_kind in ('protocolo','iss_obra','aprovacao_final','habite_se')
  );

alter table public.payment_guides
  drop constraint if exists payment_guides_kind_compat_check;

alter table public.payment_guides
  add constraint payment_guides_kind_compat_check
  check (
    guide_kind is null
    or guide_kind in (
      'protocolo','iss_obra','aprovacao_final','habite_se',
      'initial_protocol','technical_analysis','final_approval','other','post_communicate'
    )
  );



create or replace function public.request_habite_se_payment_guide_v1(_process_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _role_code text := coalesce(public.current_role_code(),'');
  _process public.processes%rowtype;
  _actor_name text;
  _normalized_folder text;
  _unapproved integer := 0;
  _open_requirements integer := 0;
  _existing public.interdepartmental_dispatches%rowtype;
  _dispatch public.interdepartmental_dispatches%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuário não autenticado ou sem perfil.';
  end if;

  select * into _process
  from public.processes p
  where p.id=_process_id
  for update;

  if _process.id is null then
    raise exception 'Processo não encontrado.';
  end if;

  if lower(coalesce(_process.process_type,'')) not like '%habite%' then
    raise exception 'Este encaminhamento é exclusivo do processo de Habite-se.';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  if not (
    public.is_master()
    or _role_code in ('prefeitura_admin','prefeitura_supervisor','analista','analyst','fiscal','setor_intersetorial')
  ) then
    raise exception 'Este perfil não pode concluir a vistoria e encaminhar o Habite-se ao Financeiro.';
  end if;

  _normalized_folder := lower(
    translate(
      coalesce(nullif(btrim(_process.current_department),''),nullif(btrim(_process.current_queue),'') ,''),
      'ÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇáàâãéèêíìîóòôõúùûç',
      'AAAAEEEIIIOOOOUUUCaaaaeeeiiioooouuuc'
    )
  );

  if _normalized_folder !~ '(fiscal|vistoria|inspec|conferencia)' then
    raise exception 'A Guia de Habite-se só pode seguir ao Financeiro depois da etapa de vistoria / conferência.';
  end if;

  select count(*)
    into _unapproved
  from public.process_documents d
  where d.process_id=_process_id
    and coalesce(d.is_valid,true)=true
    and coalesce(d.review_status,'pendente') <> 'aprovado';

  if _unapproved > 0 then
    raise exception 'Existem documentos do Habite-se ainda não aprovados.';
  end if;

  select count(*)
    into _open_requirements
  from public.process_requirements r
  where r.process_id=_process_id
    and r.status in ('aberta','respondida');

  if _open_requirements > 0 then
    raise exception 'Conclua as exigências pendentes antes de encaminhar o Habite-se ao Financeiro.';
  end if;

  select d.* into _existing
  from public.interdepartmental_dispatches d
  where d.process_id=_process_id
    and lower(coalesce(d.subject,'')) like '%guia%habite%'
    and d.status in ('aguardando','respondido')
  order by d.created_at desc
  limit 1;

  if _existing.id is not null then
    return jsonb_build_object(
      'process_id',_process_id,
      'request',to_jsonb(_existing),
      'existing',true
    );
  end if;

  select coalesce(nullif(btrim(p.full_name),''),nullif(btrim(p.email),''),'Servidor municipal')
    into _actor_name
  from public.profiles p
  where p.id=_profile_id
  limit 1;

  -- Ao concluir a vistoria, encerra o despacho de entrada da etapa anterior.
  -- Isso preserva a regra de apenas um despacho operacional ativo por processo
  -- e evita colisão ao criar o novo encaminhamento para o Financeiro.
  update public.interdepartmental_dispatches
     set status='concluido',
         completed_at=coalesce(completed_at,clock_timestamp()),
         assigned_to=coalesce(assigned_to,_actor_name)
   where process_id=_process_id
     and status in ('aguardando','respondido');

  insert into public.interdepartmental_dispatches(
    tenant_id,municipality_id,process_id,from_department,to_department,
    subject,due_at,status,visibility,priority,created_by,created_by_profile_id,created_at
  )
  values(
    _process.tenant_id,coalesce(_process.municipality_id,_process.tenant_id),_process.id,
    coalesce(nullif(btrim(_process.current_department),''),'Vistoria / conferência'),
    'Financeiro',
    'Vistoria concluída — emissão da Guia de Habite-se',
    now()+interval '2 days',
    'aguardando','interno','media',_legacy_user_id,_profile_id,now()
  )
  returning * into _dispatch;

  update public.processes
     set status='despacho_intersetorial'::public.process_status,
         current_department='Financeiro',
         current_queue='Emissão da Guia de Habite-se',
         sla_stage='Financeiro — Guia de Habite-se',
         process_checkpoint='Vistoria concluída — aguardando emissão da Guia de Habite-se',
         updated_at=clock_timestamp()
   where id=_process_id;

  insert into public.process_movements(
    tenant_id,process_id,actor_user_id,actor_profile_id,movement_type,
    from_status,to_status,description,visible_to_external,municipality_id
  )
  values(
    _process.tenant_id,_process_id,_legacy_user_id,_profile_id,'dispatch',
    _process.status,'despacho_intersetorial'::public.process_status,
    'Vistoria / conferência concluída. Processo encaminhado ao Financeiro para emissão da Guia de Habite-se.',
    true,coalesce(_process.municipality_id,_process.tenant_id)
  );

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,actor_profile_id,category,title,detail,
    visible_to_external,municipality_id
  )
  values(
    _process.tenant_id,_process_id,_legacy_user_id,_profile_id,'financeiro',
    'Habite-se encaminhado ao Financeiro',
    'Vistoria / conferência concluída por '||coalesce(_actor_name,'Servidor municipal')||
      '. Aguardando emissão da Guia de Habite-se.',
    true,coalesce(_process.municipality_id,_process.tenant_id)
  );

  return jsonb_build_object(
    'process_id',_process_id,
    'request',to_jsonb(_dispatch),
    'existing',false
  );
end;
$function$;

create or replace function public.issue_habite_se_payment_guide_v1(
  _process_id uuid,
  _amount numeric,
  _due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _role_code text := coalesce(public.current_role_code(),'');
  _process public.processes%rowtype;
  _request public.interdepartmental_dispatches%rowtype;
  _guide public.payment_guides%rowtype;
  _settings jsonb := '{}'::jsonb;
  _configured_amount numeric;
  _official_amount numeric;
  _due date := coalesce(_due_date,current_date + 2);
  _prefix text := 'DAM';
  _guide_number text;
  _issuer_name text;
begin
  if _profile_id is null then
    raise exception 'Usuário não autenticado ou sem perfil.';
  end if;

  if not (
    public.is_master()
    or _role_code in ('prefeitura_admin','financeiro','financial')
  ) then
    raise exception 'Somente o Setor Financeiro pode emitir a Guia de Habite-se.';
  end if;

  select * into _process
  from public.processes p
  where p.id=_process_id
  for update;

  if _process.id is null then
    raise exception 'Processo não encontrado.';
  end if;

  if lower(coalesce(_process.process_type,'')) not like '%habite%' then
    raise exception 'A Guia de Habite-se só pode ser emitida em processo de Habite-se.';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  select d.* into _request
  from public.interdepartmental_dispatches d
  where d.process_id=_process_id
    and lower(coalesce(d.subject,'')) like '%guia%habite%'
    and d.status in ('aguardando','respondido')
  order by d.created_at desc
  limit 1
  for update;

  if _request.id is null then
    raise exception 'A vistoria / conferência ainda não encaminhou este Habite-se ao Financeiro.';
  end if;

  select coalesce(ms.general_settings,'{}'::jsonb),
         upper(regexp_replace(coalesce(nullif(ms.guide_prefix,''),'DAM'),'[^A-Za-z0-9]','','g'))
    into _settings,_prefix
  from public.municipality_settings ms
  where ms.municipality_id=coalesce(_process.municipality_id,_process.tenant_id)
  limit 1;

  _configured_amount := coalesce(
    nullif(_settings->>'taxa_habite_se','')::numeric,
    nullif(_settings->>'fee_habite_se','')::numeric
  );

  _official_amount := case
    when coalesce(_configured_amount,0) > 0 then _configured_amount
    else _amount
  end;

  if _official_amount is null or _official_amount <= 0 then
    raise exception 'Informe o valor oficial da taxa de Habite-se.';
  end if;

  if _due < current_date then
    raise exception 'O vencimento da guia não pode estar no passado.';
  end if;

  select g.* into _guide
  from public.payment_guides g
  where g.process_id=_process_id
    and g.guide_kind='habite_se'
  order by g.created_at desc
  limit 1;

  if _guide.id is not null then
    return jsonb_build_object(
      'process_id',_process_id,
      'guide',to_jsonb(_guide),
      'existing',true
    );
  end if;

  _prefix := coalesce(nullif(_prefix,''),'DAM');
  _guide_number := _prefix||'-HAB-'||regexp_replace(coalesce(_process.protocol_number,_process.id::text),'^[^-]+-','');

  insert into public.payment_guides(
    tenant_id,municipality_id,process_id,property_id,
    guide_number,amount,due_date,status,paid,paid_at,guide_kind,
    requested_by_profile_id,requested_by_name,requested_at,
    issued_by_profile_id,issued_by_name
  )
  values(
    _process.tenant_id,coalesce(_process.municipality_id,_process.tenant_id),_process.id,_process.property_id,
    _guide_number,round(_official_amount,2),_due,'pendente',false,null,'habite_se',
    _request.created_by_profile_id,
    (select coalesce(nullif(btrim(p.full_name),''),nullif(btrim(p.email),''),'Vistoria') from public.profiles p where p.id=_request.created_by_profile_id),
    _request.created_at,
    _profile_id,
    (select coalesce(nullif(btrim(p.full_name),''),nullif(btrim(p.email),''),'Financeiro') from public.profiles p where p.id=_profile_id)
  )
  returning * into _guide;

  select coalesce(nullif(btrim(p.full_name),''),nullif(btrim(p.email),''),'Financeiro')
    into _issuer_name
  from public.profiles p
  where p.id=_profile_id
  limit 1;

  update public.interdepartmental_dispatches
     set status='concluido',
         completed_at=clock_timestamp(),
         assigned_to=coalesce(_issuer_name,assigned_to)
   where id=_request.id;

  update public.processes
     set status='pagamento_pendente'::public.process_status,
         current_department='Financeiro',
         current_queue='Pagamento - Guia de Habite-se',
         sla_stage='Guia de Habite-se aguardando pagamento',
         process_checkpoint='Guia de Habite-se emitida — aguardando pagamento',
         updated_at=clock_timestamp()
   where id=_process_id;

  insert into public.process_movements(
    tenant_id,process_id,actor_user_id,actor_profile_id,movement_type,
    from_status,to_status,description,visible_to_external,municipality_id
  )
  values(
    _process.tenant_id,_process_id,_legacy_user_id,_profile_id,'guia_emitida',
    _process.status,'pagamento_pendente'::public.process_status,
    'Guia de Habite-se '||_guide_number||' emitida pelo Financeiro no valor de R$ '||
      to_char(round(_official_amount,2),'FM999999990D00')||'.',
    true,coalesce(_process.municipality_id,_process.tenant_id)
  );

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,actor_profile_id,category,title,detail,
    visible_to_external,municipality_id
  )
  values(
    _process.tenant_id,_process_id,_legacy_user_id,_profile_id,'financeiro',
    'Guia de Habite-se emitida',
    'Guia '||_guide_number||' emitida pelo Financeiro. Valor: R$ '||
      to_char(round(_official_amount,2),'FM999999990D00')||'.',
    true,coalesce(_process.municipality_id,_process.tenant_id)
  );

  return jsonb_build_object(
    'process_id',_process_id,
    'guide',to_jsonb(_guide),
    'existing',false
  );
end;
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

  IF _guide_kind NOT IN ('protocolo','iss_obra','aprovacao_final','habite_se') THEN
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
      WHEN 'habite_se' THEN 'analise_tecnica'::public.process_status
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
           WHEN _guide_kind='habite_se' THEN 'Análise Urbanística'
           ELSE 'Processo concluído'
         END,
         current_queue=CASE
           WHEN _guide_kind='protocolo' THEN 'Triagem de Protocolo'
           WHEN _guide_kind='iss_obra' THEN 'Análise Urbanística'
           WHEN _guide_kind='habite_se' THEN 'Decisão / emissão do Habite-se'
           ELSE 'Concluído'
         END,
         sla_stage=CASE
           WHEN _guide_kind='protocolo' THEN 'Triagem documental apos pagamento'
           WHEN _guide_kind='iss_obra' THEN 'Análise Urbanística após ISSQN'
           WHEN _guide_kind='habite_se' THEN 'Decisão / emissão do Habite-se'
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
;

CREATE OR REPLACE FUNCTION public.reissue_process_payment_guide(_process_id uuid, _guide_kind text, _due_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _tenant_id uuid;
  _municipality_id uuid;
  _property_id uuid;
  _guide public.payment_guides%rowtype;
  _new_guide public.payment_guides%rowtype;
  _due date := coalesce(_due_date,current_date + 2);
  _next_revision integer;
  _new_number text;
  _base_number text;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if _guide_kind not in ('protocolo','iss_obra','aprovacao_final','habite_se') then
    raise exception 'Tipo de guia invalido';
  end if;

  if _due < current_date then
    raise exception 'O novo vencimento nao pode estar no passado';
  end if;

  select p.tenant_id,p.municipality_id,p.property_id
    into _tenant_id,_municipality_id,_property_id
  from public.processes p
  where p.id=_process_id;

  if _tenant_id is null then
    raise exception 'Processo nao encontrado';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  if not (public.is_master() or public.is_internal_municipality_role()) then
    raise exception 'Sem permissao para reemitir guia';
  end if;

  select pg.*
    into _guide
  from public.payment_guides pg
  where pg.process_id=_process_id
    and pg.guide_kind=_guide_kind
    and not coalesce(pg.paid,false)
  order by pg.created_at desc
  limit 1
  for update;

  if _guide.id is null then
    raise exception 'Guia nao encontrada para reemissao';
  end if;

  if coalesce(_guide.paid,false)=true
     or lower(coalesce(_guide.status,'')) in ('compensada','confirmed','paid','pago','confirmado') then
    raise exception 'Guia ja compensada nao pode ser reemitida';
  end if;

  if _guide_kind='protocolo' then
    if _guide.due_date is null or _guide.due_date::date >= current_date then
      raise exception 'A guia atual ainda esta valida e deve ser mantida. Nova guia so pode ser gerada apos o vencimento.';
    end if;

    select
      coalesce(max(coalesce(g.reissue_count,0)),0)+1,
      regexp_replace(
        coalesce((array_agg(g.guide_number order by g.created_at asc))[1],'GUIA'),
        '(-R[0-9]+)+$',
        ''
      )
      into _next_revision,_base_number
    from public.payment_guides g
    where g.process_id=_process_id
      and g.guide_kind='protocolo';

    _new_number := _base_number||'-R'||_next_revision::text;

    update public.payment_guides
    set status='vencida'
    where id=_guide.id;

    insert into public.payment_guides(
      tenant_id,municipality_id,process_id,property_id,
      guide_number,municipal_registration,amount,due_date,
      status,paid,guide_kind,original_due_date,reissue_count,last_reissued_at
    )
    values(
      _tenant_id,coalesce(_municipality_id,_tenant_id),_process_id,_property_id,
      _new_number,_guide.municipal_registration,_guide.amount,_due,
      'pendente',false,'protocolo',
      coalesce(_guide.original_due_date,_guide.due_date::date),
      _next_revision,clock_timestamp()
    )
    returning * into _new_guide;

    update public.processes
    set status='pagamento_pendente',
        updated_at=clock_timestamp()
    where id=_process_id;

    insert into public.process_audit_entries(
      tenant_id,process_id,actor_user_id,actor_profile_id,category,
      title,detail,visible_to_external,municipality_id
    )
    values(
      _tenant_id,_process_id,_legacy_user_id,_profile_id,'financeiro',
      'Nova guia emitida apos vencimento',
      'A guia original '||coalesce(_guide.guide_number,'')||
        ' foi preservada. Nova guia '||coalesce(_new_guide.guide_number,'')||
        ' emitida em '||to_char(_new_guide.created_at,'DD/MM/YYYY HH24:MI:SS')||
        ' com vencimento em '||to_char(_due,'DD/MM/YYYY')||'.',
      true,coalesce(_municipality_id,_tenant_id)
    );

    return jsonb_build_object(
      'process_id',_process_id,
      'guide',to_jsonb(_new_guide),
      'previous_guide',to_jsonb(_guide),
      'new_guide',true
    );
  end if;

  update public.payment_guides
  set original_due_date=coalesce(original_due_date,due_date),
      due_date=_due,
      status='pendente',
      reissue_count=coalesce(reissue_count,0)+1,
      last_reissued_at=clock_timestamp()
  where id=_guide.id
  returning * into _new_guide;

  update public.processes
  set status='pagamento_pendente',
      updated_at=clock_timestamp()
  where id=_process_id;

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,actor_profile_id,category,
    title,detail,visible_to_external,municipality_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,_profile_id,'financeiro',
    'Guia reemitida',
    'Segunda via #'||_new_guide.reissue_count::text||
      ' da guia '||coalesce(_new_guide.guide_number,'')||
      ' emitida com vencimento em '||to_char(_due,'DD/MM/YYYY')||'.',
    true,coalesce(_municipality_id,_tenant_id)
  );

  return jsonb_build_object(
    'process_id',_process_id,
    'guide',to_jsonb(_new_guide),
    'new_guide',false
  );
end;
$function$
;

grant execute on function public.request_habite_se_payment_guide_v1(uuid) to authenticated;
grant execute on function public.issue_habite_se_payment_guide_v1(uuid,numeric,date) to authenticated;
grant execute on function public.confirm_process_payment_guide(uuid,text) to authenticated;
grant execute on function public.reissue_process_payment_guide(uuid,text,date) to authenticated;

notify pgrst, 'reload schema';
