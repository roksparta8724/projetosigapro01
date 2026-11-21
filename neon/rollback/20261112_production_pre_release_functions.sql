-- SIGAPRO production release rollback reference 2026-11-12.
-- ORIGINAL function definitions from Neon PRODUCTION before any cutover.
-- WARNING: only run after a coordinated Vercel rollback, in a maintenance window.
-- Does not delete customer data, payments, documents, or PostGIS tables.
-- The original versions of newly added procedures may remain installed safely.
-- Verify live data and grants before applying. Do not execute automatically.
BEGIN;

DROP TRIGGER IF EXISTS "trg_guard_archived_process_transition_v1" ON public.processes;
DROP TRIGGER IF EXISTS "municipal_admin_process_readonly_v1" ON public.calculation_snapshots;
DROP TRIGGER IF EXISTS "municipal_admin_process_readonly_v1" ON public.integration_sync_runs;
DROP TRIGGER IF EXISTS "municipal_admin_process_readonly_v1" ON public.notifications;
DROP TRIGGER IF EXISTS "municipal_admin_process_readonly_v1" ON public.process_analysis_sheets;
DROP TRIGGER IF EXISTS "municipal_admin_process_readonly_v1" ON public.process_artifact_withdrawal_events;
DROP TRIGGER IF EXISTS "municipal_admin_process_readonly_v1" ON public.process_artifact_withdrawals;
DROP TRIGGER IF EXISTS "municipal_admin_process_readonly_v1" ON public.process_construction_permits;
DROP TRIGGER IF EXISTS "municipal_admin_process_readonly_v1" ON public.process_habite_se_inspection_photos;
DROP TRIGGER IF EXISTS "municipal_admin_process_readonly_v1" ON public.process_habite_se_inspections;
DROP TRIGGER IF EXISTS "municipal_admin_process_readonly_v1" ON public.process_habite_se_permits;
DROP TRIGGER IF EXISTS "municipal_admin_process_readonly_v1" ON public.process_markers;
DROP TRIGGER IF EXISTS "municipal_admin_process_readonly_v1" ON public.process_parties;
DROP TRIGGER IF EXISTS "municipal_admin_process_readonly_v1" ON public.process_party_private_data;
DROP TRIGGER IF EXISTS "municipal_admin_process_readonly_v1" ON public.process_reopen_history;
DROP TRIGGER IF EXISTS "municipal_admin_process_readonly_v1" ON public.process_signature_requests;
DROP TRIGGER IF EXISTS "municipal_admin_process_readonly_v1" ON public.process_urban_precheck_runs;
DROP TRIGGER IF EXISTS "municipal_admin_process_readonly_v1" ON public.profile_process_archives;
DROP TRIGGER IF EXISTS "municipal_admin_process_readonly_v1" ON public.signature_blocks;

