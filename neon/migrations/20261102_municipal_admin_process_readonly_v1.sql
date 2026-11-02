-- Process mutations must be performed by responsible staff, never Prefeitura admin.
-- Applies at table level even when a SECURITY DEFINER RPC would otherwise accept the role.
CREATE OR REPLACE FUNCTION public.prevent_municipal_admin_process_write_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $$
BEGIN
  IF lower(coalesce(public.current_role_code(), '')) IN ('prefeitura_admin', 'admin_municipality') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Administrador da Prefeitura possui acesso somente de leitura aos processos.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_municipal_admin_process_write_v1() FROM PUBLIC;
DO $$
DECLARE _table text;
BEGIN
  FOREACH _table IN ARRAY ARRAY[
    'processes', 'process_documents', 'process_movements',
    'process_audit_entries', 'interdepartmental_dispatches',
    'payment_guides', 'process_requirements', 'analysis_items',
    'analysis_reports', 'process_annotations', 'process_messages',
    'process_tags', 'process_reviews', 'process_dispatches',
    'document_annotations', 'analysis_sessions', 'process_signatures',
    'process_files'
  ] LOOP
    IF to_regclass(format('public.%I', _table)) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS municipal_admin_process_readonly_v1 ON public.%I', _table);
      EXECUTE format(
        'CREATE TRIGGER municipal_admin_process_readonly_v1 BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_municipal_admin_process_write_v1()',
        _table
      );
    END IF;
  END LOOP;
END;
$$;
