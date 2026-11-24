-- Municipal maintenance: explicit master-owner authorization, private logical backup,
-- no bypass of permanent DAM protections, no external-object deletion or number reuse.
BEGIN;
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE IF NOT EXISTS private.municipal_test_maintenance_backups_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id uuid NOT NULL,
  created_by_profile_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  snapshot jsonb NOT NULL,
  reset_at timestamptz
);
REVOKE ALL ON private.municipal_test_maintenance_backups_v1 FROM PUBLIC, authenticated;

CREATE OR REPLACE FUNCTION public.municipal_test_maintenance_v1(
  _municipality_id uuid, _action text, _backup_id uuid DEFAULT NULL, _confirmation text DEFAULT ''
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public SET row_security TO off
AS $function$
DECLARE
  _actor uuid := public.current_profile_id();
  _municipality public.municipalities%ROWTYPE;
  _ids uuid[]; _guide_ids uuid[]; _signature_ids uuid[];
  _table text; _rows jsonb; _snapshot jsonb := '{}'::jsonb;
  _counts jsonb; _protected integer; _external integer; _legacy integer; _backup uuid;
  _old private.municipal_test_maintenance_backups_v1%ROWTYPE;
  _allowed boolean;
BEGIN
  IF _actor IS NULL OR coalesce(public.current_role_code(),'') NOT IN ('master_admin','admin_master') THEN
    RAISE EXCEPTION 'Operação exclusiva do Master proprietário.';
  END IF;
  IF _action IS NULL OR _action NOT IN ('preview','backup','reset') THEN RAISE EXCEPTION 'Operação inválida.'; END IF;
  IF _action='preview' THEN
    SELECT * INTO _municipality FROM public.municipalities WHERE id=_municipality_id;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended(_municipality_id::text,0));
    SELECT * INTO _municipality FROM public.municipalities WHERE id=_municipality_id FOR UPDATE;
    PERFORM 1 FROM public.tenants WHERE id=_municipality_id FOR UPDATE;
    PERFORM 1 FROM public.processes WHERE tenant_id=_municipality_id OR municipality_id=_municipality_id FOR UPDATE;
  END IF;
  IF _municipality.id IS NULL OR lower(coalesce(_municipality.subdomain,'')) IN ('','sigapro-plataforma') THEN
    RAISE EXCEPTION 'Selecione uma Prefeitura válida.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.processes WHERE (tenant_id=_municipality_id OR municipality_id=_municipality_id) AND (tenant_id IS DISTINCT FROM _municipality_id OR municipality_id IS DISTINCT FROM _municipality_id)) THEN
    RAISE EXCEPTION 'Existem processos com escopo divergente. Solicite revisão de integridade.';
  END IF;
  SELECT coalesce(array_agg(id ORDER BY id),ARRAY[]::uuid[]) INTO _ids FROM public.processes WHERE tenant_id=_municipality_id AND municipality_id=_municipality_id;
  SELECT coalesce(array_agg(id ORDER BY id),ARRAY[]::uuid[]),
    count(*) FILTER (WHERE original_pdf_key IS NOT NULL OR document_snapshot IS NOT NULL OR coalesce(paid,false) OR lower(coalesce(status,'')) IN ('compensada','paid','pago','confirmed','confirmado')),
    count(*) FILTER (WHERE provider_environment IS NOT NULL OR bank_payment_id IS NOT NULL OR bank_reference IS NOT NULL OR provider_charge_saved_at IS NOT NULL)
    INTO _guide_ids,_protected,_external FROM public.payment_guides WHERE process_id=ANY(_ids);
  SELECT coalesce(array_agg(id ORDER BY id),ARRAY[]::uuid[]) INTO _signature_ids FROM public.signature_blocks WHERE process_id=ANY(_ids);
  SELECT (SELECT count(*) FROM public.imoveis WHERE project_id=ANY(_ids))+
         (SELECT count(*) FROM public.project_documents WHERE project_id=ANY(_ids))+
         (SELECT count(*) FROM public.project_payments WHERE project_id=ANY(_ids))+
         (SELECT count(*) FROM public.municipal_collection_operations WHERE guide_id=ANY(_guide_ids))+
         (SELECT count(*) FROM public.mp_prod_settlement_evidence_v1 WHERE guide_id=ANY(_guide_ids))+
         (SELECT count(*) FROM public.mp_prod_signed_order_receipts_v1 WHERE guide_id=ANY(_guide_ids))
    INTO _legacy;
  _allowed := _municipality.status::text='suspenso' AND cardinality(_ids)>0 AND _protected=0 AND _external=0 AND _legacy=0;
  _counts := jsonb_build_object('municipality_id',_municipality_id,'process_count',cardinality(_ids),
    'document_count',(SELECT count(*) FROM public.process_documents WHERE process_id=ANY(_ids)),
    'guide_count',cardinality(_guide_ids),'protected_guides',_protected,'external_guides',_external,'legacy_links',_legacy,'reset_allowed',_allowed);
  IF _action='preview' THEN RETURN _counts; END IF;
  -- Explicit table allowlist, never include accounts, credentials, legislation or tenant configuration.
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb) INTO _rows FROM public.processes t WHERE id=ANY(_ids);
  _snapshot := jsonb_build_object('processes',_rows);
  FOREACH _table IN ARRAY ARRAY['calculation_snapshots','integration_sync_runs','interdepartmental_dispatches','notifications','payment_guides','process_analysis_sheets','process_artifact_withdrawal_events','process_artifact_withdrawals','process_audit_entries','process_construction_permits','process_documents','process_habite_se_inspection_photos','process_habite_se_inspections','process_habite_se_permits','process_markers','process_messages','process_movements','process_parties','process_party_private_data','process_reopen_history','process_requirements','process_signature_requests','process_unit_completions','process_urban_precheck_runs','profile_process_archives','signature_blocks'] LOOP
    EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::jsonb) FROM public.%I t WHERE process_id=ANY($1)',_table) INTO _rows USING _ids;
    _snapshot := _snapshot || jsonb_build_object(_table,_rows);
  END LOOP;
  FOREACH _table IN ARRAY ARRAY['owner_professional_messages','project_owner_links','project_owner_requests','imoveis','project_documents','project_payments'] LOOP
    EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::jsonb) FROM public.%I t WHERE project_id=ANY($1)',_table) INTO _rows USING _ids;
    _snapshot := _snapshot || jsonb_build_object(_table,_rows);
  END LOOP;
  FOREACH _table IN ARRAY ARRAY['municipal_collection_operations','mp_prod_settlement_evidence_v1','mp_prod_signed_order_receipts_v1'] LOOP
    EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::jsonb) FROM public.%I t WHERE guide_id=ANY($1)',_table) INTO _rows USING _guide_ids;
    _snapshot := _snapshot || jsonb_build_object(_table,_rows);
  END LOOP;
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) INTO _rows FROM public.signatures t WHERE signature_block_id=ANY(_signature_ids);
  _snapshot := _snapshot || jsonb_build_object('signatures',_rows);
  IF _action='backup' THEN
    INSERT INTO private.municipal_test_maintenance_backups_v1(municipality_id,created_by_profile_id,snapshot)
    VALUES(_municipality_id,_actor,_snapshot) RETURNING id INTO _backup;
    RETURN _counts || jsonb_build_object('backup_id',_backup);
  END IF;
  IF NOT _allowed OR _confirmation IS DISTINCT FROM 'REINICIAR '||_municipality.subdomain THEN
    RAISE EXCEPTION 'Reinício bloqueado: suspensão, confirmação e ausência de guias protegidas, referências bancárias e vínculos legados são obrigatórias.';
  END IF;
  SELECT * INTO _old FROM private.municipal_test_maintenance_backups_v1 WHERE id=_backup_id AND municipality_id=_municipality_id AND created_by_profile_id=_actor AND reset_at IS NULL FOR UPDATE;
  IF _old.id IS NULL OR _old.created_at < now()-interval '30 minutes' OR _old.snapshot IS DISTINCT FROM _snapshot THEN
    RAISE EXCEPTION 'Backup ausente, expirado ou desatualizado. Faça nova cópia lógica.';
  END IF;
  -- Non-cascading children first. Existing financial and archive protections remain enabled.
  DELETE FROM public.process_unit_completions WHERE process_id=ANY(_ids);
  DELETE FROM public.process_urban_precheck_runs WHERE process_id=ANY(_ids);
  DELETE FROM public.processes WHERE id=ANY(_ids) AND tenant_id=_municipality_id AND municipality_id=_municipality_id;
  IF EXISTS (SELECT 1 FROM public.processes WHERE tenant_id=_municipality_id OR municipality_id=_municipality_id) THEN
    RAISE EXCEPTION 'Não foi possível confirmar o reinício integral.';
  END IF;
  UPDATE private.municipal_test_maintenance_backups_v1 SET reset_at=now() WHERE id=_old.id;
  RETURN _counts || jsonb_build_object('process_count',0,'document_count',0,'guide_count',0,'reset_allowed',false,'reset_done',true,'backup_id',_old.id);
END
$function$;
REVOKE ALL ON FUNCTION public.municipal_test_maintenance_v1(uuid,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.municipal_test_maintenance_v1(uuid,text,uuid,text) TO authenticated;
COMMIT;
