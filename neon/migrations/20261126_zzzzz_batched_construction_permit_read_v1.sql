-- Batch the same scoped RPC, preserving its exact projection and permission.
CREATE OR REPLACE FUNCTION public.list_visible_construction_permits_v1(_process_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path TO 'pg_catalog','public'
AS $fn$
DECLARE _id uuid; _permit jsonb; _rows jsonb := '[]'::jsonb;
BEGIN
  IF _process_ids IS NULL OR cardinality(_process_ids)>100 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Informe até 100 processos.';
  END IF;
  IF public.current_profile_id() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Perfil autenticado obrigatório.';
  END IF;
  FOR _id IN SELECT DISTINCT x FROM unnest(_process_ids) AS x WHERE x IS NOT NULL LOOP
    IF public.has_process_access(_id) THEN
      _permit:=public.get_construction_permit_v1(_id)->'permit';
      IF _permit IS NOT NULL AND _permit <> 'null'::jsonb THEN
        _rows:=_rows||jsonb_build_array(_permit);
      END IF;
    END IF;
  END LOOP;
  RETURN _rows;
END
$fn$;
REVOKE ALL ON FUNCTION public.list_visible_construction_permits_v1(uuid[]) FROM PUBLIC,anonymous;
GRANT EXECUTE ON FUNCTION public.list_visible_construction_permits_v1(uuid[]) TO authenticated;
