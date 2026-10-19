-- SIGAPRO — Habite-se: preenchimento automático do Alvará e propriedade exclusiva do checklist.
-- Regras:
-- 1) o Alvará reaproveita os dados oficiais já protocolados;
-- 2) o checklist só pode ser alterado pelo Analista atualmente responsável ou pela Diretoria;
-- 3) ao reatribuir a análise, o direito de edição migra automaticamente para o novo Analista;
-- 4) retificações posteriores à vistoria preservam responsável/data originais e geram auditoria.

begin;

create or replace function public.can_manage_habite_se_inspection_v1(_process_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _profile_id uuid := public.current_profile_id();
  _role text := lower(coalesce(public.current_role_code(),''));
  _profile_municipality uuid;
  _process public.processes%rowtype;
  _profile_name text;
begin
  if _profile_id is null then return false; end if;

  select p.municipality_id,
         lower(btrim(coalesce(p.full_name,'')))
    into _profile_municipality,_profile_name
  from public.profiles p
  where p.id=_profile_id
    and p.deleted_at is null
    and p.account_status='active';

  if _profile_municipality is null then return false; end if;

  select * into _process
  from public.processes
  where id=_process_id;

  if _process.id is null then return false; end if;

  if _profile_municipality is distinct from coalesce(_process.municipality_id,_process.tenant_id) then
    return false;
  end if;

  -- Diretoria municipal supervisiona e pode retificar.
  if _role='prefeitura_supervisor' then
    return true;
  end if;

  -- Um Analista só edita quando for o responsável atual.
  if _role in ('analista','analyst') then
    if _process.analysis_assigned_to_profile_id is not null then
      return _process.analysis_assigned_to_profile_id=_profile_id;
    end if;

    -- Compatibilidade com processos antigos sem profile_id salvo.
    return lower(btrim(coalesce(_process.analysis_assigned_to,'')))=_profile_name
      and _profile_name<>'';
  end if;

  return false;
end;
$function$;

create or replace function public.upsert_habite_se_inspection_v1(
  _process_id uuid,
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
  _process public.processes%rowtype;
  _profile public.profiles%rowtype;
  _inspection public.process_habite_se_inspections%rowtype;
  _existing public.process_habite_se_inspections%rowtype;
  _folder text;
  _is_initial_stage boolean := false;
begin
  if not public.can_manage_habite_se_inspection_v1(_process_id) then
    raise exception 'Somente o Analista responsável atual ou a Diretoria podem alterar o checklist do Habite-se.';
  end if;

  select * into _process
  from public.processes
  where id=_process_id
  for update;

  if _process.id is null then raise exception 'Processo não encontrado.'; end if;
  if lower(coalesce(_process.process_type,'')) not like '%habite%' then
    raise exception 'Este termo de vistoria é exclusivo do processo de Habite-se.';
  end if;

  _folder := lower(
    translate(
      coalesce(nullif(btrim(_process.current_department),''),nullif(btrim(_process.current_queue),''),''),
      'ÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇáàâãéèêíìîóòôõúùûç',
      'AAAAEEEIIIOOOOUUUCaaaaeeeiiioooouuuc'
    )
  );
  _is_initial_stage := _folder ~ '(fiscal|vistoria|inspec|conferencia)';

  select * into _profile
  from public.profiles
  where id=public.current_profile_id()
  limit 1;

  select * into _existing
  from public.process_habite_se_inspections
  where process_id=_process_id
  for update;

  if _existing.id is null then
    if not _is_initial_stage then
      raise exception 'A vistoria ainda não foi iniciada na etapa própria do processo.';
    end if;

    insert into public.process_habite_se_inspections(
      tenant_id,municipality_id,process_id,status,checklist,notes,
      photo_evidence_waived,photo_waiver_reason,
      inspector_profile_id,inspector_user_id,inspector_name,
      inspected_at,updated_at
    )
    values(
      _process.tenant_id,coalesce(_process.municipality_id,_process.tenant_id),_process.id,
      'rascunho',coalesce(_checklist,'{}'::jsonb),nullif(btrim(coalesce(_notes,'')),''),
      coalesce(_photo_evidence_waived,false),
      nullif(btrim(coalesce(_photo_waiver_reason,'')),''),
      _profile.id,_profile.user_id,
      coalesce(nullif(btrim(_profile.full_name),''),nullif(btrim(_profile.email),''),'Responsável municipal'),
      clock_timestamp(),clock_timestamp()
    )
    returning * into _inspection;
  elsif _existing.completed_at is not null and not _is_initial_stage then
    -- Retificação após a etapa de vistoria: mantém autoria/data da vistoria original.
    update public.process_habite_se_inspections
       set checklist=coalesce(_checklist,'{}'::jsonb),
           notes=nullif(btrim(coalesce(_notes,'')),''),
           photo_evidence_waived=coalesce(_photo_evidence_waived,false),
           photo_waiver_reason=nullif(btrim(coalesce(_photo_waiver_reason,'')),''),
           updated_at=clock_timestamp()
     where id=_existing.id
     returning * into _inspection;

    insert into public.process_audit_entries(
      tenant_id,municipality_id,process_id,actor_user_id,actor_profile_id,
      category,title,detail,visible_to_external,created_at
    )
    values(
      _process.tenant_id,coalesce(_process.municipality_id,_process.tenant_id),_process_id,
      _profile.user_id,_profile.id,'vistoria',
      'Checklist do Habite-se retificado',
      'Checklist da vistoria retificado por '||
        coalesce(nullif(btrim(_profile.full_name),''),nullif(btrim(_profile.email),''),'responsável municipal')||
        '. A autoria, a data e o resultado formal da vistoria original foram preservados.',
      false,clock_timestamp()
    );
  else
    update public.process_habite_se_inspections
       set status='rascunho',
           checklist=coalesce(_checklist,'{}'::jsonb),
           notes=nullif(btrim(coalesce(_notes,'')),''),
           photo_evidence_waived=coalesce(_photo_evidence_waived,false),
           photo_waiver_reason=nullif(btrim(coalesce(_photo_waiver_reason,'')),''),
           inspector_profile_id=_profile.id,
           inspector_user_id=_profile.user_id,
           inspector_name=coalesce(nullif(btrim(_profile.full_name),''),nullif(btrim(_profile.email),''),'Responsável municipal'),
           completed_at=null,
           updated_at=clock_timestamp()
     where id=_existing.id
     returning * into _inspection;
  end if;

  return jsonb_build_object('inspection',to_jsonb(_inspection));
end;
$function$;

create or replace function public.get_habite_se_permit_v1(_process_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _permit public.process_habite_se_permits%rowtype;
  _process public.processes%rowtype;
  _inspection public.process_habite_se_inspections%rowtype;
  _draft jsonb := '{}'::jsonb;
  _defaults jsonb := '{}'::jsonb;
  _modality_raw text;
  _conditions text;
begin
  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  select * into _process
  from public.processes
  where id=_process_id;

  if _process.id is null then
    raise exception 'Processo não encontrado.';
  end if;

  select * into _permit
  from public.process_habite_se_permits
  where process_id=_process_id
  limit 1;

  select * into _inspection
  from public.process_habite_se_inspections
  where process_id=_process_id
  limit 1;

  _draft := coalesce(_process.preprotocol_payload->'draftForm','{}'::jsonb);
  _modality_raw := lower(btrim(coalesce(
    nullif(_draft->>'modalidadeHabiteSe',''),
    'integral'
  )));

  _conditions := case
    when _inspection.status='conforme' then 'Sem ressalvas registradas.'
    when nullif(btrim(coalesce(_inspection.notes,'')),'') is not null then btrim(_inspection.notes)
    else ''
  end;

  _defaults := jsonb_build_object(
    'observations','',
    'conditions',_conditions,
    'modality',case
      when _modality_raw like '%parcial%' then 'Habite-se parcial'
      else 'Habite-se integral'
    end,
    'sourceProcess',coalesce(nullif(btrim(_draft->>'processoAprovacao'),''),''),
    'sourcePermit',coalesce(nullif(btrim(_draft->>'numeroAlvara'),''),''),
    'completionDate',coalesce(nullif(btrim(_draft->>'dataConclusaoObra'),''),'')
  );

  return jsonb_build_object(
    'permit',case when _permit.id is null then null else to_jsonb(_permit) end,
    'defaults',_defaults,
    'can_manage',public.can_manage_habite_se_permit_v1(_process_id)
  );
end;
$function$;

revoke all on function public.can_manage_habite_se_inspection_v1(uuid) from public;
revoke all on function public.upsert_habite_se_inspection_v1(uuid,jsonb,text,boolean,text) from public;
revoke all on function public.get_habite_se_permit_v1(uuid) from public;

grant execute on function public.can_manage_habite_se_inspection_v1(uuid) to authenticated;
grant execute on function public.upsert_habite_se_inspection_v1(uuid,jsonb,text,boolean,text) to authenticated;
grant execute on function public.get_habite_se_permit_v1(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
