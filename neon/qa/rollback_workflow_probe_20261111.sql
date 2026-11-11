-- SIGAPRO QA: transaction-only logical end-to-end proof, with automatic rollback.
-- IMPORTANT: Uses the EXISTING PAID QA process; does not touch real banking.
-- Simulates authenticated database context (not an actual browser login).
-- Documents here are FICTIONAL METADATA, not uploaded or OCR-read R2 PDF bytes.
-- A sentinel exception rolls back ALL inserts/updates/notifications/dispatches.
-- pg_temp function only exists during the test database connection.
CREATE OR REPLACE FUNCTION pg_temp.sigapro_e2e_rollback_check()
RETURNS jsonb LANGUAGE plpgsql AS $test$
DECLARE
  _id uuid;
  _tenant uuid;
  _owner_profile uuid;
  _owner_sub text;
  _analyst_sub text;
  _admin_sub text;
  _doc_title text;
  _doc_file text;
  _stage text := 'prepare';
  _details jsonb := '[]'::jsonb;
  _result jsonb;
  _process_status text;
  _triage text;
  _docs bigint;
  _doc record;
  _error text := null;
  _test_rolled_back boolean := false;
  _before_status text;
  _before_docs bigint;
  _before_parties bigint;
  _before_property boolean;
BEGIN
  SELECT p.id,p.tenant_id,p.created_by_profile_id,p.status::text,
         p.property_id IS NOT NULL
    INTO _id,_tenant,_owner_profile,_before_status,_before_property
  FROM public.processes p WHERE p.protocol_number='PM-2026-00005';
  IF _id IS NULL OR _before_status <> 'pendencia_documental' THEN
    RETURN jsonb_build_object('ok',false,'reason','QA paid fixture missing or wrong status');
  END IF;
  SELECT count(*) INTO _before_docs FROM public.process_documents WHERE process_id=_id;
  SELECT count(*) INTO _before_parties FROM public.process_parties WHERE process_id=_id;
  SELECT pai.provider_user_id INTO _owner_sub
    FROM public.profile_auth_identities pai WHERE pai.profile_id=_owner_profile
      AND pai.provider='neon' AND pai.is_active LIMIT 1;
  IF _owner_sub IS NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','No active Neon external test identity');
  END IF;
  BEGIN
    _stage:='authenticated-professional';
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',_owner_sub)::text,true);
    IF public.current_profile_id() IS DISTINCT FROM _owner_profile
      OR public.current_role_code()<>'profissional_externo' THEN
      RAISE EXCEPTION 'Professional simulated role does not resolve';
    END IF;
    _details:=_details||jsonb_build_array(jsonb_build_object('stage',_stage,'result','resolved'));

    _stage:='complete-real-data-fields-with-qa-fictional-identities';
    _result:=public.correct_paid_triage_identity_v1(_id,jsonb_build_object(
      'address','Rua E2E Ficticia de Homologacao 100, Campo Limpo Paulista, SP',
      'area','245.50',
      'ownerName','PROPRIETARIO FICTICIO QA SOMENTE TESTE',
      'technicalLead','RESPONSAVEL TECNICO FICTICIO QA SOMENTE TESTE'
    ));
    _details:=_details||jsonb_build_array(jsonb_build_object('stage',_stage,'result',_result->>'ok',
      'triage',_result->'triage'));

    FOREACH _doc_title IN ARRAY ARRAY[
       'Projeto Arquitetônico','Memorial Descritivo','ART/RRT','Escritura/Matrícula'
    ] LOOP
      _stage:='simulated-document-metadata-'||_doc_title;
      _doc_file:=CASE _doc_title
        WHEN 'Projeto Arquitetônico' THEN 'projeto-arquitetonico'
        WHEN 'Memorial Descritivo' THEN 'memorial-descritivo'
        WHEN 'ART/RRT' THEN 'art-rrt'
        ELSE 'matricula-imovel'
      END;
      PERFORM public.append_process_documents(
        _id,jsonb_build_array(jsonb_build_object(
          'label',_doc_title,
          'required',true,
          'filePath',format('municipalities/%s/protocols/%s/%s-%s.pdf',
             _tenant,_owner_profile,gen_random_uuid(),_doc_file),
          'fileName',_doc_file||'.pdf',
          'fileSizeBytes',4096,
          'mimeType','application/pdf',
          'source','profissional',
          'reviewStatus','pendente',
          'annotations','[]'::jsonb
        ))
      );
      SELECT status::text,triage_status INTO _process_status,_triage
        FROM public.processes WHERE id=_id;
      _details:=_details||jsonb_build_array(jsonb_build_object(
        'stage',_stage,'status',_process_status,'triage',_triage,
        'r2BytesPresent',false));
    END LOOP;
    SELECT count(*) INTO _docs FROM public.process_documents WHERE process_id=_id;
    _details:=_details||jsonb_build_array(jsonb_build_object(
      'stage','after-four-required-fixtures','status',_process_status,
      'documentMetadataCount',_docs));

    _stage:='analyst-context';
    SELECT pai.provider_user_id INTO _analyst_sub
      FROM public.profiles p JOIN public.profile_auth_identities pai ON pai.profile_id=p.id
      WHERE p.municipality_id=_tenant AND p.role='analista'
        AND p.account_status='active' AND p.deleted_at IS NULL
        AND pai.provider='neon' AND pai.is_active
        AND public.profile_operational_area(p.id)='analise'
      ORDER BY p.id LIMIT 1;
    IF _analyst_sub IS NULL THEN
      RAISE EXCEPTION 'No analyst role with active test identity and urbanistic department';
    END IF;
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',_analyst_sub)::text,true);
    _stage:='start-urban-analysis';
    _result:=public.start_process_analysis(_id);
    _details:=_details||jsonb_build_array(jsonb_build_object('stage',_stage,
       'result',_result->>'status'));

    _stage:='analyst-document-review';
    FOR _doc IN SELECT id FROM public.process_documents WHERE process_id=_id
       AND is_required IS TRUE ORDER BY title LOOP
      PERFORM public.review_process_document(_doc.id,'aprovado');
    END LOOP;
    _details:=_details||jsonb_build_array(jsonb_build_object('stage',_stage,
      'approvedCount',(SELECT count(*) FROM public.process_documents
         WHERE process_id=_id AND review_status='aprovado')));

    _stage:='save-urban-analysis-sheet-draft';
    _result:=public.save_process_analysis_sheet_v2(_id,
      jsonb_build_object('schema','sigapro.urban-analysis-checklist.v2',
        'processId',_id::text,'municipalityId',_tenant::text,
        'analysisDate','2026-11-11','sheetNumber','QA-E2E-ROLLBACK',
        'items','{}'::jsonb,'conclusion','RASCUNHO FICTICIO SEM AVALIACAO LEGAL'),
      0);
    _details:=_details||jsonb_build_array(jsonb_build_object('stage',_stage,
        'revision',_result->>'revision'));

    _stage:='verify-director-signature-will-not-be-forced';
    BEGIN
      PERFORM public.request_construction_permit_director_signature_v1(_id);
      RAISE EXCEPTION 'UNSAFE: director signature was requested before signed official analysis';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'UNSAFE:%' THEN RAISE; END IF;
      _details:=_details||jsonb_build_array(jsonb_build_object('stage',_stage,
        'blocked',true,'reason',left(SQLERRM,160)));
    END;

    _stage:='rollback-all-fixtures';
    RAISE EXCEPTION '__SIGAPRO_QA_E2E_ROLLBACK__';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='__SIGAPRO_QA_E2E_ROLLBACK__' THEN
      _test_rolled_back:=true;
    ELSE
      _error:=_stage||': '||left(SQLERRM,500);
    END IF;
  END;

  -- Every subtransaction's synthetic modification above has been rolled back.
  RETURN jsonb_build_object(
    'logicalQaSimulation',true,'realR2UploadTested',false,
    'realBankPaymentTested',false,'realBrowserLoginTested',false,
    'stages',_details,'error',_error,'allStepsPassed',_test_rolled_back,
    'rollbackVerified',
       (SELECT p.status::text=_before_status AND
                 (p.property_id IS NOT NULL)=_before_property
        FROM public.processes p WHERE p.id=_id)
       AND (SELECT count(*) FROM public.process_documents WHERE process_id=_id)=_before_docs
       AND (SELECT count(*) FROM public.process_parties WHERE process_id=_id)=_before_parties
  );
END
$test$;
