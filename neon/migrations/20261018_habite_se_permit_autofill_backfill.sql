-- SIGAPRO — preenchimento oficial e correção do número do Alvará de Habite-se.
-- O banco passa a ser a fonte de verdade dos campos automáticos do documento.

begin;

create or replace function private.habite_se_permit_defaults_v1(_process_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public','private'
set row_security to 'off'
as $function$
declare
  _process public.processes%rowtype;
  _inspection public.process_habite_se_inspections%rowtype;
  _draft jsonb := '{}'::jsonb;
  _modality_raw text;
  _conditions text;
begin
  select * into _process
  from public.processes
  where id=_process_id;

  if _process.id is null then
    return jsonb_build_object(
      'observations','',
      'conditions','',
      'modality','Habite-se integral',
      'sourceProcess','',
      'sourcePermit','',
      'completionDate',''
    );
  end if;

  select * into _inspection
  from public.process_habite_se_inspections
  where process_id=_process_id
  limit 1;

  _draft := coalesce(_process.preprotocol_payload->'draftForm','{}'::jsonb);
  _modality_raw := lower(btrim(coalesce(nullif(_draft->>'modalidadeHabiteSe',''),'integral')));

  _conditions := case
    when _inspection.status='conforme' then 'Sem ressalvas registradas.'
    when nullif(btrim(coalesce(_inspection.notes,'')),'') is not null then btrim(_inspection.notes)
    else ''
  end;

  return jsonb_build_object(
    'observations','',
    'conditions',_conditions,
    'modality',case when _modality_raw like '%parcial%' then 'Habite-se parcial' else 'Habite-se integral' end,
    'sourceProcess',coalesce(nullif(btrim(_draft->>'processoAprovacao'),''),''),
    'sourcePermit',coalesce(nullif(btrim(_draft->>'numeroAlvara'),''),''),
    'completionDate',coalesce(nullif(btrim(_draft->>'dataConclusaoObra'),''),'')
  );
end;
$function$;

create or replace function private.merge_habite_se_permit_form_v1(
  _defaults jsonb,
  _saved jsonb
)
returns jsonb
language sql
immutable
as $function$
  select jsonb_build_object(
    'observations',coalesce(nullif(btrim(coalesce(_saved->>'observations','')),''),coalesce(_defaults->>'observations','')),
    'conditions',coalesce(nullif(btrim(coalesce(_saved->>'conditions','')),''),coalesce(_defaults->>'conditions','')),
    'modality',coalesce(nullif(btrim(coalesce(_saved->>'modality','')),''),coalesce(_defaults->>'modality','Habite-se integral')),
    'sourceProcess',coalesce(nullif(btrim(coalesce(_saved->>'sourceProcess','')),''),coalesce(_defaults->>'sourceProcess','')),
    'sourcePermit',coalesce(nullif(btrim(coalesce(_saved->>'sourcePermit','')),''),coalesce(_defaults->>'sourcePermit','')),
    'completionDate',coalesce(nullif(btrim(coalesce(_saved->>'completionDate','')),''),coalesce(_defaults->>'completionDate',''))
  );
$function$;

create or replace function public.get_habite_se_permit_v1(_process_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public','private'
set row_security to 'off'
as $function$
declare
  _permit public.process_habite_se_permits%rowtype;
  _defaults jsonb;
  _permit_json jsonb;
begin
  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  _defaults := private.habite_se_permit_defaults_v1(_process_id);

  select * into _permit
  from public.process_habite_se_permits
  where process_id=_process_id
  limit 1;

  if _permit.id is not null then
    _permit_json := jsonb_set(
      to_jsonb(_permit),
      '{form_data}',
      private.merge_habite_se_permit_form_v1(
        _defaults,
        coalesce(_permit.form_data,'{}'::jsonb)
      ),
      true
    );
  end if;

  return jsonb_build_object(
    'permit',case when _permit.id is null then null else _permit_json end,
    'defaults',_defaults,
    'can_manage',public.can_manage_habite_se_permit_v1(_process_id)
  );
end;
$function$;

create or replace function public.save_habite_se_permit_v1(
  _process_id uuid,
  _form_data jsonb,
  _permit_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
set row_security to 'off'
as $function$
declare
  _profile public.profiles%rowtype;
  _process public.processes%rowtype;
  _permit public.process_habite_se_permits%rowtype;
  _number text;
  _protocol_year text;
  _protocol_sequence text;
  _defaults jsonb;
  _final_form jsonb;
begin
  if not public.can_manage_habite_se_permit_v1(_process_id) then
    raise exception 'Somente o Analista responsável pode elaborar ou retificar o Alvará de Habite-se.';
  end if;

  select * into _process
  from public.processes
  where id=_process_id
  for update;

  if _process.id is null then raise exception 'Processo não encontrado.'; end if;
  if lower(coalesce(_process.process_type,'')) not like '%habite%' then
    raise exception 'Este documento é exclusivo de processo de Habite-se.';
  end if;

  if not exists(
    select 1 from public.payment_guides g
    where g.process_id=_process_id
      and g.guide_kind='habite_se'
      and (coalesce(g.paid,false)=true or g.status in ('compensada','paid','confirmed'))
  ) then
    raise exception 'O Alvará de Habite-se só pode ser elaborado após a confirmação do pagamento.';
  end if;

  select * into _profile
  from public.profiles
  where id=public.current_profile_id();

  _defaults := private.habite_se_permit_defaults_v1(_process_id);
  _final_form := private.merge_habite_se_permit_form_v1(
    _defaults,
    coalesce(_form_data,'{}'::jsonb)
  );

  _protocol_year := substring(coalesce(_process.protocol_number,'') from '([0-9]{4})');
  _protocol_sequence := substring(coalesce(_process.protocol_number,'') from '([0-9]+)$');

  _number := nullif(btrim(coalesce(_permit_number,'')),'');
  if _number is null or _number !~ '^HAB-[0-9]{4}-[0-9]+$' then
    _number := 'HAB-'||
      coalesce(nullif(_protocol_year,''),extract(year from current_date)::int::text)||
      '-'||coalesce(nullif(_protocol_sequence,''),'00001');
  end if;

  insert into public.process_habite_se_permits(
    tenant_id,municipality_id,process_id,permit_number,status,form_data,
    analyst_profile_id,analyst_user_id,analyst_name,updated_at
  )
  values(
    _process.tenant_id,coalesce(_process.municipality_id,_process.tenant_id),
    _process.id,_number,'rascunho',_final_form,
    _profile.id,_profile.user_id,
    coalesce(nullif(btrim(_profile.full_name),''),nullif(btrim(_profile.email),''),'Analista Técnico'),
    clock_timestamp()
  )
  on conflict(process_id)
  do update set
    permit_number=excluded.permit_number,
    status='rascunho',
    form_data=excluded.form_data,
    analyst_profile_id=excluded.analyst_profile_id,
    analyst_user_id=excluded.analyst_user_id,
    analyst_name=excluded.analyst_name,
    director_profile_id=null,
    director_user_id=null,
    director_name=null,
    director_requested_at=null,
    issued_at=null,
    updated_at=clock_timestamp()
  where public.process_habite_se_permits.status <> 'emitido'
  returning * into _permit;

  if _permit.id is null then
    raise exception 'O Alvará de Habite-se já foi emitido e não pode ser sobrescrito.';
  end if;

  update public.processes
     set status='analise_tecnica'::public.process_status,
         current_department='Análise Urbanística',
         current_queue='Emissão do Alvará de Habite-se',
         sla_stage='Elaboração do Alvará de Habite-se',
         process_checkpoint='Pagamento do Habite-se confirmado — elaboração do Alvará',
         updated_at=clock_timestamp()
   where id=_process_id;

  insert into public.process_audit_entries(
    tenant_id,municipality_id,process_id,actor_user_id,actor_profile_id,
    category,title,detail,visible_to_external,created_at
  )
  values(
    _process.tenant_id,coalesce(_process.municipality_id,_process.tenant_id),_process_id,
    _profile.user_id,_profile.id,'habite_se',
    'Alvará de Habite-se salvo',
    'Rascunho '||_number||' salvo/retificado pelo Analista Técnico com os dados oficiais do protocolo reaproveitados automaticamente.',
    false,clock_timestamp()
  );

  return jsonb_build_object(
    'permit',to_jsonb(_permit),
    'defaults',_defaults,
    'can_manage',true
  );
end;
$function$;

-- Corrige somente rascunhos já existentes. Documentos emitidos nunca são reescritos.
with prepared as (
  select
    hp.id,
    p.protocol_number,
    private.habite_se_permit_defaults_v1(p.id) as defaults
  from public.process_habite_se_permits hp
  join public.processes p on p.id=hp.process_id
  where hp.status<>'emitido'
)
update public.process_habite_se_permits hp
set
  form_data=private.merge_habite_se_permit_form_v1(prepared.defaults,coalesce(hp.form_data,'{}'::jsonb)),
  permit_number='HAB-'||
    coalesce(nullif(substring(prepared.protocol_number from '([0-9]{4})'),''),extract(year from current_date)::int::text)||
    '-'||coalesce(nullif(substring(prepared.protocol_number from '([0-9]+)$'),''),'00001'),
  updated_at=clock_timestamp()
from prepared
where hp.id=prepared.id;

revoke all on function public.get_habite_se_permit_v1(uuid) from public;
revoke all on function public.save_habite_se_permit_v1(uuid,jsonb,text) from public;
grant execute on function public.get_habite_se_permit_v1(uuid) to authenticated;
grant execute on function public.save_habite_se_permit_v1(uuid,jsonb,text) to authenticated;

commit;

notify pgrst, 'reload schema';
