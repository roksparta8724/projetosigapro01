-- SIGAPRO 2026-11-10: real lifecycle protection discovered by Neon QA audit.
-- QA branch only; preserve production until formal review and controlled rollout.
-- NO UPDATE to existing municipal processes, permits, guides or historical rows.
-- The legacy Habite-se anomaly remains visible for supervised reconciliation.
-- DO NOT use role/GUC flags as a substitute for table privileges and RLS.
BEGIN;

CREATE OR REPLACE FUNCTION public.set_process_status(_process_id uuid, _status_text text, _detail text, _title text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _tenant_id uuid;
  _municipality_id uuid;
  _from_status public.process_status;
  _to_status public.process_status;
  _process_type text;
  _role text := lower(coalesce(public.current_role_code(),''));
  _movement public.process_movements%rowtype;
  _audit public.process_audit_entries%rowtype;
  _effective_title text;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  if nullif(btrim(_status_text),'') is null then
    raise exception 'Status obrigatorio';
  end if;

  if nullif(btrim(_detail),'') is null then
    raise exception 'Detalhe da alteracao e obrigatorio';
  end if;

  begin
    _to_status := btrim(_status_text)::public.process_status;
  exception when invalid_text_representation then
    raise exception 'Status de processo invalido';
  end;

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

  if _role in ('prefeitura_admin','admin_prefeitura','admin_municipality') then
    raise exception 'Administrador da Prefeitura possui acesso somente de leitura aos processos.';
  end if;

  if not (public.is_master() or public.is_internal_municipality_role()) then
    raise exception 'Sem permissao para alterar status do processo';
  end if;

  -- Generic status updates cannot reverse a final archived decision: use
  -- reopen_process with a mandatory reason and complete audit trail.
  if _from_status='arquivado'::public.process_status then
    if _to_status<>'arquivado'::public.process_status then
      raise exception 'Processo arquivado somente pode mudar de estado pela reabertura formal auditada.';
    end if;
  end if;

  if _from_status=_to_status then
    return jsonb_build_object(
      'process_id',_process_id,
      'from_status',_from_status::text,
      'to_status',_to_status::text,
      'already_current',true
    );
  end if;

  -- An issued Habite-se cannot be declared completed by a generic
  -- status update: use the signed-PDF + paid-guide atomic RPC.
  if _to_status='arquivado'::public.process_status
     and lower(coalesce(_process_type,'')) ~ '(habite[- ]?se|ocupacao|ocupação)' then
    raise exception 'Use complete_habite_se_process_v1 para concluir o Habite-se com Alvará assinado, guia válida e auditoria atômica.';
  end if;

  _effective_title := coalesce(nullif(btrim(_title),''),'Status atualizado');

  update public.processes
     set status=_to_status,
         current_department=
           case
             when _to_status='analise_tecnica'::public.process_status then 'Análise Urbanística'
             when _to_status='deferido'::public.process_status then 'Processo concluído'
             when _to_status='arquivado'::public.process_status
                  and lower(coalesce(_process_type,'')) ~ '(habite[- ]?se|ocupacao|ocupação)'
               then 'Processo concluído'
             else current_department
           end,
         current_queue=
           case
             when _to_status='analise_tecnica'::public.process_status then 'Análise Urbanística'
             when _to_status='deferido'::public.process_status then 'Concluído'
             when _to_status='arquivado'::public.process_status
                  and lower(coalesce(_process_type,'')) ~ '(habite[- ]?se|ocupacao|ocupação)'
               then 'Habite-se concluído e arquivado'
             else current_queue
           end,
         sla_stage=
           case
             when _to_status='analise_tecnica'::public.process_status then 'Análise Urbanística'
             when _to_status='arquivado'::public.process_status
                  and lower(coalesce(_process_type,'')) ~ '(habite[- ]?se|ocupacao|ocupação)'
               then 'Concluído'
             else replace(_to_status::text,'_',' ')
           end,
         process_checkpoint=
           case
             when _to_status='arquivado'::public.process_status
                  and lower(coalesce(_process_type,'')) ~ '(habite[- ]?se|ocupacao|ocupação)'
               then 'Processo de Habite-se concluído administrativamente'
             else process_checkpoint
           end,
         archived_at=
           case
             when _to_status='arquivado'::public.process_status
               then coalesce(archived_at,now())
             else archived_at
           end,
         sla_breached=false,
         updated_at=now()
   where id=_process_id;

  insert into public.process_movements(
    tenant_id,process_id,actor_user_id,movement_type,
    from_status,to_status,description,created_at,
    visible_to_external,municipality_id,actor_profile_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,
    case
      when _to_status='arquivado'::public.process_status
           and lower(coalesce(_process_type,'')) ~ '(habite[- ]?se|ocupacao|ocupação)'
        then 'habite_se_completed'
      else 'status_change'
    end,
    _from_status,_to_status,btrim(_detail),now(),
    true,_municipality_id,_profile_id
  )
  returning * into _movement;

  insert into public.process_audit_entries(
    tenant_id,process_id,actor_user_id,category,title,detail,
    visible_to_external,created_at,municipality_id,actor_profile_id
  )
  values(
    _tenant_id,_process_id,_legacy_user_id,
    case
      when _to_status='arquivado'::public.process_status
           and lower(coalesce(_process_type,'')) ~ '(habite[- ]?se|ocupacao|ocupação)'
        then 'habite_se'
      else 'status'
    end,
    _effective_title,btrim(_detail),
    true,now(),_municipality_id,_profile_id
  )
  returning * into _audit;

  return jsonb_build_object(
    'process_id',_process_id,
    'from_status',_from_status::text,
    'to_status',_to_status::text,
    'movement',to_jsonb(_movement),
    'audit',to_jsonb(_audit)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.reopen_process(_process_id uuid, _reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
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

  if _role in ('prefeitura_admin','admin_prefeitura','admin_municipality') then
    raise exception 'Administrador da Prefeitura possui acesso somente de leitura aos processos.';
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
        'prefeitura_supervisor',
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

  -- Transaction-local marker is checked by the archived-row trigger.
  -- The RPC itself enforces identity, municipality, reason, row lock and audit.
  perform set_config('sigapro.authorized_reopen_process',_process_id::text,true);
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
  perform set_config('sigapro.authorized_reopen_process','',true);

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

CREATE OR REPLACE FUNCTION public.guard_archived_process_transition_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'pg_catalog','public'
AS $function$
BEGIN
  IF OLD.status='arquivado'::public.process_status THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status<>'reapresentacao'::public.process_status
         OR current_setting('sigapro.authorized_reopen_process',true)
              IS DISTINCT FROM OLD.id::text
         OR public.current_profile_id() IS NULL
         OR lower(coalesce(public.current_role_code(),'')) IN
              ('prefeitura_admin','admin_prefeitura','admin_municipality')
      THEN
        RAISE EXCEPTION USING ERRCODE='42501',
          MESSAGE='Processo arquivado: somente reabertura formal e auditada pode alterar o status.';
      END IF;
      IF NEW.archived_at IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE='23514',
          MESSAGE='Reabertura formal deve remover o carimbo de arquivamento.';
      END IF;
    ELSIF NEW.archived_at IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514',
        MESSAGE='Processo arquivado não pode perder o carimbo de arquivamento.';
    END IF;
  END IF;
  IF NEW.status='arquivado'::public.process_status
     AND NEW.archived_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='Status arquivado exige data/hora de arquivamento.';
  END IF;
  RETURN NEW;
END;
$function$;

DO $create_archive_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='public.processes'::regclass
      AND tgname='trg_guard_archived_process_transition_v1'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_guard_archived_process_transition_v1
    BEFORE UPDATE OF status,archived_at ON public.processes
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_archived_process_transition_v1();
  END IF;
END;
$create_archive_guard$;

COMMIT;
