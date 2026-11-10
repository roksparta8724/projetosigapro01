-- SIGAPRO QA security: prevent prefeitura admin writes to ANY process-owned rows.
-- Additive/idempotent; effective authorization still requires Neon RPC + RLS.
-- Apply only to an isolated QA branch before separately approving production.
BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_municipal_admin_process_write_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE
  _role text := lower(coalesce(public.current_role_code(),''));
BEGIN
  IF _role IN ('prefeitura_admin','admin_prefeitura','admin_municipality') THEN
    RAISE EXCEPTION USING
      ERRCODE='42501',
      MESSAGE='Administrador da Prefeitura possui acesso somente de leitura aos processos.';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

DO $guard$
DECLARE
  _table text;
  _tables constant text[]:=ARRAY[
    'processes',
    'payment_guides',
    'process_documents',
    'process_requirements',
    'process_messages',
    'process_movements',
    'process_audit_entries',
    'interdepartmental_dispatches',
    'calculation_snapshots',
    'integration_sync_runs',
    'notifications',
    'process_analysis_sheets',
    'process_artifact_withdrawal_events',
    'process_artifact_withdrawals',
    'process_construction_permits',
    'process_habite_se_inspection_photos',
    'process_habite_se_inspections',
    'process_habite_se_permits',
    'process_markers',
    'process_parties',
    'process_party_private_data',
    'process_reopen_history',
    'process_signature_requests',
    'process_urban_precheck_runs',
    'profile_process_archives',
    'qa_verified_document_provenance_v1',
    'signature_blocks'
  ];
BEGIN
  FOREACH _table IN ARRAY _tables LOOP
    IF to_regclass(format('public.%I',_table)) IS NULL THEN
      RAISE EXCEPTION 'Process-owned table missing: %',_table;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger tr
      JOIN pg_catalog.pg_class cl ON cl.oid=tr.tgrelid
      JOIN pg_catalog.pg_namespace ns ON ns.oid=cl.relnamespace
      WHERE ns.nspname='public' AND cl.relname=_table
        AND tr.tgname='municipal_admin_process_readonly_v1'
        AND NOT tr.tgisinternal
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER municipal_admin_process_readonly_v1
         BEFORE INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.prevent_municipal_admin_process_write_v1()',
         _table
      );
    END IF;
  END LOOP;
END;
$guard$;

COMMIT;