CREATE OR REPLACE FUNCTION public.authorize_payment_guide_original_read_v1(_guide_id uuid, _municipality_id uuid, _process_id uuid, _object_key text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE g public.payment_guides;
BEGIN
 IF public.current_profile_id() IS NULL THEN RETURN false; END IF;
 SELECT * INTO STRICT g FROM public.payment_guides
  WHERE id=_guide_id AND municipality_id=_municipality_id AND process_id=_process_id;
 IF NOT (public.is_master() OR (public.has_tenant_access(g.municipality_id) AND public.has_process_access(g.process_id))) THEN
  RETURN false;
 END IF;
 RETURN g.original_pdf_key IS NOT NULL AND g.original_pdf_key = _object_key;
END $function$

CREATE OR REPLACE FUNCTION public.complete_habite_se_process_v1(_process_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _process public.processes%rowtype;
  _permit public.process_habite_se_permits%rowtype;
  _profile public.profiles%rowtype;
  _role text;
  _position text;
  _authorized boolean := false;
begin
  select * into _profile
  from public.profiles
  where id=public.current_profile_id()
    and deleted_at is null
    and account_status='active';

  if _profile.id is null then
    raise exception 'Perfil autenticado inválido.';
  end if;

  select * into _process
  from public.processes
  where id=_process_id
  for update;

  if _process.id is null or not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo.';
  end if;

  select * into _permit
  from public.process_habite_se_permits
  where process_id=_process_id
  for update;

  if _permit.id is null or _permit.status <> 'emitido' then
    raise exception 'O processo só pode ser concluído após a emissão válida do Alvará de Habite-se.';
  end if;

  _role := lower(coalesce(public.current_role_code(),_profile.role,''));

  select coalesce(
      nullif(btrim(tm.position_title),''),
      nullif(btrim(tm.profile_label),''),
      nullif(btrim(r.label),'')
    )
    into _position
  from public.tenant_memberships tm
  left join public.roles r on r.id=tm.role_id
  where tm.profile_id=_profile.id
    and tm.tenant_id=_process.tenant_id
    and tm.is_active=true
    and tm.deleted_at is null
  order by tm.updated_at desc nulls last, tm.created_at desc nulls last
  limit 1;

  _authorized :=
    public.can_manage_habite_se_permit_v1(_process_id)
    or _role in ('master_admin','master_ops','prefeitura_admin','prefeitura_supervisor','diretor','director','prefeitura_diretor','prefeitura_diretora')
    or lower(coalesce(_position,'')) ~ '(diretor|diretora)';

  if not _authorized then
    raise exception 'Somente o Analista responsável, a Diretoria ou a Administração pode concluir este processo.';
  end if;

  if _process.status='arquivado'::public.process_status then
    return jsonb_build_object(
      'ok',true,
      'already_completed',true,
      'process_id',_process.id,
      'status',_process.status::text
    );
  end if;

  update public.processes
     set status='arquivado'::public.process_status,
         current_department='Processo concluído',
         current_queue='Habite-se concluído e arquivado',
         sla_stage='Concluído',
         process_checkpoint='Processo de Habite-se concluído administrativamente',
         archived_at=coalesce(archived_at,clock_timestamp()),
         sla_breached=false,
         updated_at=clock_timestamp()
   where id=_process_id;

  insert into public.process_movements(
    tenant_id,process_id,actor_user_id,actor_profile_id,movement_type,
    from_status,to_status,description,visible_to_external,municipality_id,created_at
  )
  values(
    _process.tenant_id,_process.id,_profile.user_id,_profile.id,
    'habite_se_completed',
    _process.status,
    'arquivado'::public.process_status,
    'Processo de Habite-se concluído administrativamente após emissão e assinatura válida da Diretoria.',
    true,
    coalesce(_process.municipality_id,_process.tenant_id),
    clock_timestamp()
  );

  insert into public.process_audit_entries(
    tenant_id,municipality_id,process_id,actor_user_id,actor_profile_id,
    category,title,detail,visible_to_external,created_at
  )
  values(
    _process.tenant_id,
    coalesce(_process.municipality_id,_process.tenant_id),
    _process.id,
    _profile.user_id,
    _profile.id,
    'habite_se',
    'Processo de Habite-se concluído',
    'Conclusão administrativa registrada por '||coalesce(_profile.full_name,_profile.email,'usuário autorizado')||'.',
    true,
    clock_timestamp()
  );

  return jsonb_build_object(
    'ok',true,
    'already_completed',false,
    'process_id',_process.id,
    'status','arquivado'
  );
end;
$function$

CREATE OR REPLACE FUNCTION public.confirm_preprotocol_payment_v1(_process_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _profile_id uuid := public.current_profile_id();
  _profile_municipality uuid;
  _role_code text := coalesce(public.current_role_code(),'');
  _area text;
  _process public.processes%rowtype;
  _guide public.payment_guides%rowtype;
begin
  select p.municipality_id
    into _profile_municipality
  from public.profiles p
  where p.id=_profile_id
    and p.deleted_at is null
    and p.account_status='active';

  if _profile_id is null or _profile_municipality is null then
    raise exception 'Perfil municipal ativo nao encontrado';
  end if;

  _area := public.profile_operational_area(_profile_id);

  if not (
    public.is_master()
    or _role_code in ('prefeitura_admin','admin_municipality','admin_prefeitura','setor_intersetorial','counter_service')
    or _area='protocolos'
  ) then
    raise exception 'A baixa da guia inicial pertence ao Setor de Protocolo';
  end if;

  select * into _process
  from public.processes p
  where p.id=_process_id
  for update;

  if _process.id is null then
    raise exception 'Pre-protocolo nao encontrado';
  end if;

  if coalesce(_process.municipality_id,_process.tenant_id) <> _profile_municipality
     and not public.is_master() then
    raise exception 'O pre-protocolo pertence a outra Prefeitura';
  end if;

  if _process.officialized_at is not null then
    return jsonb_build_object(
      'ok',true,
      'already_official',true,
      'process_id',_process.id,
      'protocol_number',_process.protocol_number,
      'pre_protocol_number',_process.pre_protocol_number,
      'officialized_at',_process.officialized_at
    );
  end if;

  select * into _guide
  from public.payment_guides g
  where g.process_id=_process.id
    and g.guide_kind='protocolo'
  order by g.created_at desc
  limit 1
  for update;

  if _guide.id is null then
    raise exception 'Guia inicial nao encontrada';
  end if;

  if coalesce(_guide.paid,false)
     or lower(coalesce(_guide.status,'')) in ('compensada','confirmed','paid','pago','confirmado') then
    perform public.officialize_preprotocol_v1(_process.id,_guide.id);
  else
    update public.payment_guides
       set paid=true,
           paid_at=now(),
           status='compensada'
     where id=_guide.id
     returning * into _guide;
    -- O trigger aaa_officialize_preprotocol_after_payment_v1 oficializa
    -- o processo dentro da mesma transacao.
  end if;

  select * into _process
  from public.processes p
  where p.id=_process_id;

  return jsonb_build_object(
    'ok',true,
    'already_official',false,
    'process_id',_process.id,
    'protocol_number',_process.protocol_number,
    'pre_protocol_number',_process.pre_protocol_number,
    'officialized_at',_process.officialized_at,
    'guide_number',_guide.guide_number
  );
end;
$function$

CREATE OR REPLACE FUNCTION public.confirm_process_payment_guide(_process_id uuid, _guide_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  _profile_id uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _role_code text := public.current_role_code();
  _tenant_id uuid;
  _municipality_id uuid;
  _from_status public.process_status;
  _triage_status text;
  _to_status public.process_status;
  _guide public.payment_guides%rowtype;
  _movement public.process_movements%rowtype;
  _audit public.process_audit_entries%rowtype;
  _audit_category text;
BEGIN
  IF _profile_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado ou sem perfil';
  END IF;

  IF _guide_kind NOT IN ('protocolo','iss_obra','aprovacao_final','habite_se') THEN
    RAISE EXCEPTION 'Tipo de guia invalido';
  END IF;

  SELECT p.tenant_id,p.municipality_id,p.status,p.triage_status
    INTO _tenant_id,_municipality_id,_from_status,_triage_status
  FROM public.processes p
  WHERE p.id=_process_id
  FOR UPDATE;

  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'Processo nao encontrado';
  END IF;

  IF NOT public.has_process_access(_process_id) THEN
    RAISE EXCEPTION 'Sem acesso ao processo';
  END IF;

  IF _guide_kind='protocolo' THEN
    IF NOT (
      public.is_master()
      OR _role_code='prefeitura_admin'
      OR _role_code='setor_intersetorial'
    ) THEN
      RAISE EXCEPTION 'A baixa da guia inicial pertence ao Setor de Protocolo';
    END IF;
    _audit_category := 'protocolo';
  ELSE
    IF NOT (
      public.is_master()
      OR _role_code='prefeitura_admin'
      OR _role_code='financeiro'
      OR _role_code='fiscal'
    ) THEN
      RAISE EXCEPTION 'Esta baixa pertence ao Setor Financeiro';
    END IF;
    _audit_category := 'financeiro';
  END IF;

  SELECT pg.*
    INTO _guide
  FROM public.payment_guides pg
  WHERE pg.process_id=_process_id
    AND pg.guide_kind=_guide_kind
  ORDER BY pg.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF _guide.id IS NULL THEN
    RAISE EXCEPTION 'Guia nao encontrada para este processo';
  END IF;

  IF coalesce(_guide.paid,false)=true
     OR coalesce(_guide.status,'') IN ('compensada','confirmed','paid') THEN
    RAISE EXCEPTION 'Guia ja esta paga';
  END IF;

  -- SECURITY: bank-connected guides are paid exclusively by an authenticated
  -- provider callback with verified credit; the manual Financeiro button must
  -- never bypass HMAC, original PDF, amount or idempotency attestations.
  IF NULLIF(btrim(coalesce(_guide.payment_provider,'')),'') = 'mercado_pago'
     OR (NULLIF(btrim(coalesce(_guide.bank_reference,'')),'') IS NOT NULL
         AND NULLIF(btrim(coalesce(_guide.payment_provider,'')),'') IS NULL)
     OR (NULLIF(btrim(coalesce(_guide.payment_provider,'')),'') IS NOT NULL
         AND _guide.payment_provider NOT IN ('manual','bank_direct','municipal_system'))
  THEN
    RAISE EXCEPTION 'Pagamento bancario vinculado: confirmacao manual bloqueada. Aguarde conciliacao autenticada do provedor.';
  END IF;

  IF _guide_kind='habite_se' AND NOT EXISTS(
    SELECT 1
    FROM public.process_messages m
    WHERE m.process_id=_process_id
      AND m.audience IN ('externo','misto')
      AND position(coalesce(_guide.guide_number,'') in coalesce(m.message,'')) > 0
  ) THEN
    RAISE EXCEPTION 'Envie a Guia de Habite-se ao profissional responsável antes de confirmar o pagamento.';
  END IF;

  _to_status := CASE _guide_kind
    WHEN 'protocolo' THEN
      CASE WHEN _triage_status='concluido'
        THEN 'pagamento_confirmado'::public.process_status
        ELSE 'triagem'::public.process_status
      END
    WHEN 'iss_obra' THEN 'analise_tecnica'::public.process_status
    WHEN 'aprovacao_final' THEN 'analise_tecnica'::public.process_status
    WHEN 'habite_se' THEN 'analise_tecnica'::public.process_status
  END;

  UPDATE public.payment_guides
     SET paid=true,paid_at=now(),status='compensada'
   WHERE id=_guide.id
   RETURNING * INTO _guide;

  UPDATE public.processes
     SET status=_to_status,
         triage_status=CASE
           WHEN _guide_kind='protocolo' THEN coalesce(_triage_status,'recebido')
           ELSE triage_status
         END,
         current_department=CASE
           WHEN _guide_kind='protocolo' THEN 'Setor de Protocolo'
           WHEN _guide_kind IN ('iss_obra','aprovacao_final','habite_se') THEN 'Análise Urbanística'
           ELSE current_department
         END,
         current_queue=CASE
           WHEN _guide_kind='protocolo' THEN
             CASE WHEN _triage_status='concluido' THEN 'Pronto para Despacho'
                  ELSE 'Triagem de Protocolo' END
           WHEN _guide_kind='iss_obra' THEN 'Análise Urbanística'
           WHEN _guide_kind='aprovacao_final' THEN 'Análise Urbanística'
           WHEN _guide_kind='habite_se' THEN 'Emissão do Alvará de Habite-se'
           ELSE current_queue
         END,
         sla_stage=CASE
           WHEN _guide_kind='protocolo' THEN
             CASE WHEN _triage_status='concluido' THEN 'Triagem concluida — pronto para despacho'
                  ELSE 'Triagem documental apos pagamento' END
           WHEN _guide_kind='iss_obra' THEN 'Análise Urbanística após ISSQN'
           WHEN _guide_kind='aprovacao_final' THEN 'Alvará aguardando emissão e assinatura'
           WHEN _guide_kind='habite_se' THEN 'Elaboração do Alvará de Habite-se'
           ELSE sla_stage
         END,
         process_checkpoint=CASE
           WHEN _guide_kind='habite_se'
             THEN 'Pagamento do Habite-se confirmado — aguardando Alvará'
           ELSE process_checkpoint
         END,
         sla_breached=false,
         updated_at=now()
   WHERE id=_process_id;

  INSERT INTO public.process_movements(
    tenant_id,process_id,actor_user_id,movement_type,from_status,to_status,
    description,created_at,visible_to_external,municipality_id,actor_profile_id
  )
  VALUES(
    _tenant_id,_process_id,_legacy_user_id,'payment_confirmed',_from_status,_to_status,
    CASE
      WHEN _guide_kind='protocolo'
        THEN 'Guia inicial confirmada, com status de triagem preservado; despacho exige conferência e encaminhamento formal'
      WHEN _guide_kind='aprovacao_final'
        THEN 'Pagamento confirmado: Guia de Pagamento - Aprovação / Alvará'
      WHEN _guide_kind='habite_se'
        THEN 'Pagamento do Habite-se confirmado; processo retornado ao Analista para emissão do Alvará de Habite-se'
      ELSE 'Pagamento confirmado pelo Setor Financeiro: '||_guide_kind
    END,
    now(),true,_municipality_id,_profile_id
  ) RETURNING * INTO _movement;

  INSERT INTO public.process_audit_entries(
    tenant_id,process_id,actor_user_id,category,title,detail,
    visible_to_external,created_at,municipality_id,actor_profile_id
  )
  VALUES(
    _tenant_id,_process_id,_legacy_user_id,_audit_category,
    CASE
      WHEN _guide_kind='protocolo' THEN 'Pagamento do protocolo confirmado'
      WHEN _guide_kind='aprovacao_final' THEN 'Pagamento da aprovação / Alvará confirmado'
      ELSE 'Pagamento confirmado'
    END,
    CASE
      WHEN _guide_kind='aprovacao_final'
        THEN 'Guia de aprovação / Alvará compensada. Processo devolvido à Análise Urbanística para emissão e assinatura do Alvará.'
      WHEN _guide_kind='habite_se'
        THEN 'Guia de Habite-se '||coalesce(_guide.guide_number,'')||' compensada. Processo encaminhado à Análise Urbanística para emissão do Alvará de Habite-se.'
      ELSE 'Guia '||_guide_kind||' confirmada e compensada.'
    END,
    true,now(),_municipality_id,_profile_id
  ) RETURNING * INTO _audit;

  RETURN jsonb_build_object(
    'process_id',_process_id,'guide',to_jsonb(_guide),
    'from_status',_from_status::text,'to_status',_to_status::text,
    'movement',to_jsonb(_movement),'audit',to_jsonb(_audit)
  );
END;
$function$

CREATE OR REPLACE FUNCTION public.get_habite_se_permit_v1(_process_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
 SET row_security TO 'off'
AS $function$
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
$function$

CREATE OR REPLACE FUNCTION public.guard_analysis_process_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
BEGIN
  IF public.current_profile_id() IS NOT NULL
    AND public.process_is_in_analysis_area(OLD.id)
    AND (
      NEW.status IS DISTINCT FROM OLD.status
      OR NEW.current_department IS DISTINCT FROM OLD.current_department
      OR NEW.current_queue IS DISTINCT FROM OLD.current_queue
      OR NEW.analysis_assigned_to_profile_id IS DISTINCT FROM OLD.analysis_assigned_to_profile_id
    )
    AND NOT public.can_write_process_analysis(OLD.id) THEN

    IF (public.is_master() OR lower(coalesce(public.current_role_code(),''))='prefeitura_admin')
      AND OLD.status IN ('analise_tecnica'::public.process_status,'distribuicao'::public.process_status)
      AND OLD.triage_status IN ('recebido','em_triagem')
      AND NEW.triage_status IS NOT DISTINCT FROM OLD.triage_status
      AND NEW.status = 'triagem'::public.process_status
      AND NEW.current_department = 'Setor de Protocolo'
      AND NEW.current_queue = 'Triagem de Protocolo'
      AND NEW.analysis_assigned_to_profile_id IS NULL
      AND NEW.analysis_started_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.interdepartmental_dispatches d
        WHERE d.process_id=OLD.id AND public.operational_area_from_label(d.to_department)='analise'
      )
      AND NOT EXISTS (SELECT 1 FROM public.process_analysis_sheets a WHERE a.process_id=OLD.id)
      AND NOT EXISTS (SELECT 1 FROM public.process_requirements r WHERE r.process_id=OLD.id)
      AND EXISTS (
        SELECT 1 FROM public.process_audit_entries a
        WHERE a.process_id=OLD.id
          AND a.category='sistema'
          AND a.title='Correção administrativa da triagem autorizada'
          AND a.actor_profile_id=public.current_profile_id()
          AND a.created_at >= clock_timestamp()-INTERVAL '30 seconds'
      ) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Somente a equipe da Análise Urbanística desta Prefeitura pode alterar o fluxo desta etapa.';
  END IF;
  RETURN NEW;
END;
$function$

CREATE OR REPLACE FUNCTION public.prevent_municipal_admin_process_write_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF lower(coalesce(public.current_role_code(), '')) IN ('prefeitura_admin', 'admin_municipality') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Administrador da Prefeitura possui acesso somente de leitura aos processos.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$

CREATE OR REPLACE FUNCTION public.reconcile_unreleased_process_triage_v1(_process_id uuid, _reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  _actor uuid := public.current_profile_id();
  _legacy_user_id uuid := public.current_legacy_user_id();
  _process public.processes%rowtype;
  _reason_text text := btrim(coalesce(_reason,''));
BEGIN
  IF _actor IS NULL OR NOT (public.is_master() OR lower(coalesce(public.current_role_code(),''))='prefeitura_admin') THEN
    RAISE EXCEPTION 'Somente o administrador municipal pode solicitar a correção da etapa.';
  END IF;
  IF length(_reason_text) < 15 THEN
    RAISE EXCEPTION 'Justifique a correção em ao menos 15 caracteres.';
  END IF;
  SELECT * INTO _process FROM public.processes WHERE id=_process_id FOR UPDATE;
  IF _process.id IS NULL OR NOT public.has_process_access(_process_id) THEN
    RAISE EXCEPTION 'Processo não encontrado ou fora do escopo da Prefeitura.';
  END IF;
  IF _process.officialized_at IS NULL
    OR _process.status NOT IN ('analise_tecnica'::public.process_status,'distribuicao'::public.process_status)
    OR _process.triage_status NOT IN ('recebido','em_triagem')
    OR EXISTS (
      SELECT 1 FROM public.interdepartmental_dispatches d
      WHERE d.process_id=_process_id AND public.operational_area_from_label(d.to_department)='analise'
    )
    OR EXISTS (SELECT 1 FROM public.process_analysis_sheets a WHERE a.process_id=_process_id)
    OR EXISTS (SELECT 1 FROM public.process_requirements r WHERE r.process_id=_process_id)
  THEN
    RAISE EXCEPTION 'Este processo não pode retornar automaticamente. Solicite revisão administrativa do histórico e documentos.';
  END IF;

  INSERT INTO public.process_audit_entries(
    tenant_id, process_id, category, title, detail, visible_to_external,
    municipality_id, actor_profile_id, actor_user_id
  ) VALUES (
    _process.tenant_id, _process_id, 'sistema',
    'Correção administrativa da triagem autorizada',
    'Reconciliação auditada: '||_reason_text||
    '. Etapa anterior: '||_process.status::text||
    '. Documentos, guias financeiras e histórico preservados.',
    false, _process.municipality_id, _actor, _legacy_user_id
  );

  UPDATE public.processes SET
    status='triagem'::public.process_status,
    current_department='Setor de Protocolo',
    current_queue='Triagem de Protocolo',
    sla_stage='Triagem documental pendente',
    process_checkpoint='Retornado à Triagem com auditoria',
    triage_notes='Correção administrativa auditada: '||_reason_text,
    analysis_assigned_to=NULL,
    analysis_assigned_to_profile_id=NULL,
    analysis_started_at=NULL,
    updated_at=clock_timestamp()
  WHERE id=_process_id;

  INSERT INTO public.process_movements(
    tenant_id,process_id,movement_type,from_status,to_status,description,
    visible_to_external,municipality_id,actor_profile_id,actor_user_id
  ) VALUES (
    _process.tenant_id,_process_id,'status_change',_process.status,
    'triagem'::public.process_status,
    'Reconciliação de fluxo pelo administrador municipal: '||_reason_text,
    false,_process.municipality_id,_actor,_legacy_user_id
  );

  RETURN jsonb_build_object('ok',true,'process_id',_process_id,
    'previous_status',_process.status::text,'status','triagem',
    'triage_status',_process.triage_status,
    'payment_modified',false,'documents_modified',false);
END;
$function$

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
$function$

CREATE OR REPLACE FUNCTION public.request_construction_permit_director_signature_v1(_process_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _process public.processes%rowtype;
  _profile public.profiles%rowtype;
  _role text;
  _row public.process_construction_permits%rowtype;
  _director record;
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

  -- Never request the director's signature before the official analysis.
  IF _process.status::text IN ('pagamento_pendente','arquivado','indeferido') THEN
    RAISE EXCEPTION 'O processo não está apto para solicitar assinatura do Alvará.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.signature_blocks sb
    WHERE sb.process_id=_process_id
      AND sb.artifact_type='urban_analysis_checklist'
      AND sb.artifact_key='urban-analysis-checklist'
      AND sb.status='concluido'
  ) THEN
    RAISE EXCEPTION 'Conclua a Ficha Oficial de Análise antes de solicitar assinatura da Diretoria.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.process_documents d
    WHERE d.process_id=_process_id
      AND coalesce(d.is_valid,true)=true
      AND coalesce(d.is_required,false)=true
      AND (nullif(btrim(coalesce(d.file_path,'')),'') IS NULL
           OR coalesce(d.review_status,'pendente')<>'aprovado')
  ) OR EXISTS (
    SELECT 1 FROM public.process_requirements r
    WHERE r.process_id=_process_id AND r.status IN ('aberta','respondida')
  ) THEN
    RAISE EXCEPTION 'Existem documentos obrigatórios ou exigências pendentes; a assinatura da Diretoria não pode ser solicitada.';
  END IF;

  select count(*),min(p.full_name)
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
    tenant_id,municipality_id,process_id,
    actor_user_id,actor_profile_id,
    category,title,detail,visible_to_external,created_at
  )
  values(
    _process.tenant_id,_process.municipality_id,_process.id,
    _profile.user_id,_profile.id,
    'assinatura',
    'Assinatura do Alvará solicitada à Diretoria',
    concat(
      'Alvará ',_row.permit_number,
      ' encaminhado pelo Analista ',
      coalesce(nullif(btrim(_profile.full_name),''),_profile.email),
      ' para assinatura eletrônica da Diretoria.'
    ),
    false,clock_timestamp()
  );

  for _director in
    select p.id,p.full_name
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
      )
  loop
    perform public.enqueue_notification_v1(
      _director.id,
      'Alvará aguardando sua assinatura',
      concat(
        'O Alvará ',_row.permit_number,
        ' do processo ',_process.protocol_number,
        ' foi encaminhado pelo Analista para assinatura eletrônica.'
      ),
      'assinatura',
      _process.id,
      '/processos/'||_process.id::text||'?aba=alvara',
      'assinatura',
      'alta',
      _profile.id,
      'permit:director-request:'||_row.id::text||':'||_director.id::text,
      jsonb_build_object(
        'permit_number',_row.permit_number,
        'protocol_number',_process.protocol_number
      )
    );
  end loop;

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
$function$

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
  where p.id=_process_id;

  if _tenant_id is null then
    raise exception 'Processo nao encontrado';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  if not (public.is_master() or public.is_internal_municipality_role()) then
    raise exception 'Sem permissao para alterar status do processo';
  end if;

  if _from_status=_to_status then
    return jsonb_build_object(
      'process_id',_process_id,
      'from_status',_from_status::text,
      'to_status',_to_status::text,
      'already_current',true
    );
  end if;

  if _to_status='arquivado'::public.process_status
     and lower(coalesce(_process_type,'')) ~ '(habite[- ]?se|ocupacao|ocupação)' then
    if not (
      public.can_manage_habite_se_permit_v1(_process_id)
      or public.is_master()
      or _role in (
        'prefeitura_admin','prefeitura_supervisor',
        'diretor','director','prefeitura_diretor','prefeitura_diretora'
      )
    ) then
      raise exception 'Somente o Analista responsável, a Diretoria ou a Administração pode concluir este processo de Habite-se.';
    end if;

    if not exists (
      select 1
      from public.process_habite_se_permits hp
      where hp.process_id=_process_id
        and hp.status='emitido'
    ) then
      raise exception 'O Habite-se só pode ser concluído após a emissão válida do Alvará.';
    end if;
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
$function$

CREATE OR REPLACE FUNCTION public.start_process_analysis(_process_id uuid)
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
  _existing_assignee uuid;
  _existing_started_at timestamptz;
  _analyst_name text;
  _movement public.process_movements%rowtype;
  _audit public.process_audit_entries%rowtype;
begin
  if _profile_id is null then
    raise exception 'Usuario nao autenticado ou sem perfil';
  end if;

  select p.tenant_id,
         p.municipality_id,
         p.status,
         p.analysis_assigned_to_profile_id,
         p.analysis_started_at
    into _tenant_id,
         _municipality_id,
         _from_status,
         _existing_assignee,
         _existing_started_at
  from public.processes p
  where p.id = _process_id
  for update;

  if _tenant_id is null then
    raise exception 'Processo nao encontrado';
  end if;

  if not public.has_process_access(_process_id) then
    raise exception 'Sem acesso ao processo';
  end if;

  if not (public.is_master() or public.is_internal_municipality_role()) then
    raise exception 'Sem permissao para iniciar analise';
  end if;

  if not public.process_technical_release_verified_v1(_process_id)
     or not public.process_is_in_analysis_area(_process_id) then
    raise exception 'Análise bloqueada: guia inicial, triagem e encaminhamento devem estar concluídos.';
  end if;

  if not public.is_master()
     and (
       lower(coalesce(public.current_role_code(),'')) not in ('analista','analyst')
       or public.profile_operational_area(_profile_id) <> 'analise'
     ) then
    raise exception 'Somente o Analista da Análise Urbanística pode iniciar a análise.';
  end if;

  if _from_status not in (
    'distribuicao'::public.process_status,
    'analise_tecnica'::public.process_status,
    'reapresentacao'::public.process_status
  ) then
    raise exception 'Processo nao esta disponivel para inicio da analise';
  end if;

  select coalesce(nullif(btrim(p.full_name),''), nullif(btrim(p.email),''), 'Analista')
    into _analyst_name
  from public.profiles p
  where p.id = _profile_id
    and p.deleted_at is null;

  _analyst_name := coalesce(_analyst_name, 'Analista');

  if _existing_assignee is not null
     and _existing_assignee <> _profile_id then
    raise exception 'Processo ja esta em analise por outro usuario';
  end if;

  if _existing_assignee = _profile_id
     and _existing_started_at is not null
     and _from_status = 'analise_tecnica'::public.process_status then
    return jsonb_build_object(
      'process_id', _process_id,
      'status', 'analise_tecnica',
      'assigned_to', _analyst_name,
      'assigned_to_profile_id', _profile_id,
      'started_at', _existing_started_at,
      'existing', true
    );
  end if;

  update public.processes
     set status = 'analise_tecnica'::public.process_status,
         current_department = 'Análise Urbanística',
         current_queue = 'Análise Urbanística',
         sla_stage = 'Análise Urbanística em andamento',
         process_checkpoint = 'Análise Urbanística em andamento',
         analysis_assigned_to = _analyst_name,
         analysis_assigned_to_profile_id = _profile_id,
         analysis_started_at = coalesce(analysis_started_at, now()),
         sla_breached = false,
         updated_at = now()
   where id = _process_id;

  if _from_status <> 'analise_tecnica'::public.process_status then
    insert into public.process_movements(
      tenant_id, process_id, actor_user_id, movement_type,
      from_status, to_status, description, created_at,
      visible_to_external, municipality_id, actor_profile_id
    )
    values(
      _tenant_id, _process_id, _legacy_user_id, 'status_change',
      _from_status, 'analise_tecnica'::public.process_status,
      'Análise Urbanística iniciada por ' || _analyst_name || '.',
      now(), true, _municipality_id, _profile_id
    )
    returning * into _movement;
  end if;

  insert into public.process_audit_entries(
    tenant_id, process_id, actor_user_id, category, title, detail,
    visible_to_external, created_at, municipality_id, actor_profile_id
  )
  values(
    _tenant_id, _process_id, _legacy_user_id, 'status',
    'Análise Urbanística iniciada',
    'Processo assumido por ' || _analyst_name || ' para análise urbanística.',
    true, now(), _municipality_id, _profile_id
  )
  returning * into _audit;

  return jsonb_build_object(
    'process_id', _process_id,
    'status', 'analise_tecnica',
    'assigned_to', _analyst_name,
    'assigned_to_profile_id', _profile_id,
    'started_at', (select analysis_started_at from public.processes where id = _process_id),
    'existing', false,
    'movement', case when _movement.id is null then null else to_jsonb(_movement) end,
    'audit', to_jsonb(_audit)
  );
end;
$function$

CREATE OR REPLACE FUNCTION public.sync_process_documents(_process_id uuid, _documents jsonb)
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
  _doc jsonb;
  _existing_id uuid;
  _inserted integer := 0;
  _updated integer := 0;
  _synced integer := 0;
  _stored integer := 0;
  _file_path text;
  _file_name text;
  _label text;
  _file_size_bytes bigint;
begin
  if _profile_id is null then raise exception 'Usuario nao autenticado ou sem perfil'; end if;
  if jsonb_typeof(_documents) <> 'array' then raise exception 'Lista de documentos invalida'; end if;

  select p.tenant_id,p.municipality_id into _tenant_id,_municipality_id
  from public.processes p where p.id=_process_id for update;

  if _tenant_id is null then raise exception 'Processo nao encontrado'; end if;
  if not public.has_process_access(_process_id) then raise exception 'Sem acesso ao processo'; end if;

  for _doc in select value from jsonb_array_elements(_documents)
  loop
    _file_path := nullif(btrim(coalesce(_doc->>'filePath','')), '');
    _file_name := nullif(btrim(coalesce(_doc->>'fileName','')), '');
    _label := coalesce(nullif(btrim(_doc->>'label'),''), _file_name, 'Documento');
    _file_size_bytes := greatest(coalesce(nullif(_doc->>'fileSizeBytes','')::bigint,0),0);

    if _file_path is null then
      raise exception 'Documento "%" nao possui arquivo persistido no armazenamento oficial', _label;
    end if;

    _existing_id := null;
    select d.id into _existing_id
    from public.process_documents d
    where d.process_id=_process_id and d.file_path=_file_path
    order by d.created_at desc limit 1;

    if _existing_id is null then
      insert into public.process_documents(
        tenant_id,municipality_id,process_id,
        uploaded_by,uploaded_by_profile_id,
        title,file_path,file_hash,version,source,
        is_required,is_valid,file_name,mime_type,size_label,file_size_bytes,
        preview_url,review_status,annotations
      )
      values(
        _tenant_id,coalesce(_municipality_id,_tenant_id),_process_id,
        _legacy_user_id,_profile_id,
        _label,_file_path,
        coalesce(nullif(_doc->>'fileHash',''),encode(extensions.digest(_file_path || '|' || coalesce(_file_name,''),'sha256'),'hex')),
        greatest(coalesce(nullif(_doc->>'version','')::integer,1),1),
        coalesce(nullif(_doc->>'source',''),'profissional'),
        coalesce(nullif(_doc->>'required','')::boolean,true),
        true,_file_name,nullif(_doc->>'mimeType',''),nullif(_doc->>'sizeLabel',''),
        nullif(_file_size_bytes,0),
        case when length(coalesce(_doc->>'previewUrl',''))>2000000 then null else nullif(_doc->>'previewUrl','') end,
        coalesce(nullif(_doc->>'reviewStatus',''),'pendente'),
        coalesce(_doc->'annotations','[]'::jsonb)
      );
      _inserted := _inserted + 1;
    else
      update public.process_documents
         set title=_label,
             file_name=coalesce(_file_name,file_name),
             mime_type=coalesce(nullif(_doc->>'mimeType',''),mime_type),
             size_label=coalesce(nullif(_doc->>'sizeLabel',''),size_label),
             file_size_bytes=coalesce(nullif(_file_size_bytes,0),file_size_bytes),
             source=coalesce(nullif(_doc->>'source',''),source),
             is_required=coalesce(nullif(_doc->>'required','')::boolean,is_required),
             is_valid=true,
             invalidated_at=null,
             review_status=case when review_status in ('aprovado','rejeitado') then review_status else coalesce(nullif(_doc->>'reviewStatus',''),'pendente') end,
             annotations=coalesce(_doc->'annotations',annotations)
       where id=_existing_id;
      _updated := _updated + 1;
    end if;
    _synced := _synced + 1;
  end loop;

  select count(*)::integer into _stored
  from public.process_documents d
  where d.process_id=_process_id and d.is_valid=true and d.file_path is not null
    and btrim(d.file_path) <> '' and d.file_path not like 'pending/%';

  if _synced > 0 then
    insert into public.process_audit_entries(
      tenant_id,process_id,actor_user_id,actor_profile_id,
      category,title,detail,visible_to_external,municipality_id
    )
    values(
      _tenant_id,_process_id,_legacy_user_id,_profile_id,
      'documento','Documentos sincronizados',
      _synced::text||' documento(s) confirmados no armazenamento e no processo.',
      true,coalesce(_municipality_id,_tenant_id)
    );
  end if;

  return jsonb_build_object(
    'process_id',_process_id,'synced',_synced,'inserted',_inserted,'updated',_updated,'stored',_stored
  );
end;
$function$

CREATE OR REPLACE FUNCTION public.verify_process_artifact_signature_public_v1(_verification_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET row_security TO 'off'
AS $function$
declare
  _code text := upper(regexp_replace(coalesce(_verification_code, ''), '[^A-Za-z0-9]', '', 'g'));
  _block public.signature_blocks%rowtype;
  _protocol text := '';
  _municipality_name text := 'Prefeitura Municipal';
begin
  if length(_code) < 12 or length(_code) > 64 then
    return jsonb_build_object('valid', false, 'code', _code);
  end if;

  select *
    into _block
  from public.signature_blocks
  where upper(coalesce(verification_code, '')) = _code
    and status = 'concluido'
    and document_id is null
    and artifact_key is not null
  order by completed_at desc nulls last, created_at desc
  limit 1;

  if _block.id is null then
    return jsonb_build_object('valid', false, 'code', _code);
  end if;

  select
    coalesce(
      nullif(_block.artifact_payload->>'protocol', ''),
      nullif(to_jsonb(p)->>'protocol_number', ''),
      ''
    ),
    coalesce(
      nullif(to_jsonb(m)->>'display_name', ''),
      nullif(to_jsonb(m)->>'official_name', ''),
      nullif(to_jsonb(m)->>'name', ''),
      'Prefeitura Municipal'
    )
  into _protocol, _municipality_name
  from public.processes p
  left join public.municipalities m on m.id = _block.municipality_id
  where p.id = _block.process_id
  limit 1;

  return jsonb_build_object(
    'valid', true,
    'verification_code', _block.verification_code,
    'artifact_type', _block.artifact_type,
    'artifact_key', _block.artifact_key,
    'artifact_version', _block.artifact_version,
    'artifact_hash', _block.evidence_hash,
    'completed_at', _block.completed_at,
    'protocol', _protocol,
    'permit_number', coalesce(_block.artifact_payload->>'permitNumber', ''),
    'municipality_name', _municipality_name,
    'signers', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name', s.signer_name,
          'title', coalesce(nullif(s.signer_title, ''), nullif(s.signer_role, ''), 'Autoridade municipal'),
          'registration', s.signer_registration,
          'slot', s.signer_slot,
          'signed_at', s.signed_at
        )
        order by s.signer_order
      )
      from public.signatures s
      where s.signature_block_id = _block.id
        and s.status = 'concluido'
    ), '[]'::jsonb)
  );
end;
$function$

COMMIT;
