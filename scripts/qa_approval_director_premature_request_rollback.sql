-- QA-only; uses an existing assigned analyst and protocol-stage process.
-- Simulates JWT identity via SQL; does NOT authenticate a real browser session.
-- The saved draft and all audit writes are reverted in a nested subtransaction.
DO $qa$
DECLARE proc uuid; analyst text; stage_valid boolean:=false; blocked boolean:=false; saved jsonb;
BEGIN
 SELECT pr.id,ai.provider_user_id INTO proc,analyst
 FROM public.processes pr
 JOIN public.profiles p ON p.id=pr.analysis_assigned_to_profile_id
 JOIN public.profile_auth_identities ai ON ai.profile_id=p.id AND ai.provider='neon' AND ai.is_active
 WHERE pr.municipality_id='49dac0b6-6352-4744-9aab-9ff91c59d970'::uuid
 AND lower(pr.process_type) LIKE '%aprova%'
 AND pr.current_department='Setor de Protocolo'
 AND NOT EXISTS(SELECT 1 FROM public.signature_blocks sb WHERE sb.process_id=pr.id
   AND sb.artifact_type='urban_analysis_checklist' AND sb.status='concluido')
 LIMIT 1;
 IF proc IS NULL OR analyst IS NULL THEN RAISE EXCEPTION 'No preliminary approval actor in QA'; END IF;
 BEGIN
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',analyst)::text,true);
   saved:=public.save_construction_permit_draft_v1(proc,'QA-NO-APPROVAL-ROLLBACK','{"qa":true}'::jsonb);
   stage_valid:=(saved->>'ok'='true');
   BEGIN
     PERFORM public.request_construction_permit_director_signature_v1(proc);
     RAISE EXCEPTION 'UNREVIEWED_SIGNATURE_REQUEST_ACCEPTED';
   EXCEPTION WHEN OTHERS THEN
     IF SQLERRM='UNREVIEWED_SIGNATURE_REQUEST_ACCEPTED' THEN RAISE; END IF;
     IF SQLERRM ILIKE '%Ficha Oficial de Análise%' THEN blocked:=true;
     ELSE RAISE EXCEPTION 'Unexpected stage failure: %',SQLERRM; END IF;
   END;
   RAISE EXCEPTION 'QA_ROLLBACK_EARLY_PERMIT_DRAFT';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM<>'QA_ROLLBACK_EARLY_PERMIT_DRAFT' THEN RAISE; END IF;
 END;
 PERFORM set_config('request.jwt.claims','',true);
 IF NOT(stage_valid AND blocked) THEN RAISE EXCEPTION 'Workflow pre-signature gate test failed'; END IF;
 IF EXISTS(SELECT 1 FROM public.process_construction_permits WHERE process_id=proc)
 THEN RAISE EXCEPTION 'QA draft persisted despite rollback'; END IF;
END $qa$;
