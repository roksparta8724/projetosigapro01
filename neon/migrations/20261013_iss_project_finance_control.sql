-- SIGAPRO: depois da emissão do ISSQN / Projeto, o processo vai ao Financeiro
-- para controle, baixa e demais providências. Após a compensação, retorna à Análise Urbanística.

CREATE OR REPLACE FUNCTION public.issue_process_payment_guide(_process_id uuid, _guide_kind text, _amount numeric, _guide_prefix text DEFAULT 'DAM'::text, _due_date date DEFAULT NULL::date)
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
  _protocol_number text;
  _guide public.payment_guides%rowtype;
  _due date := coalesce(_due_date, current_date + 2);
  _prefix text := 'DAM';
  _kind_code text;
  _guide_number text;
  _financial_settings jsonb := '{}'::jsonb;
  _official_amount numeric;
  _property_area numeric;
  _property_usage text;
  _property_standard text;
  _from_department text;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if _guide_kind not in ('iss_obra','aprovacao_final') then
    raise exception 'Tipo de guia invalido para emissao por etapa';
  end if;

  if _amount is null or _amount < 0 then
    raise exception 'Valor da guia invalido';
  end if;

  select p.tenant_id,p.municipality_id,p.property_id,p.protocol_number,p.current_department
    into _tenant_id,_municipality_id,_property_id,_protocol_number,_from_department
  from public.processes p
  where p.id=_process_id;

  if _tenant_id is null then
    raise exception 'Processo nao encontrado';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  if not (public.is_master() or public.is_internal_municipality_role()) then
    raise exception 'Sem permissao para emitir guia';
  end if;

  select
    coalesce(ms.general_settings, '{}'::jsonb),
    upper(regexp_replace(coalesce(nullif(ms.guide_prefix,''),'DAM'),'[^A-Za-z0-9]','','g'))
    into _financial_settings,_prefix
  from public.municipality_settings ms
  where ms.municipality_id = coalesce(_municipality_id,_tenant_id)
  limit 1;

  _prefix := coalesce(nullif(_prefix,''),'DAM');

  select pr.area_m2,pr.usage_type,pr.construction_standard
    into _property_area,_property_usage,_property_standard
  from public.properties pr
  where pr.id=_property_id;

  _official_amount := public.resolve_municipal_guide_amount(
    coalesce(_municipality_id,_tenant_id),
    _guide_kind,
    _property_area,
    _property_usage,
    _property_standard
  );

  if _guide_kind='iss_obra'
     and coalesce((_financial_settings->>'iss_stage_enabled')::boolean,true)=false then
    raise exception 'A etapa de ISSQN esta desativada para esta Prefeitura';
  end if;

  if _guide_kind='aprovacao_final'
     and coalesce((_financial_settings->>'final_approval_fee_enabled')::boolean,true)=false then
    raise exception 'A taxa final de aprovacao esta desativada para esta Prefeitura';
  end if;

  select pg.*
    into _guide
  from public.payment_guides pg
  where pg.process_id=_process_id
    and pg.guide_kind=_guide_kind
  limit 1;

  if _guide.id is not null then
    return jsonb_build_object(
      'process_id',_process_id,
      'guide',to_jsonb(_guide),
      'existing',true
    );
  end if;

  _kind_code := case _guide_kind when 'iss_obra' then 'ISS' else 'APR' end;
  _guide_number := _prefix || '-' || _kind_code || '-' ||
                   regexp_replace(_protocol_number, '^[^-]+-', '');

  insert into public.payment_guides(
    tenant_id,municipality_id,process_id,property_id,
    guide_number,amount,due_date,status,paid,paid_at,guide_kind
  )
  values(
    _tenant_id,coalesce(_municipality_id,_tenant_id),_process_id,_property_id,
    _guide_number,_official_amount,_due,'pendente',false,null,_guide_kind
  )
  returning * into _guide;

  if _guide_kind='iss_obra'
     and lower(coalesce(_from_department,'')) not like '%financ%'
     and not exists (
       select 1
       from public.interdepartmental_dispatches d
       where d.process_id=_process_id
         and lower(coalesce(d.to_department,'')) like '%financ%'
         and d.status not in ('concluido','devolvido')
     ) then
    insert into public.interdepartmental_dispatches(
      tenant_id,municipality_id,process_id,from_department,to_department,
      subject,due_at,status,visibility,priority,created_by,created_by_profile_id,created_at
    )
    values(
      _tenant_id,coalesce(_municipality_id,_tenant_id),_process_id,
      coalesce(nullif(btrim(_from_department),''),'Análise Urbanística'),
      'Financeiro',
      'Guia de ISSQN / Projeto emitida — controle financeiro',
      _due::timestamptz,
      'aguardando','interno','media',
      _legacy_user_id,_profile_id,now()
    );
  end if;

  update public.processes
     set status='pagamento_pendente',
         current_department=case
           when _guide_kind='iss_obra' then 'Financeiro'
           else 'Financeiro'
         end,
         current_queue=case
           when _guide_kind='iss_obra' then 'Financeiro'
           else 'Financeiro'
         end,
         sla_stage=case
           when _guide_kind='iss_obra' then 'ISSQN / Projeto aguardando pagamento'
           else 'Taxa final aguardando pagamento'
         end,
         updated_at=now()
   where id=_process_id;

  insert into public.process_movements(
    tenant_id,process_id,actor_user_id,actor_profile_id,movement_type,
    from_status,to_status,description,visible_to_external,municipality_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,_profile_id,'guia_emitida',
    null,'pagamento_pendente',
    case
      when _guide_kind='iss_obra' then 'Guia de ISSQN / Projeto emitida e encaminhada ao Financeiro para controle.'
      else 'Guia final de aprovacao emitida.'
    end,
    (_guide_kind <> 'iss_obra'),coalesce(_municipality_id,_tenant_id)
  );

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,actor_profile_id,category,
    title,detail,visible_to_external,municipality_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,_profile_id,'financeiro',
    case
      when _guide_kind='iss_obra' then 'Guia ISSQN / Projeto emitida'
      else 'Guia final de aprovacao emitida'
    end,
    'Guia '||_guide_number||' emitida no valor de R$ '||to_char(_official_amount,'FM999999990D00')||'.',
    (_guide_kind <> 'iss_obra'),coalesce(_municipality_id,_tenant_id)
  );

  return jsonb_build_object(
    'process_id',_process_id,
    'guide',to_jsonb(_guide),
    'existing',false
  );
end;
$function$
;

notify pgrst, 'reload schema';
