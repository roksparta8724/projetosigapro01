-- SIGAPRO: solicitação e emissão da Guia de Recolhimento da Obra.
-- Análise solicita somente após aprovação documental; Financeiro é o único setor
-- que emite a guia e fica registrado quem solicitou e quem emitiu.

begin;

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

create or replace function public.request_construction_payment_guide_v1(_process_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _role_code text := public.current_role_code();
  _tenant_id uuid;
  _municipality_id uuid;
  _current_department text;
  _from_status public.process_status;
  _actor_name text;
  _document_count integer := 0;
  _not_approved_count integer := 0;
  _open_requirements integer := 0;
  _existing_guide integer := 0;
  _dispatch public.interdepartmental_dispatches%rowtype;
  _movement public.process_movements%rowtype;
  _audit public.process_audit_entries%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if not (
    public.is_master()
    or _role_code in ('prefeitura_admin','prefeitura_supervisor','analista')
  ) then
    raise exception 'Somente a Analise Urbanistica pode solicitar a guia da obra';
  end if;

  select
    p.tenant_id,
    p.municipality_id,
    p.status,
    coalesce(nullif(trim(p.current_department),''),'Analise Urbanistica')
  into
    _tenant_id,
    _municipality_id,
    _from_status,
    _current_department
  from public.processes p
  where p.id=_process_id
  for update;

  if _tenant_id is null then
    raise exception 'Processo nao encontrado';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  if lower(coalesce(_current_department,'')) not like '%analise%'
     and lower(coalesce(_current_department,'')) not like '%análise%'
     and lower(coalesce(_current_department,'')) not like '%urban%'
     and lower(coalesce(_current_department,'')) not like '%obra%' then
    raise exception 'O processo nao esta sob responsabilidade da Analise Urbanistica';
  end if;

  select
    count(*),
    count(*) filter (
      where coalesce(d.review_status,'pendente') <> 'aprovado'
    )
  into _document_count,_not_approved_count
  from public.process_documents d
  where d.process_id=_process_id
    and coalesce(d.is_valid,true)=true;

  if _document_count = 0 then
    raise exception 'O processo nao possui documentos para concluir a analise';
  end if;

  if _not_approved_count > 0 then
    raise exception 'Todos os documentos e projetos devem estar aprovados antes de solicitar a guia da obra';
  end if;

  select count(*)
    into _open_requirements
  from public.process_requirements r
  where r.process_id=_process_id
    and r.status in ('aberta','respondida');

  if _open_requirements > 0 then
    raise exception 'Existem Comunique-se ou exigencias pendentes no processo';
  end if;

  select count(*)
    into _existing_guide
  from public.payment_guides g
  where g.process_id=_process_id
    and g.guide_kind in ('aprovacao_final','final_approval');

  if _existing_guide > 0 then
    raise exception 'A Guia de Recolhimento da Obra ja foi emitida para este processo';
  end if;

  select d.*
    into _dispatch
  from public.interdepartmental_dispatches d
  where d.process_id=_process_id
    and d.subject ilike '%Guia de Recolhimento da Obra%'
    and d.status in ('aguardando','respondido')
  order by d.created_at desc
  limit 1;

  if _dispatch.id is not null then
    return jsonb_build_object(
      'process_id',_process_id,
      'request',to_jsonb(_dispatch),
      'existing',true
    );
  end if;

  select coalesce(nullif(trim(p.full_name),''),nullif(trim(p.email),''),'Analista')
    into _actor_name
  from public.profiles p
  where p.id=_profile_id
  limit 1;

  insert into public.interdepartmental_dispatches(
    tenant_id,process_id,from_department,to_department,subject,due_at,
    created_by,created_at,visibility,municipality_id,created_by_profile_id,
    status,priority,assigned_to
  )
  values(
    _tenant_id,_process_id,_current_department,'Financeiro',
    'Solicitação de emissão — Guia de Recolhimento da Obra',
    now()+interval '2 days',
    _legacy_user_id,now(),'interno',coalesce(_municipality_id,_tenant_id),_profile_id,
    'aguardando','media',null
  )
  returning * into _dispatch;

  update public.processes
     set status='despacho_intersetorial'::public.process_status,
         current_department='Financeiro',
         current_queue='Emissao da Guia de Recolhimento da Obra',
         sla_stage='Guia de Recolhimento da Obra - aguardando emissao',
         updated_at=now()
   where id=_process_id;

  insert into public.process_movements(
    tenant_id,process_id,actor_user_id,actor_profile_id,movement_type,
    from_status,to_status,description,created_at,visible_to_external,municipality_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,_profile_id,'dispatch',
    _from_status,'despacho_intersetorial'::public.process_status,
    'Analise concluida. '||coalesce(_actor_name,'Analista')||
      ' solicitou ao Financeiro a emissao da Guia de Recolhimento da Obra.',
    now(),true,coalesce(_municipality_id,_tenant_id)
  )
  returning * into _movement;

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,actor_profile_id,category,
    title,detail,visible_to_external,created_at,municipality_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,_profile_id,'financeiro',
    'Guia da obra solicitada',
    'Solicitacao de emissao enviada ao Financeiro por '||coalesce(_actor_name,'Analista')||'.',
    true,now(),coalesce(_municipality_id,_tenant_id)
  )
  returning * into _audit;

  return jsonb_build_object(
    'process_id',_process_id,
    'request',to_jsonb(_dispatch),
    'requester_name',_actor_name,
    'movement',to_jsonb(_movement),
    'audit',to_jsonb(_audit),
    'existing',false
  );
