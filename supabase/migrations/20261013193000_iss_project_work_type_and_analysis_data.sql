begin;

alter table public.properties add column if not exists work_type text;

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
    lot, block, usage_type, work_type, construction_standard, area_m2
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
    nullif(_payload->>'workType',''),
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
$function$
;

create or replace function public.update_process_iss_project_data_v1(
  _process_id uuid,
  _area_m2 numeric,
  _usage text,
  _work_type text
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
  _tenant_id uuid;
  _municipality_id uuid;
  _property_id uuid;
  _current_department text;
  _document_count integer := 0;
  _not_approved_count integer := 0;
  _open_requirements integer := 0;
  _existing_iss integer := 0;
  _actor_name text;
  _property public.properties%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if not (
    public.is_master()
    or _role_code in ('prefeitura_admin','admin_municipality','admin_prefeitura','prefeitura_supervisor','analista','analyst')
  ) then
    raise exception 'Somente a Analise Urbanistica pode confirmar os dados do ISSQN / Projeto';
  end if;

  if _area_m2 is null or _area_m2 <= 0 then
    raise exception 'Informe uma metragem valida para a obra';
  end if;
  if nullif(btrim(_usage),'') is null then
    raise exception 'Informe o uso da edificacao para o calculo do ISSQN';
  end if;
  if nullif(btrim(_work_type),'') is null then
    raise exception 'Informe a natureza da obra';
  end if;

  select p.tenant_id,p.municipality_id,p.property_id,
         coalesce(nullif(btrim(p.current_department),''),'Analise Urbanistica')
    into _tenant_id,_municipality_id,_property_id,_current_department
  from public.processes p
  where p.id=_process_id
  for update;

  if _tenant_id is null or _property_id is null then
    raise exception 'Processo ou imovel nao encontrado';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  if lower(coalesce(_current_department,'')) not like '%analis%'
     and lower(coalesce(_current_department,'')) not like '%urban%'
     and lower(coalesce(_current_department,'')) not like '%obra%' then
    raise exception 'Os dados do ISSQN / Projeto so podem ser confirmados enquanto o processo estiver na Analise Urbanistica';
  end if;

  select count(*),
         count(*) filter (where coalesce(d.review_status,'pendente') <> 'aprovado')
    into _document_count,_not_approved_count
  from public.process_documents d
  where d.process_id=_process_id and coalesce(d.is_valid,true)=true;

  if _document_count=0 or _not_approved_count>0 then
    raise exception 'Todos os documentos e projetos devem estar aprovados antes do calculo do ISSQN / Projeto';
  end if;

  select count(*) into _open_requirements
  from public.process_requirements r
  where r.process_id=_process_id and r.status in ('aberta','respondida');

  if _open_requirements>0 then
    raise exception 'Existem Comunique-se ou exigencias pendentes no processo';
  end if;

  select count(*) into _existing_iss
  from public.payment_guides g
  where g.process_id=_process_id and g.guide_kind='iss_obra';

  if _existing_iss>0 then
    raise exception 'A guia de ISSQN / Projeto ja foi emitida para este processo';
  end if;

  update public.properties
     set area_m2=_area_m2,
         usage_type=btrim(_usage),
         work_type=btrim(_work_type)
   where id=_property_id
   returning * into _property;

  select coalesce(nullif(btrim(p.full_name),''),nullif(btrim(p.email),''),'Analista')
    into _actor_name
  from public.profiles p
  where p.id=_profile_id
  limit 1;

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,actor_profile_id,category,title,detail,
    visible_to_external,created_at,municipality_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,_profile_id,'financeiro',
    'Dados do ISSQN / Projeto confirmados',
    'Responsavel pela analise: '||coalesce(_actor_name,'Analista')||
      '. Natureza da obra: '||btrim(_work_type)||
      '. Uso: '||btrim(_usage)||
      '. Area: '||to_char(_area_m2,'FM999999990D00')||' m2.',
    false,now(),coalesce(_municipality_id,_tenant_id)
  );

  return jsonb_build_object(
    'process_id',_process_id,
    'property',to_jsonb(_property),
    'analysis_responsible',coalesce(_actor_name,'Analista')
  );
end;
$function$;

revoke all on function public.update_process_iss_project_data_v1(uuid,numeric,text,text) from public;
grant execute on function public.update_process_iss_project_data_v1(uuid,numeric,text,text) to authenticated;

commit;

notify pgrst, 'reload schema';
