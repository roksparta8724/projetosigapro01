-- Guard the hand-off in the database while allowing technical review only after dispatch.
-- The Protocolo verifies receipt and integrity; it does not assert technical approval.
CREATE OR REPLACE FUNCTION public.set_process_triage(_process_id uuid, _triage_status text, _notes text DEFAULT NULL::text)
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
  _process_status public.process_status;
  _previous_triage text;
  _process_type text;
  _missing_docs boolean := false;
  _present_types integer := 0;
  _has_required_doc boolean := false;
  _protocol_paid boolean := false;
  _actor_name text;
  _effective_status text := lower(trim(coalesce(_triage_status,'')));
  _movement public.process_movements%rowtype;
  _audit public.process_audit_entries%rowtype;
BEGIN
  IF _profile_id IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado ou sem perfil';
  END IF;

  IF _effective_status NOT IN ('recebido','em_triagem','concluido') THEN
    RAISE EXCEPTION 'Status de triagem invalido';
  END IF;

  SELECT p.tenant_id,p.municipality_id,p.status,p.triage_status,p.process_type
    INTO _tenant_id,_municipality_id,_process_status,_previous_triage,_process_type
  FROM public.processes p
  WHERE p.id=_process_id
  FOR UPDATE;

  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'Processo nao encontrado';
  END IF;

  IF NOT public.has_process_access(_process_id) THEN
    RAISE EXCEPTION 'Sem acesso ao processo';
  END IF;

  IF NOT (
    public.is_master()
    OR _role_code='prefeitura_admin'
    OR _role_code='setor_intersetorial'
  ) THEN
    RAISE EXCEPTION 'Somente o Setor de Protocolo pode executar a triagem';
  END IF;

  SELECT exists(
    select 1
    from public.payment_guides g
    where g.process_id=_process_id
      and g.guide_kind='protocolo'
      and (
        coalesce(g.paid,false)=true
        or lower(coalesce(g.status,'')) in ('compensada','confirmed','paid','pago','confirmado')
      )
  ) into _protocol_paid;

  -- Triage is a RECEIPT check, not the analyst's later urbanistic judgment.
  -- Never require review_status='aprovado' at protocol stage.
  IF _effective_status='concluido' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.process_documents d
      WHERE d.process_id=_process_id AND d.is_required IS TRUE
        AND (
          (nullif(btrim(coalesce(d.file_path,'')),'') IS NULL
            AND nullif(btrim(coalesce(d.preview_url,'')),'') IS NULL)
          OR coalesce(d.is_valid,true)=false
        )
    ) INTO _missing_docs;
    IF _missing_docs THEN
      RAISE EXCEPTION 'Conclua a entrega dos arquivos obrigatorios antes da triagem.';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.process_documents d WHERE d.process_id=_process_id
        AND d.is_required IS TRUE AND coalesce(d.is_valid,true)=true
        AND (nullif(btrim(coalesce(d.file_path,'')),'') IS NOT NULL
          OR nullif(btrim(coalesce(d.preview_url,'')),'') IS NOT NULL)
    ) INTO _has_required_doc;

    IF lower(coalesce(_process_type,'')) ~ '(aprov|licenciament|arquitet|projeto)'
       AND lower(coalesce(_process_type,'')) NOT LIKE '%habite%' THEN
      SELECT COUNT(DISTINCT CASE
        WHEN lower(d.title) ~ 'projeto arquitet[oô]nico' THEN 'projeto'
        WHEN lower(d.title) ~ 'memorial descritivo' THEN 'memorial'
        WHEN lower(d.title) ~ 'art|rrt' THEN 'art_rrt'
        WHEN lower(d.title) ~ 'matr[ií]cula|escritura' THEN 'matricula'
        ELSE null END)
      INTO _present_types
      FROM public.process_documents d
      WHERE d.process_id=_process_id AND d.is_required IS TRUE
        AND coalesce(d.is_valid,true)=true
        AND (nullif(btrim(coalesce(d.file_path,'')),'') IS NOT NULL
          OR nullif(btrim(coalesce(d.preview_url,'')),'') IS NOT NULL);
      IF _present_types < 4 THEN
        RAISE EXCEPTION 'Triagem: anexe Projeto Arquitetonico, Memorial, ART/RRT e Escritura/Matricula.';
      END IF;
    ELSIF lower(coalesce(_process_type,'')) LIKE '%habite%'
      AND NOT _has_required_doc THEN
      RAISE EXCEPTION 'Triagem do Habite-se: anexe os documentos obrigatorios.';
    END IF;
  END IF;

  SELECT coalesce(nullif(trim(p.full_name),''),nullif(trim(p.email),''),'Funcionario do Protocolo')
    INTO _actor_name
  FROM public.profiles p
  WHERE p.id=_profile_id
  LIMIT 1;

  UPDATE public.processes
     SET triage_status=_effective_status,
         status=CASE
           WHEN _effective_status='concluido' and _protocol_paid
             THEN 'pagamento_confirmado'::public.process_status
           WHEN _effective_status='concluido'
             THEN 'pagamento_pendente'::public.process_status
           ELSE 'triagem'::public.process_status
         END,
         triage_assigned_to=CASE
           WHEN _effective_status='recebido' THEN NULL
           ELSE _actor_name
         END,
         triage_notes=coalesce(nullif(trim(_notes),''),triage_notes),
         current_department='Setor de Protocolo',
         current_queue=CASE
           WHEN _effective_status='recebido' THEN 'Recepção'
           WHEN _effective_status='em_triagem' THEN 'Triagem de Protocolo'
           ELSE case when _protocol_paid then 'Pronto para Despacho' else 'Pagamento do Protocolo' end
         END,
         sla_stage=CASE
           WHEN _effective_status='recebido' THEN 'Recepção de Protocolo'
           WHEN _effective_status='em_triagem' THEN 'Triagem de Protocolo'
           ELSE case
             when _protocol_paid then 'Triagem concluida — pronto para despacho'
             else 'Aguardando pagamento do protocolo'
           end
         END,
         updated_at=now()
   WHERE id=_process_id;

  INSERT INTO public.process_movements(
    tenant_id,process_id,actor_user_id,movement_type,
    from_status,to_status,description,created_at,
    visible_to_external,municipality_id,actor_profile_id
  )
  VALUES(
    _tenant_id,_process_id,_legacy_user_id,'triage',
    _process_status,
    CASE
      WHEN _effective_status='concluido' and _protocol_paid
        THEN 'pagamento_confirmado'::public.process_status
      WHEN _effective_status='concluido'
        THEN 'pagamento_pendente'::public.process_status
      ELSE 'triagem'::public.process_status
    END,
    CASE _effective_status
      WHEN 'em_triagem' THEN 'Triagem iniciada pelo Setor de Protocolo'
      WHEN 'concluido' THEN 'Triagem concluida pelo Setor de Protocolo'
      ELSE 'Processo devolvido para recepcao do Protocolo'
    END,
    now(),true,_municipality_id,_profile_id
  )
  RETURNING * INTO _movement;

  INSERT INTO public.process_audit_entries(
    tenant_id,process_id,actor_user_id,category,title,detail,
    visible_to_external,created_at,municipality_id,actor_profile_id
  )
  VALUES(
    _tenant_id,_process_id,_legacy_user_id,'protocolo',
    CASE _effective_status
      WHEN 'em_triagem' THEN 'Triagem iniciada'
      WHEN 'concluido' THEN 'Triagem concluida'
      ELSE 'Triagem redefinida'
    END,
    coalesce(nullif(trim(_notes),''),
      CASE _effective_status
        WHEN 'em_triagem' THEN 'Conferencia documental iniciada pelo Protocolo.'
        WHEN 'concluido' THEN case
          when _protocol_paid
            then 'Conferencia documental concluida. Pagamento ja compensado; processo liberado para despacho.'
          else 'Conferencia documental concluida. O fluxo aguarda a baixa da guia inicial quando aplicavel.'
        end
        ELSE 'Processo retornado para a recepcao.'
      END
    ),
    true,now(),_municipality_id,_profile_id
  )
  RETURNING * INTO _audit;

  RETURN jsonb_build_object(
    'process_id',_process_id,
    'previous_triage_status',_previous_triage,
    'triage_status',_effective_status,
    'assigned_to',CASE WHEN _effective_status='recebido' THEN NULL ELSE _actor_name END,
    'movement',to_jsonb(_movement),
    'audit',to_jsonb(_audit)
  );
END;
$function$;
