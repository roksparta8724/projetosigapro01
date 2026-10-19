-- SIGAPRO — reabertura segura de processo concluído.
-- No Habite-se, somente o Analista responsável, Diretoria/Administração ou Master podem reabrir.
-- A reabertura retira archived_at para que o processo volte imediatamente às filas ativas.

create or replace function public.reopen_process(_process_id uuid, _reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
set row_security to 'off'
as $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _tenant_id uuid;
  _municipality_id uuid;
  _from_status public.process_status;
  _process_type text;
  _role text := lower(coalesce(public.current_role_code(),''));
  _authorized boolean := false;
  _reopen public.process_reopen_history%rowtype;
  _movement public.process_movements%rowtype;
  _audit public.process_audit_entries%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if nullif(btrim(_reason),'') is null then
    raise exception 'Motivo da reabertura e obrigatorio';
  end if;

  select p.tenant_id,p.municipality_id,p.status,p.process_type
    into _tenant_id,_municipality_id,_from_status,_process_type
  from public.processes p
  where p.id=_process_id
  for update;

  if _tenant_id is null then
    raise exception 'Processo nao encontrado';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  if lower(coalesce(_process_type,'')) ~ '(habite[- ]?se|ocupacao|ocupação)' then
    _authorized :=
      public.can_manage_habite_se_permit_v1(_process_id)
      or public.is_master()
      or _role in (
        'prefeitura_admin','prefeitura_supervisor',
        'diretor','director','prefeitura_diretor','prefeitura_diretora'
      );
  else
    _authorized := public.is_master() or public.is_internal_municipality_role();
  end if;

  if not _authorized then
    raise exception 'Sem permissao para reabrir processo';
  end if;

  if _from_status='reapresentacao'::public.process_status then
    return jsonb_build_object(
      'process_id',_process_id,
      'from_status',_from_status::text,
      'to_status','reapresentacao',
      'already_reopened',true
    );
  end if;

  update public.processes
     set status='reapresentacao'::public.process_status,
         current_department=
           case
             when lower(coalesce(_process_type,'')) ~ '(habite[- ]?se|ocupacao|ocupação)'
               then 'Análise Urbanística'
             else current_department
           end,
         current_queue=
           case
             when lower(coalesce(_process_type,'')) ~ '(habite[- ]?se|ocupacao|ocupação)'
               then 'Habite-se reaberto para reapresentação'
             else current_queue
           end,
         sla_stage='Reapresentação',
         process_checkpoint=
           case
             when lower(coalesce(_process_type,'')) ~ '(habite[- ]?se|ocupacao|ocupação)'
               then 'Processo de Habite-se reaberto administrativamente'
             else process_checkpoint
           end,
         archived_at=null,
         sla_breached=false,
         updated_at=now()
   where id=_process_id;

  insert into public.process_reopen_history(
    tenant_id,process_id,actor_user_id,reason,created_at,
    municipality_id,actor_profile_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,btrim(_reason),now(),
    _municipality_id,_profile_id
  )
  returning * into _reopen;

  insert into public.process_movements(
    tenant_id,process_id,actor_user_id,movement_type,
    from_status,to_status,description,created_at,
    visible_to_external,municipality_id,actor_profile_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,'reopen',
    _from_status,'reapresentacao'::public.process_status,
    btrim(_reason),now(),true,_municipality_id,_profile_id
  )
  returning * into _movement;

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,category,title,detail,
    visible_to_external,created_at,municipality_id,actor_profile_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,'status','Processo reaberto',
    btrim(_reason),true,now(),_municipality_id,_profile_id
  )
  returning * into _audit;

  return jsonb_build_object(
    'process_id',_process_id,
    'from_status',_from_status::text,
    'to_status','reapresentacao',
    'already_reopened',false,
    'reopen',to_jsonb(_reopen),
    'movement',to_jsonb(_movement),
    'audit',to_jsonb(_audit)
  );
end;
$function$;

notify pgrst, 'reload schema';
