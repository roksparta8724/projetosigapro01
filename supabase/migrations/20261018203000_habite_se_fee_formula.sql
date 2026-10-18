-- SIGAPRO — taxa do Habite-se calculada pela area oficial do processo.
--
-- Formula oficial:
--   taxa do Habite-se = area do imovel x valor de referencia do m2 (uso + acabamento) x aliquota
--
-- A area e o tipo de uso saem do cadastro do imovel vinculado ao processo.
-- O Financeiro escolhe somente o tipo de acabamento.
-- O valor enviado pelo navegador nunca e aceito como fonte de verdade.

begin;

create or replace function public.issue_habite_se_payment_guide_v2(
  _process_id uuid,
  _construction_standard text,
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
  _profiles jsonb := '[]'::jsonb;
  _profile jsonb;
  _area_m2 numeric;
  _usage text;
  _normalized_usage text;
  _normalized_standard text := public.normalize_fee_label(_construction_standard);
  _rate numeric;
  _aliquot numeric;
  _official_amount numeric;
  _due date := coalesce(_due_date,current_date + 2);
  _prefix text := 'DAM';
  _guide_number text;
  _issuer_name text;
  _calculation_detail text;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil.';
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
    raise exception 'Processo nao encontrado.';
  end if;

  if lower(coalesce(_process.process_type,'')) not like '%habite%' then
    raise exception 'A Guia de Habite-se so pode ser emitida em processo de Habite-se.';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo.';
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

  select d.* into _request
  from public.interdepartmental_dispatches d
  where d.process_id=_process_id
    and lower(coalesce(d.subject,'')) like '%guia%habite%'
    and d.status in ('aguardando','respondido')
  order by d.created_at desc
  limit 1
  for update;

  if _request.id is null then
    raise exception 'A vistoria / conferencia ainda nao encaminhou este Habite-se ao Financeiro.';
  end if;

  if nullif(_normalized_standard,'') is null then
    raise exception 'Selecione o tipo de acabamento antes de emitir a Guia de Habite-se.';
  end if;

  select pr.area_m2,pr.usage_type
    into _area_m2,_usage
  from public.properties pr
  where pr.id=_process.property_id
  limit 1;

  if coalesce(_area_m2,0) <= 0 then
    raise exception 'A area do imovel nao esta informada no cadastro do processo.';
  end if;

  _normalized_usage := public.normalize_fee_label(_usage);
  if nullif(_normalized_usage,'') is null then
    raise exception 'O tipo de construcao/uso nao esta informado no cadastro do processo.';
  end if;

  select coalesce(ms.general_settings,'{}'::jsonb),
         upper(regexp_replace(coalesce(nullif(ms.guide_prefix,''),'DAM'),'[^A-Za-z0-9]','','g'))
    into _settings,_prefix
  from public.municipality_settings ms
  where ms.municipality_id=coalesce(_process.municipality_id,_process.tenant_id)
  limit 1;

  if _settings is null then
    raise exception 'Configuracao financeira da Prefeitura nao encontrada.';
  end if;

  _aliquot := coalesce(
    nullif(_settings->>'approval_aliquot_percent','')::numeric,
    5
  );

  if _aliquot <= 0 or _aliquot > 100 then
    raise exception 'Aliquota do Habite-se invalida na configuracao municipal.';
  end if;

  if jsonb_typeof(_settings->'approval_rate_profiles')='array'
     and jsonb_array_length(_settings->'approval_rate_profiles') > 0 then
    _profiles := _settings->'approval_rate_profiles';
  end if;

  select p.value
    into _profile
  from jsonb_array_elements(_profiles) with ordinality p(value,ord)
  where public.normalize_fee_label(p.value->>'usage')=_normalized_usage
    and public.normalize_fee_label(p.value->>'standard')=_normalized_standard
  order by p.ord
  limit 1;

  _rate := nullif(_profile->>'rate','')::numeric;

  if _rate is null or _rate <= 0 then
    raise exception 'A tabela municipal nao possui valor para este tipo de construcao e acabamento.';
  end if;

  _official_amount := round(_area_m2 * _rate * (_aliquot / 100.0),2);

  if _official_amount <= 0 then
    raise exception 'O calculo oficial da taxa do Habite-se resultou em valor invalido.';
  end if;

  if _due < current_date then
    raise exception 'O vencimento da guia nao pode estar no passado.';
  end if;

  -- O acabamento selecionado passa a integrar o cadastro oficial do imovel/processo.
  update public.properties
     set construction_standard=_normalized_standard
   where id=_process.property_id;

  _prefix := coalesce(nullif(_prefix,''),'DAM');
  _guide_number := _prefix||'-HAB-'||regexp_replace(
    coalesce(_process.protocol_number,_process.id::text),
    '^[^-]+-',
    ''
  );

  select coalesce(nullif(btrim(p.full_name),''),nullif(btrim(p.email),''),'Financeiro')
    into _issuer_name
  from public.profiles p
  where p.id=_profile_id
  limit 1;

  insert into public.payment_guides(
    tenant_id,municipality_id,process_id,property_id,
    guide_number,amount,due_date,status,paid,paid_at,guide_kind,
    requested_by_profile_id,requested_by_name,requested_at,
    issued_by_profile_id,issued_by_name,
    area_m2_snapshot,usage_snapshot,construction_standard_snapshot
  )
  values(
    _process.tenant_id,coalesce(_process.municipality_id,_process.tenant_id),_process.id,_process.property_id,
    _guide_number,_official_amount,_due,'pendente',false,null,'habite_se',
    _request.created_by_profile_id,
    (select coalesce(nullif(btrim(p.full_name),''),nullif(btrim(p.email),''),'Vistoria') from public.profiles p where p.id=_request.created_by_profile_id),
    _request.created_at,
    _profile_id,
    coalesce(_issuer_name,'Financeiro'),
    _area_m2,btrim(_usage),_normalized_standard
  )
  returning * into _guide;

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
         process_checkpoint='Guia de Habite-se emitida por calculo oficial — aguardando pagamento',
         updated_at=clock_timestamp()
   where id=_process_id;

  _calculation_detail :=
    'Area '||to_char(_area_m2,'FM999999990D00')||' m2 x referencia R$ '||
    to_char(_rate,'FM999999990D00')||'/m2 x '||
    to_char(_aliquot,'FM999999990D####')||'% = R$ '||
    to_char(_official_amount,'FM999999990D00')||
    '. Uso: '||coalesce(btrim(_usage),'')||
    '. Acabamento: '||_normalized_standard||'.';

  insert into public.process_movements(
    tenant_id,process_id,actor_user_id,actor_profile_id,movement_type,
    from_status,to_status,description,visible_to_external,municipality_id
  )
  values(
    _process.tenant_id,_process_id,_legacy_user_id,_profile_id,'guia_emitida',
    _process.status,'pagamento_pendente'::public.process_status,
    'Guia de Habite-se '||_guide_number||' emitida pelo Financeiro. '||_calculation_detail,
    true,coalesce(_process.municipality_id,_process.tenant_id)
  );

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,actor_profile_id,category,title,detail,
    visible_to_external,municipality_id
  )
  values(
    _process.tenant_id,_process_id,_legacy_user_id,_profile_id,'financeiro',
    'Guia de Habite-se calculada e emitida',
    'Guia '||_guide_number||' emitida por '||coalesce(_issuer_name,'Financeiro')||'. '||
      _calculation_detail,
    true,coalesce(_process.municipality_id,_process.tenant_id)
  );

  return jsonb_build_object(
    'process_id',_process_id,
    'guide',to_jsonb(_guide),
    'calculation',jsonb_build_object(
      'area_m2',_area_m2,
      'usage',_usage,
      'construction_standard',_normalized_standard,
      'base_value_m2',_rate,
      'aliquot_percent',_aliquot,
      'total_amount',_official_amount
    ),
    'existing',false
  );
end;
$function$;

revoke all on function public.issue_habite_se_payment_guide_v2(uuid,text,date) from public;
grant execute on function public.issue_habite_se_payment_guide_v2(uuid,text,date) to authenticated;

comment on function public.issue_habite_se_payment_guide_v2(uuid,text,date)
is 'Emite a Guia de Habite-se recalculando no banco: area oficial x valor/m2 por uso e acabamento x aliquota municipal.';

commit;

notify pgrst, 'reload schema';
