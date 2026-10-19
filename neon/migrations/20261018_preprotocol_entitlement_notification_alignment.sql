-- SIGAPRO — contabilização e notificações alinhadas ao pré-protocolo.
-- Pré-protocolo não consome cota de processo e não gera ruído operacional municipal.

CREATE OR REPLACE FUNCTION public.municipality_plan_entitlements_v1(_municipality_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _assignment public.client_plan_assignments%rowtype;
  _plan public.plans%rowtype;
  _users bigint := 0; _processes bigint := 0; _departments bigint := 0; _storage_bytes bigint := 0;
  _contract_active boolean := false; _reason text := '';
begin
  select * into _assignment from public.client_plan_assignments where municipality_id=_municipality_id limit 1;
  if _assignment.id is not null then select * into _plan from public.plans where id=_assignment.plan_id limit 1; end if;

  select count(distinct tm.profile_id) into _users
  from public.tenant_memberships tm join public.roles r on r.id=tm.role_id
  where tm.tenant_id=_municipality_id and tm.profile_id is not null
    and tm.is_active=true and tm.deleted_at is null
    and r.code::text not in ('master_admin','master_ops','admin_master','profissional','profissional_externo','proprietario_consulta');

  select count(*) into _processes from public.processes p
  where coalesce(p.municipality_id,p.tenant_id)=_municipality_id
    and p.archived_at is null
    and p.officialized_at is not null;

  select count(*) into _departments from public.departments d
  where d.municipality_id=_municipality_id and d.is_active=true;

  select coalesce(sum(greatest(coalesce(pd.file_size_bytes,0),0)),0) into _storage_bytes
  from public.process_documents pd
  where coalesce(pd.municipality_id,pd.tenant_id)=_municipality_id and pd.is_valid=true;

  if _assignment.id is null then _reason := 'Nenhum plano comercial foi vinculado a esta Prefeitura.';
  elsif _plan.id is null then _reason := 'O plano vinculado nao foi encontrado.';
  elsif not _plan.is_active then _reason := 'O plano vinculado esta inativo.';
  elsif _assignment.contract_status not in ('ativo','trial','upgrade','downgrade') then _reason := 'O contrato desta Prefeitura nao esta ativo.';
  elsif _assignment.starts_at is not null and _assignment.starts_at > current_date then _reason := 'O contrato desta Prefeitura ainda nao iniciou.';
  elsif _assignment.ends_at is not null and _assignment.ends_at < current_date then _reason := 'O contrato desta Prefeitura esta vencido.';
  else _contract_active := true;
  end if;

  return jsonb_build_object(
    'municipalityId',_municipality_id,'configured',_assignment.id is not null and _plan.id is not null,
    'contractActive',_contract_active,'contractReason',_reason,'assignmentId',_assignment.id,
    'planId',_plan.id,'planName',_plan.name,'contractStatus',_assignment.contract_status,
    'startsAt',_assignment.starts_at,'endsAt',_assignment.ends_at,
    'modules',coalesce(_plan.modules_included,'[]'::jsonb),
    'limits',jsonb_build_object('users',_plan.max_users,'processes',_plan.max_processes,'departments',_plan.max_departments,'storageGb',_plan.max_storage_gb),
    'usage',jsonb_build_object('users',_users,'processes',_processes,'departments',_departments,'storageBytes',_storage_bytes)
  );
end; $function$
;

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
  _url := '/processos/'||new.process_id::text;
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
      _label||' emitida',
      'A '||_label||' do processo '||_process.protocol_number||' foi emitida.',
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
