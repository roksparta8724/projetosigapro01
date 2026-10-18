-- SIGAPRO — Termo de Vistoria / Conferência do Habite-se com evidência fotográfica.
-- Referência operacional: inspeção estruturada, trilha de auditoria e fotos privadas no R2.
-- A exigência fotográfica é regra interna do workflow SIGAPRO e pode ser dispensada com justificativa auditável.

create table if not exists public.process_habite_se_inspections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  municipality_id uuid,
  process_id uuid not null references public.processes(id) on delete cascade,
  status text not null default 'rascunho'
    check (status in ('rascunho','conforme','pendencias')),
  checklist jsonb not null default '{}'::jsonb,
  notes text,
  photo_evidence_waived boolean not null default false,
  photo_waiver_reason text,
  inspector_profile_id uuid,
  inspector_user_id uuid,
  inspector_name text,
  inspected_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(process_id)
);

create index if not exists idx_process_habite_se_inspections_process
  on public.process_habite_se_inspections(process_id,updated_at desc);

create table if not exists public.process_habite_se_inspection_photos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  municipality_id uuid,
  process_id uuid not null references public.processes(id) on delete cascade,
  inspection_id uuid not null references public.process_habite_se_inspections(id) on delete cascade,
  category text not null
    check (category in ('fachada','implantacao','habitabilidade','acessibilidade','externa','divergencia','outros')),
  object_key text not null,
  file_name text not null,
  mime_type text,
  file_size_bytes bigint,
  caption text,
  uploaded_by_profile_id uuid,
  uploaded_by_user_id uuid,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_process_habite_se_inspection_photos_inspection
  on public.process_habite_se_inspection_photos(inspection_id,created_at);

revoke all on public.process_habite_se_inspections from public;
revoke all on public.process_habite_se_inspection_photos from public;

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
  _process_municipality uuid;
  _folder text;
begin
  if public.is_master() then return true; end if;
  if _profile_id is null then return false; end if;

  if _role not in ('fiscal','prefeitura_supervisor') then
    return false;
  end if;

  select p.municipality_id into _profile_municipality
  from public.profiles p
  where p.id=_profile_id
    and p.deleted_at is null
    and p.account_status='active';

  select coalesce(pr.municipality_id,pr.tenant_id),
         lower(
           translate(
             coalesce(nullif(btrim(pr.current_department),''),nullif(btrim(pr.current_queue),''),''),
             'ÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇáàâãéèêíìîóòôõúùûç',
             'AAAAEEEIIIOOOOUUUCaaaaeeeiiioooouuuc'
           )
         )
    into _process_municipality,_folder
  from public.processes pr
  where pr.id=_process_id;

  return _process_municipality is not null
    and _profile_municipality is not distinct from _process_municipality
    and _folder ~ '(fiscal|vistoria|inspec|conferencia)';
end;
$function$;

create or replace function public.get_habite_se_inspection_v1(_process_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _inspection public.process_habite_se_inspections%rowtype;
  _photos jsonb := '[]'::jsonb;
begin
  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  select * into _inspection
  from public.process_habite_se_inspections i
  where i.process_id=_process_id
  limit 1;

  if _inspection.id is not null then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',p.id,
          'category',p.category,
          'object_key',p.object_key,
          'file_name',p.file_name,
          'mime_type',p.mime_type,
          'file_size_bytes',p.file_size_bytes,
          'caption',p.caption,
          'created_at',p.created_at
        )
        order by p.created_at
      ),
      '[]'::jsonb
    )
    into _photos
    from public.process_habite_se_inspection_photos p
    where p.inspection_id=_inspection.id;
  end if;

  return jsonb_build_object(
    'inspection',case when _inspection.id is null then null else to_jsonb(_inspection) end,
    'photos',_photos,
    'can_manage',public.can_manage_habite_se_inspection_v1(_process_id)
  );
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
  _folder text;
begin
  if not public.can_manage_habite_se_inspection_v1(_process_id) then
    raise exception 'Somente a Fiscalização responsável pode registrar a vistoria do Habite-se.';
  end if;

  select * into _process from public.processes where id=_process_id for update;
  if _process.id is null then raise exception 'Processo não encontrado.'; end if;
  if lower(coalesce(_process.process_type,'')) not like '%habite%' then
    raise exception 'Este termo de vistoria é exclusivo do processo de Habite-se.';
  end if;

  select * into _profile
  from public.profiles
  where id=public.current_profile_id()
  limit 1;

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
    coalesce(nullif(btrim(_profile.full_name),''),nullif(btrim(_profile.email),''),'Fiscal responsável'),
    clock_timestamp(),clock_timestamp()
  )
  on conflict (process_id)
  do update set
    status='rascunho',
    checklist=excluded.checklist,
    notes=excluded.notes,
    photo_evidence_waived=excluded.photo_evidence_waived,
    photo_waiver_reason=excluded.photo_waiver_reason,
    inspector_profile_id=excluded.inspector_profile_id,
    inspector_user_id=excluded.inspector_user_id,
    inspector_name=excluded.inspector_name,
    completed_at=null,
    updated_at=clock_timestamp()
  returning * into _inspection;

  return jsonb_build_object('inspection',to_jsonb(_inspection));
