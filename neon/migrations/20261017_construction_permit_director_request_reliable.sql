-- SIGAPRO: solicitação confiável de assinatura eletrônica do Diretor.
-- A tela não depende da lista de usuários já hidratada no navegador.
-- O banco valida a Diretoria ativa da própria Prefeitura e cria aviso direcionado.

create or replace function public.request_construction_permit_director_signature_v1(
  _process_id uuid
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
  _role text;
  _row public.process_construction_permits%rowtype;
  _director_count integer := 0;
  _director_name text := '';
begin
  select * into _profile
  from public.profiles
  where id=public.current_profile_id()
    and deleted_at is null
    and account_status='active';

  select * into _process
  from public.processes
  where id=_process_id;

  if _profile.id is null or _process.id is null or not public.has_process_access(_process.id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  _role := lower(coalesce(public.current_role_code(), _profile.role, ''));

  if not public.is_master() and _role not in ('analista','analyst') then
    raise exception 'Somente o Analista Técnico responsável pode solicitar a assinatura da Diretoria.';
  end if;

  if not public.is_master()
     and _process.analysis_assigned_to_profile_id is not null
     and _process.analysis_assigned_to_profile_id is distinct from _profile.id then
    raise exception 'Somente o Analista responsável por este processo pode solicitar a assinatura da Diretoria.';
  end if;

  select count(*), min(p.full_name)
    into _director_count,_director_name
  from public.profiles p
  where p.deleted_at is null
    and p.account_status='active'
    and p.municipality_id=coalesce(_process.municipality_id,_process.tenant_id)
    and p.role='prefeitura_supervisor'
    and public.profile_operational_area(p.id)='analise'
    and exists (
      select 1
      from public.tenant_memberships tm
      where tm.profile_id=p.id
        and tm.tenant_id=coalesce(_process.municipality_id,_process.tenant_id)
        and tm.is_active=true
        and tm.deleted_at is null
        and (
          lower(coalesce(tm.position_title,'')) like '%diretor%'
          or lower(coalesce(tm.profile_label,'')) like '%diretor%'
        )
    );

  if _director_count=0 then
    raise exception 'Nenhum Diretor ativo de Urbanismo/Obras foi localizado no banco oficial desta Prefeitura.';
  end if;

  select * into _row
  from public.process_construction_permits
  where process_id=_process_id
  for update;

  if _row.id is null then
    raise exception 'Salve primeiro o preenchimento do Alvará.';
  end if;

  update public.process_construction_permits
  set status='awaiting_director',
      signature_mode='electronic',
      director_requested_at=clock_timestamp(),
      director_requested_by_profile_id=_profile.id,
      manual_pdf_prepared_at=null,
      manual_pdf_prepared_by_profile_id=null,
      updated_at=clock_timestamp()
  where id=_row.id
  returning * into _row;

  insert into public.process_audit_entries(
    tenant_id, municipality_id, process_id,
    actor_user_id, actor_profile_id,
    category, title, detail, visible_to_external, created_at
  )
  values(
    _process.tenant_id, _process.municipality_id, _process.id,
    _profile.user_id, _profile.id,
    'assinatura',
    'Assinatura do Alvará solicitada à Diretoria',
    concat(
      'Alvará ', _row.permit_number,
      ' encaminhado pelo Analista ',
      coalesce(nullif(btrim(_profile.full_name),''),_profile.email),
      ' para assinatura eletrônica da Diretoria.'
    ),
    false,
    clock_timestamp()
  );

  -- Aviso individual para cada Diretor ativo elegível.
  insert into public.notifications(
    profile_id,title,message,type,is_read,created_at
  )
  select
    p.id,
    'Alvará aguardando sua assinatura',
    concat(
      'O Alvará ',_row.permit_number,
      ' do processo ',_process.protocol_number,
      ' foi encaminhado pelo Analista para assinatura eletrônica.'
    ),
    'assinatura',
    false,
    clock_timestamp()
  from public.profiles p
  where p.deleted_at is null
    and p.account_status='active'
    and p.municipality_id=coalesce(_process.municipality_id,_process.tenant_id)
    and p.role='prefeitura_supervisor'
    and public.profile_operational_area(p.id)='analise'
    and exists (
      select 1
      from public.tenant_memberships tm
      where tm.profile_id=p.id
        and tm.tenant_id=coalesce(_process.municipality_id,_process.tenant_id)
        and tm.is_active=true
        and tm.deleted_at is null
        and (
          lower(coalesce(tm.position_title,'')) like '%diretor%'
          or lower(coalesce(tm.profile_label,'')) like '%diretor%'
        )
    );

  return jsonb_build_object(
    'ok',true,
    'director_count',_director_count,
    'director_name',_director_name,
    'permit',jsonb_build_object(
      'id',_row.id,
      'process_id',_row.process_id,
      'municipality_id',_row.municipality_id,
      'permit_number',_row.permit_number,
      'form_data',_row.form_data,
      'status',_row.status,
      'signature_mode',_row.signature_mode,
      'director_requested_at',_row.director_requested_at,
      'director_requested_by_profile_id',_row.director_requested_by_profile_id,
      'manual_pdf_prepared_at',_row.manual_pdf_prepared_at,
      'created_at',_row.created_at,
      'updated_at',_row.updated_at
    )
  );
end;
$function$;

grant execute on function public.request_construction_permit_director_signature_v1(uuid) to authenticated;
