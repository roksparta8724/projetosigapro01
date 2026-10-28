-- SIGAPRO: isolated QA bank-to-process acceptance.
-- Synthetic accreditation is fully rolled back, never a real payment.
-- Run explicitly on Neon isolated QA branch, not on production.
DO $qa$
DECLARE g public.payment_guides%ROWTYPE; e public.mp_webhook_order_events_v1%ROWTYPE;
 r jsonb; reverted boolean:=false;
BEGIN
 IF current_database()<>'sigapro_migration_stage_20260923'
 THEN RAISE EXCEPTION 'WRONG_QA_DATABASE'; END IF;
 SELECT pg.* INTO g FROM public.payment_guides pg
 JOIN public.mp_qa_pix_orders_v1 o ON o.guide_id=pg.id
 JOIN public.processes pr ON pr.id=pg.process_id
 WHERE pg.guide_number LIKE 'DAM-PRE-QA-%'
 AND pg.provider_environment='test' AND pg.payment_provider='mercado_pago'
 AND pg.collection_mode_snapshot='sigapro' AND NOT coalesce(pg.paid,false)
 AND pr.officialized_at IS NULL AND pg.original_pdf_key IS NOT NULL
 AND pg.original_pdf_sha256 ~ '^[a-f0-9]{64}$'
 AND pg.document_snapshot IS NOT NULL
 AND coalesce(pg.document_snapshot #>> '{guia,nonPayablePreview}','false')<>'true'
 AND pg.original_pdf_key='municipalities/'||pg.municipality_id||
   '/processes/'||pg.process_id||'/dam-originals/'||pg.id||'/'||
   pg.original_pdf_sha256||'.pdf'
 AND o.municipality_id=pg.municipality_id AND o.state='issued'
 AND o.order_id=pg.bank_reference AND o.payment_id=pg.bank_payment_id
 AND o.amount=pg.amount AND o.qr_code=pg.pix_code
 LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'QA_ARCHIVED_GUIDE_REQUIRED'; END IF;
 SELECT * INTO e FROM public.mp_webhook_order_events_v1
 WHERE municipality_id=g.municipality_id AND order_id=g.bank_reference
 AND signature_verified=true ORDER BY first_received_at DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'QA_SIGNED_EVENT_REQUIRED'; END IF;
 BEGIN
  UPDATE public.mp_webhook_order_events_v1
  SET provider_fetch_succeeded=true,provider_status='processed',currency='BRL',
      provider_amount=g.amount,external_reference=g.guide_number,
      reconciliation_status='verified_manual_review',guide_id=g.id
  WHERE id=e.id;
  -- Reject incorrect value, other municipality, pending credit, nonexistent
  -- event. DB check already forbids creating an unsigned signed-event row.
  r:=public.mp_qa_webhook_settle_v1(e.id,g.municipality_id,g.bank_reference,
    g.bank_payment_id,g.amount+0.01,'accredited','processed','accredited',g.amount,g.amount);
  IF r->>'status'<>'manual_review' THEN RAISE EXCEPTION 'WRONG_AMOUNT_ACCEPTED'; END IF;
  r:=public.mp_qa_webhook_settle_v1(e.id,
    '00000000-0000-4000-8000-000000000001'::uuid,
    g.bank_reference,g.bank_payment_id,g.amount,
    'accredited','processed','accredited',g.amount,g.amount);
  IF r->>'status'<>'manual_review' THEN RAISE EXCEPTION 'FOREIGN_TENANT_ACCEPTED'; END IF;
  r:=public.mp_qa_webhook_settle_v1(e.id,g.municipality_id,g.bank_reference,
    g.bank_payment_id,g.amount,'pending','processed','accredited',g.amount,g.amount);
  IF r->>'status'<>'manual_review' THEN RAISE EXCEPTION 'PENDING_PAYMENT_ACCEPTED'; END IF;
  r:=public.mp_qa_webhook_settle_v1(
    '00000000-0000-4000-8000-000000000002'::uuid,
    g.municipality_id,g.bank_reference,g.bank_payment_id,g.amount,
    'accredited','processed','accredited',g.amount,g.amount);
  IF r->>'status'<>'manual_review' THEN RAISE EXCEPTION 'MISSING_SIGNED_RECEIPT_ACCEPTED'; END IF;
  IF EXISTS(SELECT 1 FROM public.payment_guides WHERE id=g.id AND paid)
  THEN RAISE EXCEPTION 'NEGATIVE_TEST_SETTLED'; END IF;
  r:=public.mp_qa_webhook_settle_v1(e.id,g.municipality_id,g.bank_reference,
    g.bank_payment_id,g.amount,'accredited','processed','accredited',g.amount,g.amount);
  IF r->>'status'<>'settled_qa' THEN RAISE EXCEPTION 'QA_SETTLEMENT_FAILED %',r; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.payment_guides
    WHERE id=g.id AND paid AND status='compensada')
  THEN RAISE EXCEPTION 'GUIDE_NOT_SETTLED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.mp_qa_settlement_evidence_v1
    WHERE guide_id=g.id AND provider_order_id=g.bank_reference
    AND provider_payment_id=g.bank_payment_id
    AND original_pdf_sha256=g.original_pdf_sha256)
  THEN RAISE EXCEPTION 'BANK_EVIDENCE_NOT_AUDITED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.processes
    WHERE id=g.process_id AND officialized_at IS NOT NULL
    AND officialized_by_payment_guide_id=g.id
    AND status::text='triagem' AND protocol_number IS NOT NULL)
  THEN RAISE EXCEPTION 'PROCESS_NOT_OFFICIALIZED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.process_movements
    WHERE process_id=g.process_id AND movement_type='processo_oficializado'
    AND to_status='triagem')
  THEN RAISE EXCEPTION 'OFFICIALIZATION_HISTORY_MISSING'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.process_audit_entries
    WHERE process_id=g.process_id AND category='protocolo'
    AND title='Processo municipal criado apos pagamento')
  THEN RAISE EXCEPTION 'PROCESS_AUDIT_MISSING'; END IF;
  r:=public.mp_qa_webhook_settle_v1(e.id,g.municipality_id,g.bank_reference,
    g.bank_payment_id,g.amount,'accredited','processed','accredited',g.amount,g.amount);
  IF r->>'status'<>'already_settled_qa'
  THEN RAISE EXCEPTION 'DUPLICATE_PAYMENT_NOT_IDEMPOTENT'; END IF;
  RAISE EXCEPTION 'QA_ROLLBACK_INTENTIONAL';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'QA_ROLLBACK_INTENTIONAL' THEN RAISE; END IF;
  reverted:=true;
 END;
 IF NOT reverted OR EXISTS(SELECT 1 FROM public.payment_guides
    WHERE id=g.id AND paid=true)
 OR EXISTS(SELECT 1 FROM public.mp_qa_settlement_evidence_v1 WHERE guide_id=g.id)
 OR EXISTS(SELECT 1 FROM public.processes
    WHERE id=g.process_id AND officialized_at IS NOT NULL)
 THEN RAISE EXCEPTION 'SYNTHETIC_QA_PAYMENT_LEAKED'; END IF;
 RAISE NOTICE 'PASS QA rollback: wrong amount, cross-tenant, pending and missing event refused; paid, audited, officialized and replay idempotent; no state persisted';
END $qa$;