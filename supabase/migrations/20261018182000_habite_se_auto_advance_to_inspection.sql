-- SIGAPRO — avanço automático do Habite-se da Análise para Vistoria / conferência.
-- O processo só sai da Análise quando TODOS os pré-requisitos estiverem efetivamente concluídos:
-- documentos enviados/revisados, nenhuma exigência aberta e ficha oficial de análise concluída/assinada.

create or replace function public.try_advance_habite_se_to_inspection_v1(
  _process_id uuid,
  _actor_profile_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _process public.processes%rowtype;
  _actor_profile uuid;
  _actor_user uuid;
  _actor_name text;
  _normalized_folder text;
  _required_total integer := 0;
  _required_missing integer := 0;
  _pending_documents integer := 0;
  _open_requirements integer := 0;
  _analysis_sheet_complete boolean := false;
  _dispatch public.interdepartmental_dispatches%rowtype;
begin
  select * into _process
  from public.processes p
  where p.id=_process_id
  for update;

  if _process.id is null then
    return jsonb_build_object('advanced',false,'reason','process_not_found');
  end if;

  if lower(coalesce(_process.process_type,'')) not like '%habite%' then
    return jsonb_build_object('advanced',false,'reason','not_habite_se');
  end if;

  if _process.status in ('deferido','indeferido','arquivado') then
    return jsonb_build_object('advanced',false,'reason','final_status');
  end if;

  _normalized_folder := lower(
    translate(
      coalesce(
        nullif(btrim(_process.current_department),''),
        nullif(btrim(_process.current_queue),''),
        ''
      ),
      'ÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇáàâãéèêíìîóòôõúùûç',
      'AAAAEEEIIIOOOOUUUCaaaaeeeiiioooouuuc'
    )
  );

  -- Só move quando o processo ainda está realmente na etapa de Análise.
  if _normalized_folder !~ '(analise|urban|obra|engenharia)' then
    return jsonb_build_object(
      'advanced',false,
      'reason','not_in_analysis',
      'current_department',_process.current_department,
      'current_queue',_process.current_queue
    );
  end if;

  select count(*)
    into _required_total
  from public.process_documents d
  where d.process_id=_process_id
    and coalesce(d.is_valid,true)=true
    and coalesce(d.is_required,false)=true;

  select count(*)
    into _required_missing
  from public.process_documents d
  where d.process_id=_process_id
    and coalesce(d.is_valid,true)=true
    and coalesce(d.is_required,false)=true
    and (
      nullif(btrim(coalesce(d.file_path,'')),'') is null
      or coalesce(d.review_status,'pendente') <> 'aprovado'
    );

  -- Qualquer arquivo válido que foi efetivamente apresentado também precisa estar revisado.
  select count(*)
    into _pending_documents
  from public.process_documents d
  where d.process_id=_process_id
    and coalesce(d.is_valid,true)=true
    and nullif(btrim(coalesce(d.file_path,'')),'') is not null
    and coalesce(d.review_status,'pendente') <> 'aprovado';

  select count(*)
    into _open_requirements
  from public.process_requirements r
  where r.process_id=_process_id
    and r.status in ('aberta','respondida');

  select exists(
    select 1
    from public.signature_blocks sb
    where sb.process_id=_process_id
      and sb.artifact_type='urban_analysis_checklist'
      and sb.artifact_key='urban-analysis-checklist'
      and sb.status='concluido'
      and sb.completed_at is not null
  ) into _analysis_sheet_complete;

  if _required_total = 0 then
    return jsonb_build_object('advanced',false,'reason','no_required_documents');
  end if;

  if _required_missing > 0 or _pending_documents > 0 then
    return jsonb_build_object(
      'advanced',false,
      'reason','documents_pending',
      'required_missing',_required_missing,
      'pending_documents',_pending_documents
    );
  end if;

  if _open_requirements > 0 then
    return jsonb_build_object(
      'advanced',false,
      'reason','requirements_pending',
      'open_requirements',_open_requirements
    );
  end if;

  if not _analysis_sheet_complete then
    return jsonb_build_object(
      'advanced',false,
      'reason','analysis_sheet_pending'
    );
  end if;

  _actor_profile := coalesce(
    _actor_profile_id,
    public.current_profile_id(),
    _process.analysis_assigned_to_profile_id
  );

  if _actor_profile is not null then
    select p.user_id,
           coalesce(nullif(btrim(p.full_name),''),nullif(btrim(p.email),''),'Equipe da Análise')
      into _actor_user,_actor_name
    from public.profiles p
    where p.id=_actor_profile
    limit 1;
  end if;

  _actor_name := coalesce(_actor_name,'Equipe da Análise Urbanística');

  -- Encerra o despacho ativo que trouxe o processo para a Análise.
  update public.interdepartmental_dispatches
     set status='concluido',
         completed_at=coalesce(completed_at,clock_timestamp()),
         assigned_to=coalesce(assigned_to,_actor_name)
   where process_id=_process_id
     and status in ('aguardando','respondido');

  insert into public.interdepartmental_dispatches(
    tenant_id,
    municipality_id,
    process_id,
    from_department,
    to_department,
    subject,
    due_at,
    status,
    visibility,
    priority,
    created_by,
    created_by_profile_id,
    created_at
  )
  values(
    _process.tenant_id,
    coalesce(_process.municipality_id,_process.tenant_id),
    _process.id,
    'Análise Urbanística',
    'Fiscalização',
    'Análise documental concluída — Vistoria / conferência',
    clock_timestamp()+interval '5 days',
    'aguardando',
    'interno',
    'media',
    _actor_user,
    _actor_profile,
    clock_timestamp()
  )
  returning * into _dispatch;

  update public.processes
     set status='despacho_intersetorial'::public.process_status,
         current_department='Fiscalização',
         current_queue='Vistoria / conferência',
         sla_stage='Vistoria / conferência',
         sla_due_at=clock_timestamp()+interval '5 days',
         sla_breached=false,
         process_checkpoint='Análise documental concluída — aguardando vistoria / conferência',
         updated_at=clock_timestamp()
   where id=_process_id;

  insert into public.process_movements(
    tenant_id,
    process_id,
    actor_user_id,
    actor_profile_id,
    movement_type,
    from_status,
    to_status,
    description,
    visible_to_external,
    municipality_id,
    created_at
  )
  values(
    _process.tenant_id,
    _process_id,
    _actor_user,
    _actor_profile,
    'dispatch',
    _process.status,
    'despacho_intersetorial'::public.process_status,
    'Análise documental do Habite-se concluída. Processo encaminhado à Fiscalização para Vistoria / conferência.',
    true,
    coalesce(_process.municipality_id,_process.tenant_id),
    clock_timestamp()
  );

  insert into public.process_audit_entries(
    tenant_id,
    process_id,
    actor_user_id,
    actor_profile_id,
    category,
    title,
    detail,
    visible_to_external,
    municipality_id,
    created_at
  )
  values(
    _process.tenant_id,
    _process_id,
    _actor_user,
    _actor_profile,
    'analise',
    'Análise documental concluída',
    'Os documentos obrigatórios foram aprovados, não há exigências abertas e a Ficha Oficial de Análise foi concluída. O processo seguiu automaticamente para Fiscalização — Vistoria / conferência.',
    true,
    coalesce(_process.municipality_id,_process.tenant_id),
    clock_timestamp()
  );

  return jsonb_build_object(
    'advanced',true,
    'process_id',_process_id,
    'dispatch',to_jsonb(_dispatch),
    'to_department','Fiscalização',
    'to_queue','Vistoria / conferência'
  );
end;
$function$;

create or replace function public.trg_try_advance_habite_se_from_document_v1()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
begin
  if tg_op='INSERT'
     or new.review_status is distinct from old.review_status
     or new.file_path is distinct from old.file_path
     or new.is_valid is distinct from old.is_valid then
    perform public.try_advance_habite_se_to_inspection_v1(
      new.process_id,
      public.current_profile_id()
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_try_advance_habite_se_from_document_v1 on public.process_documents;
create trigger trg_try_advance_habite_se_from_document_v1
after insert or update of review_status,file_path,is_valid
on public.process_documents
for each row
execute function public.trg_try_advance_habite_se_from_document_v1();

create or replace function public.trg_try_advance_habite_se_from_requirement_v1()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
begin
  if tg_op='INSERT' or new.status is distinct from old.status then
    perform public.try_advance_habite_se_to_inspection_v1(
      new.process_id,
      public.current_profile_id()
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_try_advance_habite_se_from_requirement_v1 on public.process_requirements;
create trigger trg_try_advance_habite_se_from_requirement_v1
after insert or update of status
on public.process_requirements
for each row
execute function public.trg_try_advance_habite_se_from_requirement_v1();

create or replace function public.trg_try_advance_habite_se_from_analysis_sheet_v1()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
begin
  if new.process_id is not null
     and new.artifact_type='urban_analysis_checklist'
     and new.artifact_key='urban-analysis-checklist'
     and new.status='concluido'
     and (
       tg_op='INSERT'
       or new.status is distinct from old.status
       or new.completed_at is distinct from old.completed_at
     ) then
    perform public.try_advance_habite_se_to_inspection_v1(
      new.process_id,
      public.current_profile_id()
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_try_advance_habite_se_from_analysis_sheet_v1 on public.signature_blocks;
create trigger trg_try_advance_habite_se_from_analysis_sheet_v1
after insert or update of status,completed_at
on public.signature_blocks
for each row
execute function public.trg_try_advance_habite_se_from_analysis_sheet_v1();

grant execute on function public.try_advance_habite_se_to_inspection_v1(uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
