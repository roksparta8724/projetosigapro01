-- Plan usage cards: isolated by the authenticated master/municipal administrative role.
-- Process counts align with the enforcement trigger (all non-archived processes),
-- rather than the narrower official-only figure exposed in the legacy snapshot.
CREATE OR REPLACE FUNCTION public.list_plan_usage_dashboard_v1(_municipality_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
SET row_security TO 'off'
AS $function$
DECLARE
  _actor uuid := public.current_profile_id();
  _master boolean := public.is_master();
  _role text := lower(coalesce(public.current_role_code(),''));
  _tenant_id uuid;
  _snapshot jsonb;
  _process_count bigint;
  _result jsonb := '[]'::jsonb;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'Sessao autenticada obrigatoria para consultar os limites do plano.';
  END IF;
  IF NOT _master AND (
    _municipality_id IS NULL
    OR _role NOT IN ('prefeitura_admin','prefeitura_supervisor')
    OR NOT public.has_tenant_access(_municipality_id)
  ) THEN
    RAISE EXCEPTION 'Consulta de plano restrita a administracao da propria Prefeitura.';
  END IF;
  FOR _tenant_id IN
    SELECT m.id FROM public.municipalities m
    WHERE _municipality_id IS NULL OR m.id=_municipality_id
    ORDER BY m.id
    LIMIT 1000
  LOOP
    IF NOT _master AND NOT public.has_tenant_access(_tenant_id) THEN
      RAISE EXCEPTION 'Prefeitura fora do escopo autorizado.';
    END IF;
    _snapshot := public.municipality_plan_entitlements_v1(_tenant_id);
    SELECT count(*) INTO _process_count FROM public.processes p
    WHERE coalesce(p.municipality_id,p.tenant_id)=_tenant_id
      AND p.archived_at IS NULL;
    _snapshot := jsonb_set(_snapshot,'{usage,processes}',to_jsonb(_process_count),true);
    _result := _result || jsonb_build_array(_snapshot);
  END LOOP;
  RETURN _result;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_plan_usage_dashboard_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_plan_usage_dashboard_v1(uuid) TO authenticated;
