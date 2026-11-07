-- SIGAPRO - QA P0 FINANCE HARDENING - REVIEW ONLY, NOT AN AUTOMATIC MIGRATION
-- Source definition inspected from production metadata on 07/11/2026.
-- NEVER execute directly on production without approval, controlled QA smoke,
-- authorized change window and a verified rollback plan.
-- This file is kept under docs/, not under the migration runner.
-- This change ONLY addresses direct role access and manual settlement:
-- it does not prove webhook integration, provider amounts, or backups.

BEGIN;

-- SECURITY DEFINER implementation must be callable by its controlled
-- trigger/owner, not directly via public or a generic signed-in API user.
REVOKE EXECUTE ON FUNCTION public.officialize_preprotocol_v1(uuid,uuid)
  FROM PUBLIC, authenticated;

-- Keep authorized explicit Protocolo and Financeiro manual routes only,
-- and reject provider-linked preprotocols unless the provider confirms.
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

  if not (_role_code in ('setor_intersetorial','analista','prefeitura_supervisor','counter_service')
          and _area='protocolos') then
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
    -- Stop manual marking of bank-connected charges. Only the provider
    -- verified/attested settlement worker may confirm those payments.
    if nullif(btrim(coalesce(_guide.bank_reference,'')),'') is not null
       or nullif(btrim(coalesce(_guide.bank_payment_id,'')),'') is not null
       or nullif(btrim(coalesce(_guide.bank_status,'')),'') is not null
       or nullif(btrim(coalesce(_guide.bank_status_detail,'')),'') is not null
       or _guide.bank_authenticated_at is not null
       or _guide.provider_charge_saved_at is not null
       or nullif(btrim(coalesce(_guide.ticket_url,'')),'') is not null
       or nullif(btrim(coalesce(_guide.barcode,'')),'') is not null
       or nullif(btrim(coalesce(_guide.digitable_line,'')),'') is not null
       or nullif(btrim(coalesce(_guide.provider_environment,'')),'') is not null
       or (nullif(btrim(coalesce(_guide.payment_provider,'')),'') is not null
           and lower(btrim(_guide.payment_provider)) not in ('manual','municipal_system')) then
      raise exception 'Guia vinculada a provedor bancario: aguarde a conciliacao autenticada.';
    end if;
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
$function$;

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
      _role_code='setor_intersetorial'
      AND public.profile_operational_area(_profile_id)='protocolos'
    ) THEN
      RAISE EXCEPTION 'A baixa da guia inicial pertence ao Setor de Protocolo';
    END IF;
    _audit_category := 'protocolo';
  ELSE
    IF NOT (
      _role_code='financeiro'
      AND public.profile_operational_area(_profile_id)='financeiro'
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
  -- Fail closed for ANY externally linked charge. A "bank_direct"
  -- provider with bank_reference is still a bank transaction, not manual
  -- cash desk receipt. The provider webhook must attest the settlement.
  IF nullif(btrim(coalesce(_guide.bank_reference,'')),'') IS NOT NULL
     OR nullif(btrim(coalesce(_guide.bank_payment_id,'')),'') IS NOT NULL
     OR nullif(btrim(coalesce(_guide.bank_status,'')),'') IS NOT NULL
     OR nullif(btrim(coalesce(_guide.bank_status_detail,'')),'') IS NOT NULL
     OR _guide.bank_authenticated_at IS NOT NULL
     OR _guide.provider_charge_saved_at IS NOT NULL
     OR nullif(btrim(coalesce(_guide.ticket_url,'')),'') IS NOT NULL
     OR nullif(btrim(coalesce(_guide.barcode,'')),'') IS NOT NULL
     OR nullif(btrim(coalesce(_guide.digitable_line,'')),'') IS NOT NULL
     OR nullif(btrim(coalesce(_guide.provider_environment,'')),'') IS NOT NULL
     OR (nullif(btrim(coalesce(_guide.payment_provider,'')),'') IS NOT NULL
           AND lower(btrim(_guide.payment_provider)) NOT IN ('manual','municipal_system'))
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
$function$;

-- No privilege expansion; retain existing EXECUTE grants on the two
-- checked procedures for the authenticated role.
COMMIT;

-- POST-CHANGE SMOKE (read-only; run with test accounts in QA first):
-- SELECT has_function_privilege('authenticated',
--   'public.officialize_preprotocol_v1(uuid,uuid)','EXECUTE');
-- Expected: false. Manually test an actual provider sandbox callback and
-- an authorized manual-only guide to ensure both expected paths still work.
