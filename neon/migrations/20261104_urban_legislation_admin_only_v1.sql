-- SIGAPRO / 2026-11-04
-- Restrict the urban legislation registry:
-- VIEW: platform Master, or Admin Prefeitura for their own municipality.
-- WRITE (register / archive / signed upload): platform Master only.
-- Never grant analyst, supervisor/director, finance, fiscal, external or owner access.
-- Legacy document storage and per-tenant immutable records remain untouched.
BEGIN;
DO $restrict_legislation$
DECLARE
  _f record;
  _definition text;
  _updated text;
BEGIN
  FOR _f IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'list_urban_legislation_documents_v1',
        'register_urban_legislation_document_v1',
        'set_urban_legislation_archive_v1',
        'can_manage_urban_legislation_registry_v1'
      )
    ORDER BY p.proname
  LOOP
    _definition := pg_get_functiondef(_f.oid);
    IF _f.proname = 'list_urban_legislation_documents_v1' THEN
      _updated := replace(
        _definition,
        'public.is_internal_municipality_role()',
        'public.current_role_code()=''prefeitura_admin'''
      );
    ELSE
      _updated := regexp_replace(
        _definition,
        'public\.is_master\(\)\s+OR\s+\(public\.has_tenant_access\(_municipality_id\)\s+AND\s+public\.current_role_code\(\)=''prefeitura_supervisor''\)',
        'public.is_master()',
        'g'
      );
    END IF;

    IF _updated = _definition THEN
      RAISE EXCEPTION 'Legislation access migration could not safely update %', _f.proname;
    END IF;
    EXECUTE _updated;
  END LOOP;

  IF (SELECT count(*) FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'list_urban_legislation_documents_v1',
        'register_urban_legislation_document_v1',
        'set_urban_legislation_archive_v1',
        'can_manage_urban_legislation_registry_v1'
      )) <> 4 THEN
    RAISE EXCEPTION 'Legislation access migration missing one or more required functions';
  END IF;
END;
$restrict_legislation$;
NOTIFY pgrst, 'reload schema';
COMMIT;
