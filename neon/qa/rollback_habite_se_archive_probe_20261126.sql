-- QA only. Use an existing issued test fixture, roll back all archive activity.
DO $$
DECLARE h public.process_habite_se_permits; p public.processes; subject text; outcome jsonb; initial_movements bigint; after_movements bigint; chosen uuid; signed_form jsonb;
BEGIN
 SELECT * INTO h FROM public.process_habite_se_permits WHERE status='emitido' LIMIT 1;
 IF h.id IS NULL THEN RAISE EXCEPTION 'Missing issued QA Habite-se fixture'; END IF;
 SELECT * INTO p FROM public.processes WHERE id=h.process_id;
 SELECT i.provider_user_id INTO subject FROM public.profile_auth_identities i WHERE i.profile_id=h.director_profile_id AND i.provider='neon' AND i.is_active LIMIT 1;
 IF subject IS NULL THEN RAISE EXCEPTION 'Missing authorized director QA fixture'; END IF;
 SELECT count(*) INTO initial_movements FROM public.process_movements WHERE process_id=p.id;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',subject)::text,true);
 chosen:=private.issued_habite_se_signature_block_v1(p.id);
 IF chosen IS NULL THEN RAISE EXCEPTION 'Canonical issuance missing'; END IF;
 SELECT artifact_payload->'formData' INTO signed_form FROM public.signature_blocks WHERE id=chosen;
 outcome:=public.get_habite_se_permit_v1(p.id);
 IF outcome->'permit'->'form_data' IS DISTINCT FROM signed_form THEN RAISE EXCEPTION 'Read did not use signed version'; END IF;
 BEGIN
  outcome:=public.complete_habite_se_process_v1(p.id);
  IF outcome->>'ok' IS DISTINCT FROM 'true' OR outcome->>'status' IS DISTINCT FROM 'arquivado' THEN RAISE EXCEPTION 'Completion not confirmed'; END IF;
  outcome:=public.complete_habite_se_process_v1(p.id);
  IF outcome->>'already_completed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Completion not idempotent'; END IF;
  SELECT count(*) INTO after_movements FROM public.process_movements WHERE process_id=p.id;
  IF after_movements<>initial_movements+1 THEN RAISE EXCEPTION 'Unexpected number of movements'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.process_habite_se_permits x WHERE x.id=h.id AND x.form_data=h.form_data) OR NOT EXISTS(SELECT 1 FROM public.signature_blocks x WHERE x.id=chosen AND x.artifact_payload->'formData'=signed_form) THEN RAISE EXCEPTION 'Document mutated'; END IF;
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='rollback QA habite-se completion';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
 END;
 IF NOT EXISTS(SELECT 1 FROM public.processes x WHERE x.id=p.id AND x.status=p.status AND x.archived_at IS NOT DISTINCT FROM p.archived_at) OR (SELECT count(*) FROM public.process_movements WHERE process_id=p.id)<>initial_movements THEN RAISE EXCEPTION 'QA rollback not preserved'; END IF;
END $$;
