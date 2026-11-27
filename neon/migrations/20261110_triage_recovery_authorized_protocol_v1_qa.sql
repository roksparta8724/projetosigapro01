-- SIGAPRO QA: unblock safely the audit-based correction of legacy triage state.
-- This replaces only authorization of the existing RPC, never updates process data.
-- prefeitura_admin is read-only. Real Protocolo staff may reconcile their city.
BEGIN;
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
  -- Operação do Protocolo: jamais permitir prefeitura_admin editar processos.
  -- O master só pode atuar com identidade real e a verificação de escopo abaixo.
  IF _actor IS NULL
     OR lower(coalesce(public.current_role_code(),'')) IN
       ('prefeitura_admin','admin_prefeitura','admin_municipality')
     OR NOT (
       public.is_master()
       OR (
         public.is_internal_municipality_role()
         AND public.profile_operational_area(_actor)='protocolos'
       )
     )
  THEN
    RAISE EXCEPTION 'Somente o setor de Protocolo autorizado ou a Administração Master pode solicitar a correção auditada.';
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
    'Reconciliação de fluxo pelo setor de Protocolo autorizado: '||_reason_text,
    false,_process.municipality_id,_actor,_legacy_user_id
  );

  RETURN jsonb_build_object('ok',true,'process_id',_process_id,
    'previous_status',_process.status::text,'status','triagem',
    'triage_status',_process.triage_status,
    'payment_modified',false,'documents_modified',false);
END;
$function$;
COMMIT;