end;
$function$;

create or replace function public.issue_construction_payment_guide_v1(
  _process_id uuid,
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
  _role_code text := public.current_role_code();
  _tenant_id uuid;
  _municipality_id uuid;
  _property_id uuid;
  _request public.interdepartmental_dispatches%rowtype;
  _guide public.payment_guides%rowtype;
  _issue_result jsonb;
  _requester_name text;
  _issuer_name text;
  _owner_name text;
  _owner_document text;
  _professional_name text;
  _area numeric;
  _usage text;
  _standard text;
  _document_count integer := 0;
  _not_approved_count integer := 0;
  _open_requirements integer := 0;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if not (
    public.is_master()
    or _role_code in ('prefeitura_admin','financeiro')
  ) then
    raise exception 'Somente o Setor Financeiro pode emitir a Guia de Recolhimento da Obra';
  end if;

  select p.tenant_id,p.municipality_id,p.property_id
    into _tenant_id,_municipality_id,_property_id
  from public.processes p
  where p.id=_process_id
  for update;

  if _tenant_id is null then
    raise exception 'Processo nao encontrado';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  select d.*
    into _request
  from public.interdepartmental_dispatches d
  where d.process_id=_process_id
    and d.subject ilike '%Guia de Recolhimento da Obra%'
    and d.status in ('aguardando','respondido')
  order by d.created_at desc
  limit 1
  for update;

  if _request.id is null then
    raise exception 'A Analise Urbanistica ainda nao solicitou a emissao desta guia';
  end if;

  select
    count(*),
    count(*) filter (
      where coalesce(d.review_status,'pendente') <> 'aprovado'
    )
  into _document_count,_not_approved_count
  from public.process_documents d
  where d.process_id=_process_id
    and coalesce(d.is_valid,true)=true;

  if _document_count = 0 or _not_approved_count > 0 then
    raise exception 'A emissao exige todos os documentos e projetos aprovados';
  end if;

  select count(*)
    into _open_requirements
  from public.process_requirements r
  where r.process_id=_process_id
    and r.status in ('aberta','respondida');

  if _open_requirements > 0 then
    raise exception 'Existem Comunique-se ou exigencias pendentes no processo';
  end if;

  select coalesce(nullif(trim(p.full_name),''),nullif(trim(p.email),''),'Analista')
    into _requester_name
  from public.profiles p
  where p.id=_request.created_by_profile_id
  limit 1;

  select coalesce(nullif(trim(p.full_name),''),nullif(trim(p.email),''),'Funcionario do Financeiro')
    into _issuer_name
  from public.profiles p
  where p.id=_profile_id
  limit 1;

  select
    max(case when pp.party_type='proprietario' then pp.display_name end),
    max(case when pp.party_type='proprietario' then pp.document_masked end),
    max(case when pp.party_type='profissional_externo' then pp.display_name end)
  into _owner_name,_owner_document,_professional_name
  from public.process_parties pp
  where pp.process_id=_process_id;

  select pr.area_m2,pr.usage_type,pr.construction_standard
    into _area,_usage,_standard
  from public.properties pr
  where pr.id=_property_id;

  _issue_result := public.issue_process_payment_guide_v2(
    _process_id,
    'aprovacao_final',
    _due_date
  );

  select g.*
    into _guide
  from public.payment_guides g
  where g.process_id=_process_id
    and g.guide_kind in ('aprovacao_final','final_approval')
  order by g.created_at desc
  limit 1
  for update;

  if _guide.id is null then
    raise exception 'Falha ao emitir a Guia de Recolhimento da Obra';
  end if;

  update public.processes
     set current_department='Financeiro',
         current_queue='Pagamento - Guia de Recolhimento da Obra',
         sla_stage='Guia de Recolhimento da Obra aguardando pagamento',
         updated_at=now()
   where id=_process_id;

  update public.process_movements
     set description='Guia de Recolhimento da Obra emitida pelo Financeiro.'
   where id=(
     select pm.id
     from public.process_movements pm
     where pm.process_id=_process_id
       and pm.movement_type='guia_emitida'
     order by pm.created_at desc
     limit 1
   );

  update public.process_audit_entries
     set title='Guia de Recolhimento da Obra emitida',
         detail='Guia de Recolhimento da Obra emitida pelo Setor Financeiro.'
   where id=(
     select pa.id
     from public.process_audit_entries pa
     where pa.process_id=_process_id
       and pa.category='financeiro'
       and pa.title ilike '%guia%emitida%'
     order by pa.created_at desc
     limit 1
   );

  update public.payment_guides
     set requested_by_profile_id=_request.created_by_profile_id,
         requested_by_name=coalesce(_requester_name,'Analista'),
         requested_at=_request.created_at,
         issued_by_profile_id=_profile_id,
         issued_by_name=coalesce(_issuer_name,'Funcionario do Financeiro'),
         owner_name_snapshot=coalesce(_owner_name,'Proprietario nao informado'),
         owner_document_snapshot=_owner_document,
         professional_name_snapshot=coalesce(_professional_name,'Profissional nao informado'),
         area_m2_snapshot=_area,
         usage_snapshot=_usage,
         construction_standard_snapshot=_standard
   where id=_guide.id
   returning * into _guide;

  update public.interdepartmental_dispatches
     set status='concluido',
         completed_at=now(),
         assigned_to=coalesce(nullif(trim(_issuer_name),''),assigned_to)
   where id=_request.id;

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,actor_profile_id,category,
    title,detail,visible_to_external,created_at,municipality_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,_profile_id,'financeiro',
    'Guia de Recolhimento da Obra emitida',
    'Solicitada por '||coalesce(_requester_name,'Analista')||
      ' e emitida por '||coalesce(_issuer_name,'Funcionario do Financeiro')||
      '. Guia '||coalesce(_guide.guide_number,'')||'.',
    true,now(),coalesce(_municipality_id,_tenant_id)
  );

  return jsonb_build_object(
    'process_id',_process_id,
    'guide',to_jsonb(_guide),
    'requested_by',coalesce(_requester_name,'Analista'),
    'issued_by',coalesce(_issuer_name,'Funcionario do Financeiro'),
    'issue_result',_issue_result
  );
end;
$function$;

revoke all on function public.request_construction_payment_guide_v1(uuid) from public;
grant execute on function public.request_construction_payment_guide_v1(uuid) to authenticated;

revoke all on function public.issue_construction_payment_guide_v1(uuid,date) from public;
grant execute on function public.issue_construction_payment_guide_v1(uuid,date) to authenticated;

commit;

notify pgrst, 'reload schema';
