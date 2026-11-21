-- Municipal legislation belongs to the municipality; process workflow stays read-only.
-- Master retains read access; no records are deleted and no AI rules activated.
BEGIN;
DO $change$
DECLARE r record; definition text; revised text; count_functions integer:=0;
BEGIN
 FOR r IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n
 ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN
 ('register_urban_legislation_document_v1','set_urban_legislation_archive_v1',
  'can_manage_urban_legislation_registry_v1')
 LOOP
  count_functions:=count_functions+1;
  definition:=pg_get_functiondef(r.oid);
  IF (length(definition)-length(replace(definition,'public.is_master()','')))/length('public.is_master()') <> 1
  THEN RAISE EXCEPTION 'Unexpected legislation RPC body: %',r.proname; END IF;
  revised:=replace(definition,'public.is_master()',
   '(public.current_role_code() = ''prefeitura_admin'' AND public.has_tenant_access(_municipality_id))');
  EXECUTE revised;
 END LOOP;
 IF count_functions<>3 THEN RAISE EXCEPTION 'Legislation RPCs missing, no permission changes applied'; END IF;
END;
$change$;
NOTIFY pgrst,'reload schema';
COMMIT;
