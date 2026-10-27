-- QA ONLY. Simulated current owner; status-only payment transition rolled back.
DO $qa$
DECLARE g public.payment_guides; actor record; denied boolean:=false;
BEGIN
 SELECT * INTO g FROM public.payment_guides WHERE guide_number='DAM-PRE-20261022-7791A2E9'
  AND provider_environment='test' AND status='pendente' AND paid=false
  AND guide_kind='protocolo' LIMIT 1;
 IF g.id IS NULL THEN RAISE EXCEPTION 'QA-only pending guide fixture absent'; END IF;
 SELECT p.id AS profile_id,i.provider_user_id AS subject_id INTO actor
 FROM public.processes pr JOIN public.profiles p ON p.id=pr.created_by_profile_id
 JOIN public.profile_auth_identities i ON i.profile_id=p.id
 WHERE pr.id=g.process_id AND p.account_status='active'
  AND i.provider='neon' AND i.is_active LIMIT 1;
 IF actor.profile_id IS NULL THEN RAISE EXCEPTION 'QA owner missing'; END IF;
 BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor.subject_id)::text,true);
  IF public.current_profile_id() IS DISTINCT FROM actor.profile_id THEN RAISE EXCEPTION 'QA owner JWT mismatch'; END IF;
  UPDATE public.payment_guides SET status='pago' WHERE id=g.id;
  BEGIN
   PERFORM public.update_external_preprotocol_draft_v1(g.process_id,'{}'::jsonb);
   RAISE EXCEPTION 'QA_PAID_DRAFT_BYPASS';
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='QA_PAID_DRAFT_BYPASS'
      OR SQLERRM NOT IN (
        'Guia inicial com pagamento confirmado; edicao do pre-protocolo bloqueada',
        'O processo ja foi oficializado e nao pode mais ser alterado como rascunho'
      ) THEN RAISE; END IF;
  END;
  denied:=true;
  RAISE EXCEPTION 'QA_ROLLBACK_EXPECTED';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'QA_ROLLBACK_EXPECTED' THEN RAISE; END IF;
 END;
 PERFORM set_config('request.jwt.claims','',true);
 IF NOT denied OR NOT EXISTS(SELECT 1 FROM public.payment_guides WHERE id=g.id AND status='pendente' AND paid=false)
 THEN RAISE EXCEPTION 'QA fixture rollback failed'; END IF;
 RAISE NOTICE 'PASS: bank-settled guide cannot edit, QA guide unchanged';
END $qa$;