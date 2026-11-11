-- SIGAPRO QA (11/11/2026): evidence-only commercial pilot readiness.
-- READ-ONLY: no bank actions, payments, signatures, permit generation, secrets,
-- automatic certification or approval. Scoped by existing municipal RLS policy.
CREATE OR REPLACE FUNCTION public.get_municipal_commercial_readiness_v1(
  _municipality_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
SET row_security TO 'off'
AS $function$
DECLARE
  _provider record;
  _collection record;
  _paid_evidence integer := 0;
  _law_evidence integer := 0;
  _active_rules integer := 0;
  _analyst_signatures integer := 0;
  _director_signatures integer := 0;
  _bank_active boolean := false;
BEGIN
  IF _municipality_id IS NULL OR NOT public.can_read_municipal_collection_v1(_municipality_id) THEN
    RAISE EXCEPTION 'Sem acesso as evidencias de liberacao da Prefeitura';
  END IF;
  SELECT p.provider,p.environment,p.status,p.last_test_status,
      (p.credentials_ciphertext IS NOT NULL) AS has_credentials,
      (p.webhook_secret_ciphertext IS NOT NULL) AS has_webhook
    INTO _provider
  FROM public.municipal_payment_provider_connections p
  WHERE p.municipality_id=_municipality_id;
  _bank_active := coalesce(
    _provider.provider='mercado_pago' AND
    _provider.environment='production' AND
    _provider.status='active' AND
    _provider.last_test_status='ok' AND
    _provider.has_credentials AND
    _provider.has_webhook,
    false
  );
  SELECT c.mode,c.environment,c.status,c.version,c.integration_type
    INTO _collection
  FROM public.municipal_collection_configurations c
  WHERE c.municipality_id=_municipality_id
    AND c.status='active'
  ORDER BY c.version DESC LIMIT 1;

  -- Proves only matching bank-authentication and persisted ORIGINAL metadata.
  -- This count does NOT independently verify R2 object bytes or bank ownership.
  SELECT count(*) INTO _paid_evidence
  FROM public.payment_guides g
  WHERE g.municipality_id=_municipality_id
    AND g.paid IS TRUE AND g.bank_authenticated_at IS NOT NULL
    AND g.provider_environment='production'
    AND g.payment_provider='mercado_pago'
    AND nullif(g.bank_reference,'') IS NOT NULL
    AND nullif(g.bank_payment_id,'') IS NOT NULL
    AND nullif(g.original_pdf_key,'') IS NOT NULL
    AND g.original_pdf_sha256 ~ '^[a-f0-9]{64}$';

  SELECT count(*) INTO _law_evidence
  FROM public.urban_legal_evidence_catalog e
  WHERE e.municipality_id=_municipality_id
    AND e.confirmed_by_profile_id IS NOT NULL
    AND e.document_sha256 ~ '^[a-f0-9]{64}$'
    AND e.page_number>0
    AND length(btrim(coalesce(e.excerpt,'')))>=12
    AND e.document_title !~* '(^|[ _-])(qa|fictici[ao]|teste)([ _-]|$)';

  -- Do not treat any synthetic QA zone or fake legal reference as official.
  SELECT count(*) INTO _active_rules
  FROM public.urban_regulation_versions v
  WHERE v.municipality_id=_municipality_id
    AND v.status='active'
    AND v.activated_by_profile_id IS NOT NULL
    AND v.effective_from<=current_date
    AND v.zone_code !~* '^QA([_-]|$)'
    AND (CASE WHEN jsonb_typeof(v.rules)='array' THEN jsonb_array_length(v.rules)>0 ELSE false END)
    AND v.rules::text !~* '(lei ficticia|qa sem validade legal|synthetic fixture)';

  -- Historical signed evidence is NOT a new end-to-end municipal acceptance.
  SELECT count(*) FILTER(WHERE s.signer_slot='analise_tecnica'),
         count(*) FILTER(WHERE s.signer_slot='diretoria')
    INTO _analyst_signatures,_director_signatures
  FROM public.signatures s
  WHERE s.municipality_id=_municipality_id
    AND s.status::text='concluido'
    AND s.signed_at IS NOT NULL
    AND s.auth_method='password_reauth'
    AND s.reauthenticated_at IS NOT NULL
    AND s.evidence_version>=4
    AND s.document_hash ~ '^[a-f0-9]{64}$';

  RETURN jsonb_build_object(
    'kind','sigapro.municipal.commercial-readiness.v1',
    'municipalityId',_municipality_id,
    'checkedAt',now(),
    'financialProvider',jsonb_build_object(
      'provider',coalesce(_provider.provider,'not_configured'),
      'environment',coalesce(_provider.environment,'not_configured'),
      'activeAndTestedForProduction',_bank_active
    ),
    'municipalCollection',jsonb_build_object(
      'mode',coalesce(_collection.mode,'not_configured'),
      'environment',coalesce(_collection.environment,'not_configured'),
      'active',coalesce(_collection.status='active',false),
      'integrationType',coalesce(_collection.integration_type,'not_configured'),
      'controlledImportActive',coalesce(
        _collection.mode='municipal_system' AND
        _collection.environment='production' AND
        _collection.status='active' AND
        _collection.integration_type='controlled_import',false)
    ),
    'bankAuthenticatedOriginalsProduction',_paid_evidence,
    'officialLegalEvidenceCount',_law_evidence,
    'activatedNonFixtureUrbanRules',_active_rules,
    'historicalAnalystSignatures',_analyst_signatures,
    'historicalDirectorSignatures',_director_signatures,
    'independentR2ByteAuditVerified',false,
    'newAuthenticatedEndToEndVerified',false,
    'officialMunicipalAcceptanceVerified',false,
    'commercialReleaseCertified',false,
    'note','Indicadores documentais restritos a esta Prefeitura; nao substituem comprovante do banco, recuperacao real do arquivo R2, assinatura municipal vigente ou aceite juridico.'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_municipal_commercial_readiness_v1(uuid)
  FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.get_municipal_commercial_readiness_v1(uuid)
  TO authenticated;
