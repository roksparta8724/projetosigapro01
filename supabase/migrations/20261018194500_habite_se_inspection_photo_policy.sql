-- SIGAPRO — correção da política de evidência fotográfica da vistoria.
-- Fotos são evidências complementares e não bloqueiam universalmente o fluxo.

create or replace function public.complete_habite_se_inspection_v1(
  _process_id uuid,
  _result text,
  _checklist jsonb,
  _notes text default null,
  _photo_evidence_waived boolean default false,
  _photo_waiver_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _inspection public.process_habite_se_inspections%rowtype;
  _process public.processes%rowtype;
  _profile public.profiles%rowtype;
  _result_normalized text := lower(btrim(coalesce(_result,'')));
  _notes_normalized text := nullif(btrim(coalesce(_notes,'')),'');
  _waiver_reason text := nullif(btrim(coalesce(_photo_waiver_reason,'')),'');
  _photo_count integer := 0;
  _open_requirements integer := 0;
  _invalid_items integer := 0;
  _pending_items integer := 0;
  _finance jsonb := '{}'::jsonb;
begin
  if not public.can_manage_habite_se_inspection_v1(_process_id) then
    raise exception 'Somente servidor municipal autorizado pode concluir a vistoria do Habite-se.';
  end if;

  if _result_normalized not in ('conforme','pendencias') then
    raise exception 'Resultado da vistoria inválido.';
  end if;

  select * into _process from public.processes where id=_process_id for update;
  select * into _profile from public.profiles where id=public.current_profile_id();

  select * into _inspection
  from public.process_habite_se_inspections
  where process_id=_process_id
  for update;

  if _inspection.id is null then
    raise exception 'Salve o termo de vistoria antes de concluir.';
  end if;

  if jsonb_typeof(coalesce(_checklist,'{}'::jsonb)) <> 'object'
     or (select count(*) from jsonb_object_keys(coalesce(_checklist,'{}'::jsonb))) < 8 then
    raise exception 'Conclua todos os itens do checklist da vistoria.';
  end if;

  select count(*) into _invalid_items
  from jsonb_each_text(_checklist) item
  where item.value not in ('conforme','pendencia','nao_aplica');

  if _invalid_items > 0 then
    raise exception 'Existem itens do checklist sem classificação válida.';
  end if;

  select count(*) into _pending_items
  from jsonb_each_text(_checklist) item
  where item.value='pendencia';

  select count(*) into _photo_count
  from public.process_habite_se_inspection_photos p
  where p.inspection_id=_inspection.id;

  -- Fotos são evidência complementar e permanecem vinculadas ao processo,
  -- mas não bloqueiam a conclusão da vistoria. Quando o fiscal optar por
  -- justificar formalmente a ausência de fotos, a justificativa precisa ser útil.
  if coalesce(_photo_evidence_waived,false)
     and (_waiver_reason is null or length(_waiver_reason) < 15) then
    raise exception 'A justificativa para ausência de evidência fotográfica deve ter pelo menos 15 caracteres.';
  end if;

  if _result_normalized='conforme' and _pending_items > 0 then
    raise exception 'Não é possível concluir como conforme enquanto houver item marcado como pendência.';
  end if;

  if _result_normalized='pendencias' and _pending_items = 0 then
    raise exception 'Marque ao menos um item como pendência antes de concluir com pendências.';
  end if;

  if _result_normalized='pendencias' and _notes_normalized is null then
    raise exception 'Descreva as pendências encontradas na vistoria.';
  end if;

  select count(*) into _open_requirements
  from public.process_requirements r
  where r.process_id=_process_id
    and r.status in ('aberta','respondida');

  if _result_normalized='conforme' and _open_requirements > 0 then
    raise exception 'Existem exigências pendentes. Conclua-as antes de aprovar a vistoria.';
  end if;

  update public.process_habite_se_inspections
     set status=_result_normalized,
         checklist=coalesce(_checklist,'{}'::jsonb),
         notes=_notes_normalized,
         photo_evidence_waived=coalesce(_photo_evidence_waived,false),
         photo_waiver_reason=_waiver_reason,
         inspector_profile_id=_profile.id,
         inspector_user_id=_profile.user_id,
         inspector_name=coalesce(nullif(btrim(_profile.full_name),''),nullif(btrim(_profile.email),''),'Fiscal responsável'),
         completed_at=clock_timestamp(),
         updated_at=clock_timestamp()
   where id=_inspection.id
   returning * into _inspection;

  insert into public.process_audit_entries(
    tenant_id,municipality_id,process_id,actor_user_id,actor_profile_id,
    category,title,detail,visible_to_external,created_at
  )
  values(
    _process.tenant_id,coalesce(_process.municipality_id,_process.tenant_id),_process_id,
    _profile.user_id,_profile.id,'vistoria',
    case when _result_normalized='conforme'
      then 'Vistoria do Habite-se concluída'
      else 'Vistoria do Habite-se com pendências'
    end,
    case when _result_normalized='conforme'
      then 'Vistoria / conferência concluída como CONFORME. Evidências fotográficas registradas: '||_photo_count::text||'.'
      else 'Vistoria / conferência registrou pendências. '||coalesce(_notes_normalized,'')
    end,
    true,clock_timestamp()
  );

  if _result_normalized='pendencias' then
    if not exists(
      select 1
      from public.process_requirements r
      where r.process_id=_process_id
        and r.status in ('aberta','respondida')
        and r.title='Pendências da vistoria do Habite-se'
    ) then
      insert into public.process_requirements(
        tenant_id,municipality_id,process_id,title,description,status,visibility,
        target_name,created_by,created_by_profile_id,created_at,due_at
      )
      values(
        _process.tenant_id,coalesce(_process.municipality_id,_process.tenant_id),_process_id,
        'Pendências da vistoria do Habite-se',
        _notes_normalized,
        'aberta','externo','Responsável técnico',
        _profile.user_id,_profile.id,clock_timestamp(),clock_timestamp()+interval '10 days'
      );
    end if;

    update public.processes
       set status='exigencia'::public.process_status,
           current_department='Fiscalização',
           current_queue='Vistoria / conferência',
           sla_stage='Vistoria com pendências',
           process_checkpoint='Vistoria com pendências — aguardando correção',
           updated_at=clock_timestamp()
     where id=_process_id;

    return jsonb_build_object(
      'inspection',to_jsonb(_inspection),
      'advanced_to_finance',false,
      'result','pendencias'
    );
  end if;

  select public.request_habite_se_payment_guide_v1(_process_id)
    into _finance;

  return jsonb_build_object(
    'inspection',to_jsonb(_inspection),
    'advanced_to_finance',true,
    'result','conforme',
    'finance',_finance
  );
end;
$function$;

notify pgrst, 'reload schema';
