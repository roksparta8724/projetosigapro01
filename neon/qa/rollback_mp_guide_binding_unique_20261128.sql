-- Isolated QA only: exercise actual indexes and trigger, then roll back.
DO $test$
DECLARE bound public.payment_guides; vacant public.payment_guides; n bigint; idx text; rejected boolean;
BEGIN
 SELECT * INTO bound FROM public.payment_guides
 WHERE payment_provider='mercado_pago' AND provider_environment='test' AND paid=false
 AND lower(status) IN ('pendente','pending','aguardando_pagamento')
 AND bank_reference IS NOT NULL AND bank_payment_id IS NOT NULL
 AND document_snapshot IS NULL AND original_pdf_key IS NULL LIMIT 1;
 IF bound.id IS NULL THEN RAISE EXCEPTION 'Missing QA bound fixture'; END IF;
 SELECT * INTO vacant FROM public.payment_guides WHERE municipality_id=bound.municipality_id
 AND id<>bound.id AND paid=false AND lower(status) IN ('pendente','pending','aguardando_pagamento')
 AND bank_reference IS NULL AND bank_payment_id IS NULL AND document_snapshot IS NULL AND original_pdf_key IS NULL LIMIT 1;
 IF vacant.id IS NULL THEN RAISE EXCEPTION 'Missing QA unbound fixture'; END IF;
 SELECT count(*) INTO n FROM public.payment_guides;
 BEGIN
  BEGIN
   UPDATE public.payment_guides SET payment_provider='mercado_pago',provider_environment='test',bank_reference=bound.bank_reference WHERE id=vacant.id;
   RAISE EXCEPTION 'Duplicate order accepted';
  EXCEPTION WHEN unique_violation THEN
   GET STACKED DIAGNOSTICS idx=CONSTRAINT_NAME;
   IF idx<>'payment_guides_mp_order_unique_v1' THEN RAISE; END IF;
  END;
  BEGIN
   UPDATE public.payment_guides SET payment_provider='mercado_pago',provider_environment='test',bank_reference='SIGAPRO-QA-TEST-'||vacant.id::text,bank_payment_id=bound.bank_payment_id WHERE id=vacant.id;
   RAISE EXCEPTION 'Duplicate payment accepted';
  EXCEPTION WHEN unique_violation THEN
   GET STACKED DIAGNOSTICS idx=CONSTRAINT_NAME;
   IF idx<>'payment_guides_mp_payment_unique_v1' THEN RAISE; END IF;
  END;
  BEGIN
   UPDATE public.payment_guides SET bank_payment_id='SIGAPRO-QA-REPLACEMENT' WHERE id=bound.id;
   RAISE EXCEPTION 'Replacement payment accepted';
  EXCEPTION WHEN check_violation THEN
   IF SQLERRM<>'Vínculo bancário Mercado Pago imutável' THEN RAISE; END IF;
  END;
  BEGIN
   UPDATE public.payment_guides SET bank_reference=NULL WHERE id=bound.id;
   RAISE EXCEPTION 'Order removal accepted';
  EXCEPTION WHEN check_violation THEN
   IF SQLERRM<>'Vínculo bancário Mercado Pago imutável' THEN RAISE; END IF;
  END;
  UPDATE public.payment_guides SET payment_provider='mercado_pago',provider_environment='test',bank_reference='SIGAPRO-QA-TEST-'||vacant.id::text WHERE id=vacant.id;
  UPDATE public.payment_guides SET bank_payment_id='SIGAPRO-QA-PAY-'||vacant.id::text WHERE id=vacant.id;
  UPDATE public.payment_guides SET bank_payment_id='SIGAPRO-QA-PAY-'||vacant.id::text WHERE id=vacant.id;
  IF NOT EXISTS(SELECT 1 FROM public.payment_guides WHERE id=vacant.id AND bank_payment_id='SIGAPRO-QA-PAY-'||vacant.id::text AND paid=false) THEN RAISE EXCEPTION 'First payment ID not retained'; END IF;
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='rollback bank binding fixtures';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
 END;
 IF (SELECT count(*) FROM public.payment_guides)<>n OR NOT EXISTS(SELECT 1 FROM public.payment_guides WHERE id=vacant.id AND bank_reference IS NULL AND bank_payment_id IS NULL) OR NOT EXISTS(SELECT 1 FROM public.payment_guides WHERE id=bound.id AND bank_reference=bound.bank_reference AND bank_payment_id=bound.bank_payment_id) THEN RAISE EXCEPTION 'Rollback not verified'; END IF;
END $test$;
