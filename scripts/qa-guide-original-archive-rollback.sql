-- QA ONLY / SOMENTE QA: branch Neon br-solitary-sound-b4xlbvs6.
-- NEVER run on production. The exact sandbox guide is an intentional fail-closed marker.
-- Simulated JWT checks SQL permissions; it is NOT proof of a real HTTP login.
-- No payment/provider call, no R2 upload. Inner exception rolls back every temporary SQL write.
DO $qa$
DECLARE
  g public.payment_guides;
  owner_identity record;
  foreign_identity record;
  saved_snapshot jsonb;
  frozen jsonb;
  archived jsonb;
  object_key text;
  digest text:=repeat('a',64);
  passed boolean:=false;
BEGIN
  SELECT * INTO g FROM public.payment_guides
  WHERE guide_number='DAM-PRE-20261022-7791A2E9'
    AND provider_environment='test'
    AND payment_provider='mercado_pago'
    AND paid=false
    AND document_snapshot IS NULL
    AND original_pdf_key IS NULL
    AND length(barcode)=44
    AND length(digitable_line) IN (47,48)
  LIMIT 1;
  IF g.id IS NULL THEN RAISE EXCEPTION 'QA-only test guide missing or modified; no changes made'; END IF;

  SELECT p.id AS profile_id, i.provider_user_id AS subject_id
    INTO owner_identity
  FROM public.profiles p
  JOIN public.processes pr ON pr.created_by_profile_id=p.id AND pr.id=g.process_id
  JOIN public.profile_auth_identities i ON i.profile_id=p.id
    AND i.provider='neon' AND i.is_active=true
  WHERE p.account_status='active' AND p.deleted_at IS NULL
    AND p.municipality_id=g.municipality_id
  LIMIT 1;
  IF owner_identity.profile_id IS NULL THEN RAISE EXCEPTION 'No authenticated QA professional owner'; END IF;

  SELECT p.id AS profile_id, i.provider_user_id AS subject_id
    INTO foreign_identity
  FROM public.profiles p
  JOIN public.profile_auth_identities i ON i.profile_id=p.id
    AND i.provider='neon' AND i.is_active=true
  WHERE p.account_status='active' AND p.deleted_at IS NULL
    AND p.municipality_id<>g.municipality_id
  LIMIT 1;
  IF foreign_identity.profile_id IS NULL THEN RAISE EXCEPTION 'Second isolated QA municipality required'; END IF;

  BEGIN
    saved_snapshot:=jsonb_build_object('guia',jsonb_build_object(
      'numeroGuia',g.guide_number,
      'valorDocumento',g.amount,
      'valorCobrado',g.amount,
      'dataDocumento',g.created_at,
      'codigoBarras',g.barcode,
      'linhaDigitavel',g.digitable_line
    ));

    -- Unauthorized foreign-tenant identity must fail BEFORE touching the snapshot.
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('sub',foreign_identity.subject_id)::text,true);
    BEGIN
      PERFORM public.freeze_payment_guide_document_v1(
        g.municipality_id,g.guide_number,saved_snapshot);
      RAISE EXCEPTION 'QA_FOREIGN_ARCHIVE_ACCEPTED';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM='QA_FOREIGN_ARCHIVE_ACCEPTED'
        OR SQLERRM NOT IN ('Sem acesso à guia desta Prefeitura','Acesso ao documento DAM não autorizado',
                          'Sem permissão para arquivar este documento DAM')
      THEN RAISE; END IF;
    END;

    -- A real profile mapped to the owner may freeze the original in the SQL contract.
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('sub',owner_identity.subject_id)::text,true);
    IF public.current_profile_id() IS DISTINCT FROM owner_identity.profile_id
    THEN RAISE EXCEPTION 'Owner identity mismatch'; END IF;
    frozen:=public.freeze_payment_guide_document_v1(
      g.municipality_id,g.guide_number,saved_snapshot);
    IF frozen->'document_snapshot' IS NULL
    THEN RAISE EXCEPTION 'Immutable snapshot was not saved'; END IF;
    object_key:='municipalities/'||g.municipality_id||'/processes/'||
      g.process_id||'/dam-originals/'||g.id||'/'||digest||'.pdf';
    archived:=public.attach_payment_guide_original_v1(
      g.municipality_id,g.guide_number,object_key,digest);
    IF archived->>'original_pdf_key' IS DISTINCT FROM object_key
    THEN RAISE EXCEPTION 'SHA-256 original reference was not recorded'; END IF;

    IF (public.attach_payment_guide_original_v1(
      g.municipality_id,g.guide_number,'replacement-not-permitted.pdf',repeat('b',64)))
       ->>'original_pdf_key' IS DISTINCT FROM object_key
    THEN RAISE EXCEPTION 'Original was replaced by a second attachment'; END IF;

    passed:=true;
    RAISE EXCEPTION 'QA_ORIGINAL_ARCHIVE_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'QA_ORIGINAL_ARCHIVE_ROLLBACK' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claims','',true);
  IF NOT passed OR EXISTS(
    SELECT 1 FROM public.payment_guides WHERE id=g.id
      AND (original_pdf_key IS NOT NULL OR document_snapshot IS NOT NULL)
  ) THEN RAISE EXCEPTION 'QA guide archive fixture did not roll back'; END IF;
  RAISE NOTICE 'PASS: cross-tenant denied, owner archive, SHA immutable, all writes rolled back';
END $qa$;
