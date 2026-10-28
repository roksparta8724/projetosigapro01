-- SIGAPRO: forward-only guard on the existing manual settlement RPC.
-- APPLY TO ISOLATED QA FIRST. Production requires a separate release gate.
-- No legacy guide or payment is modified by this DDL.
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
    WHEN 'protocolo' THEN 'triagem'::public.process_status
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
           WHEN _guide_kind='protocolo' THEN 'recebido'
           ELSE triage_status
         END,
         current_department=CASE
           WHEN _guide_kind='protocolo' THEN 'Setor de Protocolo'
           WHEN _guide_kind IN ('iss_obra','aprovacao_final','habite_se') THEN 'Análise Urbanística'
           ELSE current_department
         END,
         current_queue=CASE
           WHEN _guide_kind='protocolo' THEN 'Triagem de Protocolo'
           WHEN _guide_kind='iss_obra' THEN 'Análise Urbanística'
           WHEN _guide_kind='aprovacao_final' THEN 'Análise Urbanística'
           WHEN _guide_kind='habite_se' THEN 'Emissão do Alvará de Habite-se'
           ELSE current_queue
         END,
         sla_stage=CASE
           WHEN _guide_kind='protocolo' THEN 'Triagem documental apos pagamento'
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
        THEN 'Pagamento inicial confirmado; pre-protocolo oficializado como processo municipal'
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