end;
$function$;

create or replace function public.add_habite_se_inspection_photo_v1(
  _process_id uuid,
  _inspection_id uuid,
  _category text,
  _object_key text,
  _file_name text,
  _mime_type text default null,
  _file_size_bytes bigint default null,
  _caption text default null
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
  _photo public.process_habite_se_inspection_photos%rowtype;
  _category_normalized text := lower(btrim(coalesce(_category,'')));
begin
  if not public.can_manage_habite_se_inspection_v1(_process_id) then
    raise exception 'Sem permissão para anexar evidência da vistoria.';
  end if;

  if _category_normalized not in ('fachada','implantacao','habitabilidade','acessibilidade','externa','divergencia','outros') then
    raise exception 'Categoria de evidência fotográfica inválida.';
  end if;

  if nullif(btrim(coalesce(_object_key,'')),'') is null then
    raise exception 'Arquivo da evidência inválido.';
  end if;

  select * into _inspection
  from public.process_habite_se_inspections
  where id=_inspection_id and process_id=_process_id
  for update;

  if _inspection.id is null then
    raise exception 'Termo de vistoria não encontrado.';
  end if;

  select * into _process from public.processes where id=_process_id;
  select * into _profile from public.profiles where id=public.current_profile_id();

  insert into public.process_habite_se_inspection_photos(
    tenant_id,municipality_id,process_id,inspection_id,category,object_key,
    file_name,mime_type,file_size_bytes,caption,
    uploaded_by_profile_id,uploaded_by_user_id
  )
  values(
    _process.tenant_id,coalesce(_process.municipality_id,_process.tenant_id),
    _process_id,_inspection_id,_category_normalized,btrim(_object_key),
    coalesce(nullif(btrim(coalesce(_file_name,'')),''),'evidencia.jpg'),
    nullif(btrim(coalesce(_mime_type,'')),''),
    _file_size_bytes,
    nullif(btrim(coalesce(_caption,'')),''),
    _profile.id,_profile.user_id
  )
  returning * into _photo;

  update public.process_habite_se_inspections
     set updated_at=clock_timestamp()
   where id=_inspection_id;

  return jsonb_build_object('photo',to_jsonb(_photo));
end;
$function$;

create or replace function public.remove_habite_se_inspection_photo_v1(
  _process_id uuid,
  _photo_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
set row_security to 'off'
as $function$
declare
  _photo public.process_habite_se_inspection_photos%rowtype;
begin
  if not public.can_manage_habite_se_inspection_v1(_process_id) then
    raise exception 'Sem permissão para remover evidência da vistoria.';
  end if;

  delete from public.process_habite_se_inspection_photos p
  where p.id=_photo_id and p.process_id=_process_id
  returning * into _photo;

  if _photo.id is null then raise exception 'Evidência não encontrada.'; end if;

  return jsonb_build_object('photo',to_jsonb(_photo));
end;
$function$;

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
    raise exception 'Somente a Fiscalização responsável pode concluir a vistoria do Habite-se.';
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

  if not coalesce(_photo_evidence_waived,false) then
    if _result_normalized='conforme' and _photo_count < 3 then
      raise exception 'Anexe ao menos 3 evidências fotográficas da vistoria ou registre uma justificativa formal de dispensa.';
    end if;
    if _result_normalized='pendencias' and _photo_count < 1 then
      raise exception 'Anexe ao menos uma foto da pendência constatada ou registre uma justificativa formal de dispensa.';
    end if;
  elsif _waiver_reason is null or length(_waiver_reason) < 15 then
    raise exception 'A dispensa de evidência fotográfica exige justificativa formal.';
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

grant execute on function public.can_manage_habite_se_inspection_v1(uuid) to authenticated;
grant execute on function public.get_habite_se_inspection_v1(uuid) to authenticated;
grant execute on function public.upsert_habite_se_inspection_v1(uuid,jsonb,text,boolean,text) to authenticated;
grant execute on function public.add_habite_se_inspection_photo_v1(uuid,uuid,text,text,text,text,bigint,text) to authenticated;
grant execute on function public.remove_habite_se_inspection_photo_v1(uuid,uuid) to authenticated;
grant execute on function public.complete_habite_se_inspection_v1(uuid,text,jsonb,text,boolean,text) to authenticated;

notify pgrst, 'reload schema';
