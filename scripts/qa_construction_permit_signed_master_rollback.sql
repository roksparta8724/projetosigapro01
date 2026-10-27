-- ONLY QA / isolated Neon branch. No permanent change to any signed permit.
-- This SQL uses mapped QA identities via emulated JWT, not a browser login.
DO $test$
DECLARE signed_rec record; actor_sub text; draft_process uuid; analyst_sub text;
 returned jsonb; did_block boolean:=false; did_create boolean:=false;
BEGIN
 SELECT id,process_id,status INTO signed_rec FROM public.process_construction_permits WHERE status='signed' LIMIT 1;
 SELECT ai.provider_user_id INTO actor_sub
 FROM public.profiles p JOIN public.profile_auth_identities ai ON ai.profile_id=p.id
 WHERE p.role::text='admin_master' AND p.account_status='active'
 AND ai.provider='neon' AND ai.is_active LIMIT 1;
 SELECT pr.id,ai.provider_user_id INTO draft_process,analyst_sub
 FROM public.processes pr JOIN public.profiles p ON p.id=pr.analysis_assigned_to_profile_id
 JOIN public.profile_auth_identities ai ON ai.profile_id=p.id AND ai.provider='neon' AND ai.is_active
 WHERE lower(pr.process_type) LIKE '%aprova%'
 AND NOT EXISTS(SELECT 1 FROM public.process_construction_permits cp WHERE cp.process_id=pr.id)
 AND p.role::text='analista' LIMIT 1;
 IF signed_rec.id IS NULL OR actor_sub IS NULL OR draft_process IS NULL OR analyst_sub IS NULL
 THEN RAISE EXCEPTION 'QA signed permit or assigned analyst fixture missing'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor_sub)::text,true);
 BEGIN
   UPDATE public.process_construction_permits SET status='draft',form_data='{"FORGED":true}'::jsonb
     WHERE id=signed_rec.id;
   RAISE EXCEPTION 'QA_SIGNED_ALVARA_OVERWRITTEN';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='QA_SIGNED_ALVARA_OVERWRITTEN' THEN RAISE; END IF;
   IF SQLERRM LIKE 'O Alvará já foi assinado eletronicamente%' THEN did_block:=true; ELSE RAISE; END IF;
 END;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',analyst_sub)::text,true);
 BEGIN
   returned:=public.save_construction_permit_draft_v1(draft_process,
     'QA-NUMBER-ROLLBACK','{"testOnly":true}'::jsonb);
   IF returned->>'ok'<>'true' OR returned#>>'{permit,status}' <> 'draft'
     THEN RAISE EXCEPTION 'Positive draft writer returned invalid result'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.process_construction_permits
     WHERE process_id=draft_process AND status='draft')
     THEN RAISE EXCEPTION 'Draft writer did not persist'; END IF;
   did_create:=true;
   RAISE EXCEPTION 'QA_ROLLBACK_DRAFT_WRITE';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM<>'QA_ROLLBACK_DRAFT_WRITE' THEN RAISE; END IF;
 END;
 IF NOT(did_block AND did_create) THEN RAISE EXCEPTION 'QA approval acceptance incomplete'; END IF;
 IF EXISTS(SELECT 1 FROM public.process_construction_permits WHERE process_id=draft_process)
 OR EXISTS(SELECT 1 FROM public.process_construction_permits
   WHERE id=signed_rec.id AND status<>'signed')
 THEN RAISE EXCEPTION 'QA fixtures changed despite rollback'; END IF;
 PERFORM set_config('request.jwt.claims','',true);
END $test$;
