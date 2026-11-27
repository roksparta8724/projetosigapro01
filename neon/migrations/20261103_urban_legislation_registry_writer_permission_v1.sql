-- Master and municipal supervisor may register legislation; prefeitura_admin remains read-only.
BEGIN;
CREATE OR REPLACE FUNCTION public.can_manage_urban_legislation_registry_v1(
 _municipality_id uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog','public' SET row_security TO 'off'
AS $fn$
 SELECT _municipality_id IS NOT NULL AND
  public.current_profile_id() IS NOT NULL AND
  (public.is_master() OR
   (public.has_tenant_access(_municipality_id) AND
    public.current_role_code()='prefeitura_supervisor'));
$fn$;
REVOKE ALL ON FUNCTION public.can_manage_urban_legislation_registry_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_urban_legislation_registry_v1(uuid) TO authenticated;
COMMIT;
