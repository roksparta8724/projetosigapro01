-- READ-ONLY QA acceptance: real Postgres policies with simulated request
-- claims from existing *isolated QA* identities. No credentials, uploads,
-- payments, inserts, updates, deletes or writes to any application table.
-- IMPORTANT: this does not prove signed browser login or S3 end-to-end I/O.
DO $qa$
DECLARE
  actor record;
  other_subject text;
  allowed_principals text[];
  matched boolean := false;
BEGIN
  IF current_database() <> 'sigapro_migration_stage_20260923' THEN
    RAISE EXCEPTION 'Wrong database: document access acceptance is QA only';
  END IF;

  FOR actor IN
    SELECT proc.id AS process_id,
      coalesce(proc.municipality_id,proc.tenant_id) AS tenant_id,
      p.id AS creator_profile_id,
      pai.provider_user_id AS subject_id
    FROM public.processes proc
    JOIN public.profiles p ON p.id=proc.created_by_profile_id
    JOIN public.profile_auth_identities pai ON pai.profile_id=p.id
      AND pai.provider='neon' AND pai.is_active=true
    WHERE p.account_status='active' AND p.deleted_at IS NULL
      AND p.municipality_id=coalesce(proc.municipality_id,proc.tenant_id)
  LOOP
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('sub',actor.subject_id)::text,true);
    IF NOT public.qa_storage_process_tenant_access_v1(actor.process_id,actor.tenant_id)
    THEN CONTINUE;
    END IF;
    allowed_principals:=public.qa_storage_recovery_principals_v1(
      actor.process_id,actor.tenant_id);
    IF cardinality(allowed_principals)<1 OR NOT(
      actor.creator_profile_id::text=ANY(allowed_principals))
    THEN
      RAISE EXCEPTION 'QA_POSITIVE_CREATOR_PRINCIPAL_NOT_FOUND';
    END IF;
    matched:=true;
    EXIT;
  END LOOP;
  IF NOT matched THEN
    RAISE EXCEPTION 'No authorized QA creator fixture found';
  END IF;

  -- Test a *different* municipality's existing QA profile. The context
  -- identity is selected only inside this transaction, never printed.
  SELECT pai.provider_user_id INTO other_subject
  FROM public.profiles p
  JOIN public.profile_auth_identities pai ON pai.profile_id=p.id
    AND pai.provider='neon' AND pai.is_active=true
  WHERE p.municipality_id<>actor.tenant_id
    AND p.deleted_at IS NULL AND p.account_status='active'
  LIMIT 1;
  IF other_subject IS NULL THEN
    RAISE EXCEPTION 'Two-municipality QA fixtures required';
  END IF;
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',other_subject)::text,true);
  IF public.qa_storage_process_tenant_access_v1(actor.process_id,actor.tenant_id)
    OR public.has_process_access(actor.process_id)
    OR cardinality(public.qa_storage_recovery_principals_v1(
         actor.process_id,actor.tenant_id))<>0
  THEN
    RAISE EXCEPTION 'QA_CROSS_MUNICIPALITY_ACCESS_LEAK';
  END IF;
  PERFORM set_config('request.jwt.claims','',true);
  RAISE NOTICE 'PASS: authorized QA creator may recover; unrelated municipality denied; no records modified';
END $qa$;
